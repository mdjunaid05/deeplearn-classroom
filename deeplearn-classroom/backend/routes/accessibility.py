"""
Accessibility Routes — /recognize-sign, /recognize-lip, /generate-caption
"""

import time
from flask import Blueprint, request, jsonify

accessibility_bp = Blueprint("accessibility", __name__)

@accessibility_bp.route("/recognize-sign", methods=["POST"])
def recognize_sign():
    """
    Predict sign language gesture.
    Expects JSON: { "sequence": [...] }
    """
    data = request.get_json(silent=True)
    if not data or "sequence" not in data:
        return jsonify({"error": "Missing sequence"}), 400

    try:
        from models.model_loader import predict_sign_language
        # Assuming sequence is a list of 30 frames of 63 landmarks
        sequence = data["sequence"]
        
        # We need a proper shape of 30x63, if mock data, just pad/truncate
        from utils.mediapipe_hands import build_sequence
        seq_processed = build_sequence(sequence)

        result = predict_sign_language(seq_processed)
        return jsonify({
            "status": "success",
            "gesture": result["predicted_label"],
            "confidence": result["confidence"],
        })
    except Exception as e:
        return jsonify({"error": f"Sign recognition failed: {str(e)}"}), 500

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
