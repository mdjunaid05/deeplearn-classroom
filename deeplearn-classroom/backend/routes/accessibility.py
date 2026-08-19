"""
Accessibility Routes — Real ISL Gesture & Word Recognition, Lip Reading, Captioning
"""

import time
import numpy as np
from flask import Blueprint, request, jsonify

accessibility_bp = Blueprint("accessibility", __name__)


@accessibility_bp.route("/api/isl/word-predict", methods=["POST"])
@accessibility_bp.route("/api/isl/predict-word", methods=["POST"])
def isl_word_predict():
    """
    Real ISL (Indian Sign Language) Word & Gesture Recognition endpoint.
    
    1. Decodes camera frame(s)
    2. Runs MediaPipe Hands to detect 21 3D landmarks
    3. Analyzes hand geometry & finger kinematics
    4. Runs ISL CNN Alphabet model on cropped hand
    5. Returns detected hands, 21 landmarks, predicted sign, and confidence score.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    frame_list = data.get("frames") or data.get("sequence") or data.get("images")
    single_image = data.get("image") or data.get("frame")

    if not frame_list and not single_image:
        return jsonify({"error": "No frames or image provided"}), 400

    target_frame = frame_list[-1] if (frame_list and isinstance(frame_list, list) and len(frame_list) > 0) else single_image

    try:
        from utils.mediapipe_hands import (
            detect_hands_and_landmarks,
            classify_hand_geometry,
            crop_hand_image,
        )
        from models.model_loader import predict_isl_alphabet

        # 1. Real MediaPipe hand & landmark detection
        detection = detect_hands_and_landmarks(target_frame)
        hands_detected = detection["hands_detected"]
        landmarks = detection["landmarks"]
        handedness = detection["handedness"]
        bboxes = detection["bboxes"]
        rgb_img = detection["rgb_image"]

        if hands_detected == 0:
            return jsonify({
                "status": "success",
                "language": "ISL",
                "hands_detected": 0,
                "landmarks": [],
                "prediction": "Sign not recognized",
                "confidence": 0.0,
                "message": "No hands detected in camera frame",
                "model_loaded": True,
            }), 200

        # 2. Hand detected! Run Geometric Landmark Classifier for ISL words & gestures
        geom_pred, geom_conf, reason = classify_hand_geometry(landmarks, handedness)

        # 3. Also run ISL Alphabet CNN on cropped hand bounding box
        alpha_pred = None
        alpha_conf = 0.0
        if bboxes and len(bboxes) > 0:
            try:
                cropped = crop_hand_image(rgb_img, bboxes[0], target_size=128)
                alpha_res = predict_isl_alphabet(cropped)
                if alpha_res and alpha_res.get("prediction") != "Sign not recognized":
                    alpha_pred = alpha_res.get("prediction")
                    alpha_conf = alpha_res.get("confidence", 0.0)
            except Exception as e:
                print(f"[ISL Alphabet CNN] Inference warning: {e}")

        # 4. Integrate prediction based on confidence
        final_prediction = "Sign not recognized"
        final_confidence = 0.0

        if geom_pred and geom_conf >= 0.70:
            final_prediction = geom_pred
            final_confidence = geom_conf
        elif alpha_pred and alpha_conf >= 0.75:
            final_prediction = alpha_pred
            final_confidence = alpha_conf
        elif geom_pred and geom_conf >= 0.50:
            final_prediction = geom_pred
            final_confidence = geom_conf
        elif alpha_pred and alpha_conf >= 0.50:
            final_prediction = alpha_pred
            final_confidence = alpha_conf

        return jsonify({
            "status": "success",
            "language": "ISL",
            "hands_detected": hands_detected,
            "landmarks": landmarks,
            "handedness": handedness,
            "bboxes": bboxes,
            "prediction": final_prediction,
            "confidence": float(round(final_confidence, 3)),
            "model_loaded": True,
        }), 200

    except Exception as e:
        print(f"[ISL Error] Recognition failed: {e}")
        return jsonify({"error": f"ISL recognition failed: {str(e)}"}), 500


@accessibility_bp.route("/api/isl/predict", methods=["POST"])
def isl_predict():
    """
    ISL Alphabet & Landmark Prediction endpoint.
    """
    try:
        data = request.get_json(silent=True)
        image_data = None
        if data and "image" in data:
            image_data = data["image"]
        elif "image" in request.files:
            image_data = request.files["image"].read()

        if image_data is None:
            return jsonify({"error": "No image provided"}), 400

        from utils.mediapipe_hands import detect_hands_and_landmarks, crop_hand_image
        from models.model_loader import predict_isl_alphabet

        detection = detect_hands_and_landmarks(image_data)
        if detection["hands_detected"] == 0:
            return jsonify({
                "language": "ISL",
                "hands_detected": 0,
                "landmarks": [],
                "prediction": "Sign not recognized",
                "confidence": 0.0,
            }), 200

        # Crop detected hand for alphabet CNN
        cropped = crop_hand_image(detection["rgb_image"], detection["bboxes"][0], target_size=128)
        result = predict_isl_alphabet(cropped)
        result["hands_detected"] = detection["hands_detected"]
        result["landmarks"] = detection["landmarks"]

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": f"ISL prediction failed: {str(e)}"}), 500


@accessibility_bp.route("/recognize-sign", methods=["POST"])
def recognize_sign():
    """
    Predict ISL sign language gesture.
    """
    return isl_word_predict()


@accessibility_bp.route("/recognize-lip", methods=["POST"])
def recognize_lip():
    """
    Predict lip state.
    """
    data = request.get_json(silent=True)
    if not data or "image_array" not in data:
        return jsonify({"error": "Missing image_array"}), 400

    try:
        from models.model_loader import predict_lip_reading
        image_array = data["image_array"]
        result = predict_lip_reading(image_array)
        return jsonify({
            "status": "success",
            "lip_state": result["predicted_label"],
            "confidence": result["confidence"],
        })
    except Exception as e:
        return jsonify({"error": f"Lip reading failed: {str(e)}"}), 500


@accessibility_bp.route("/generate-caption", methods=["POST"])
def generate_caption():
    """
    Generate and format caption.
    """
    data = request.get_json(silent=True)
    if not data or "text" not in data:
        return jsonify({"error": "Missing text"}), 400

    try:
        from utils.caption_generator import format_caption
        text = data["text"]
        t = data.get("timestamp", time.time())
        formatted = format_caption(text, t)
        return jsonify({
            "status": "success",
            "caption": text,
            "formatted_timestamp": formatted,
        })
    except Exception as e:
        return jsonify({"error": f"Caption generation failed: {str(e)}"}), 500
