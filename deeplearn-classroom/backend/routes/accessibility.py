"""
Accessibility Routes — /recognize-sign, /recognize-lip, /generate-caption, /api/isl/predict
"""

import time
import numpy as np
from flask import Blueprint, request, jsonify

accessibility_bp = Blueprint("accessibility", __name__)

@accessibility_bp.route("/recognize-sign", methods=["POST"])
def recognize_sign():
    """
    Predict ISL sign language gesture.
    Accepts JSON: { "sequence": [...] } or { "image": "<base64>" }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    try:
        # New ISL image-based prediction
        if "image" in data:
            from models.model_loader import predict_isl_alphabet
            from utils.mediapipe_hands import preprocess_image_for_isl
            image = preprocess_image_for_isl(data["image"])
            result = predict_isl_alphabet(image)
            return jsonify({
                "status": "success",
                "language": "ISL",
                "gesture": result["prediction"],
                "confidence": result["confidence"],
            })

        # Legacy sequence-based prediction (backward compat)
        if "sequence" not in data:
            return jsonify({"error": "Missing 'image' or 'sequence'"}), 400

        from models.model_loader import predict_sign_language
        from utils.mediapipe_hands import build_sequence
        seq_processed = build_sequence(data["sequence"])
        result = predict_sign_language(seq_processed)
        return jsonify({
            "status": "success",
            "language": "ISL",
            "gesture": result.get("prediction", result.get("predicted_label", "Sign not recognized")),
            "confidence": result.get("confidence", 0.0),
        })
    except Exception as e:
        return jsonify({"error": f"Sign recognition failed: {str(e)}"}), 500


@accessibility_bp.route("/api/isl/predict", methods=["POST"])
def isl_predict():
    """
    ISL alphabet prediction endpoint.

    Input:
      - JSON: { "image": "<base64 image data>" }
      - Or file upload: form-data with key "image"

    Output:
      {
        "language": "ISL",
        "prediction": "A",
        "confidence": 0.94
      }
    """
    try:
        from models.model_loader import predict_isl_alphabet
        from utils.mediapipe_hands import preprocess_image_for_isl

        image_data = None

        # Check for JSON body
        data = request.get_json(silent=True)
        if data and "image" in data:
            image_data = data["image"]

        # Check for file upload
        if image_data is None and "image" in request.files:
            image_data = request.files["image"].read()

        if image_data is None:
            return jsonify({"error": "No image provided. Send base64 JSON or file upload."}), 400

        processed = preprocess_image_for_isl(image_data)
        result = predict_isl_alphabet(processed)

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": f"ISL prediction failed: {str(e)}"}), 500


@accessibility_bp.route("/api/isl/word-predict", methods=["POST"])
@accessibility_bp.route("/api/isl/predict-word", methods=["POST"])
def isl_word_predict():
    """
    ISL Word Prediction endpoint.
    Accepts:
      - JSON: { "frames": ["<base64>", "<base64>", ...] } (temporal frame sequence)
      - JSON: { "sequence": [...] }
      - Multipart file upload: "video" form-data (.mp4, .mov, etc.)
    
    Returns:
      {
        "language": "ISL",
        "prediction": "HELLO",
        "confidence": 0.94
      }
    """
    try:
        from models.model_loader import predict_isl_word
        from utils.mediapipe_hands import extract_video_frames, preprocess_frame_sequence_for_isl

        frames = None

        # Check for JSON body
        data = request.get_json(silent=True)
        if data:
            frame_list = data.get("frames") or data.get("sequence") or data.get("images")
            if frame_list and isinstance(frame_list, list):
                frames = preprocess_frame_sequence_for_isl(frame_list, max_frames=8, img_size=128)

        # Check for video file upload
        if frames is None and "video" in request.files:
            video_bytes = request.files["video"].read()
            frames = extract_video_frames(video_bytes, max_frames=8, img_size=128)

        if frames is None:
            return jsonify({
                "error": "No frames or video provided. Send JSON with 'frames': [<base64>, ...] or multipart file 'video'."
            }), 400

        result = predict_isl_word(frames)
        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": f"ISL word prediction failed: {str(e)}"}), 500


@accessibility_bp.route("/recognize-lip", methods=["POST"])
def recognize_lip():
    """
    Predict lip state.
    Expects JSON: { "image_array": [...] }
    """
    data = request.get_json(silent=True)
    if not data or "image_array" not in data:
        return jsonify({"error": "Missing image_array"}), 400

    try:
        from models.model_loader import predict_lip_reading
        # Ensure image_array can be cast to (64, 64, 1)
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
    Expects JSON: { "text": "...", "timestamp": 12.5 }
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
