"""
Prediction Routes — /predict-difficulty, /predict-engagement
"""

from flask import Blueprint, request, jsonify

predict_bp = Blueprint("predict", __name__)


@predict_bp.route("/predict-difficulty", methods=["POST"])
def predict_difficulty():
    """
    Predict recommended difficulty level for a student.

    Expects JSON:
    {
        "quiz_score": 75.0,
        "time_taken": 120.5,
        "attempt_count": 2,
        "completion_rate": 0.85,
        "prev_score": 68.0
    }

    Returns JSON with predicted label and confidence scores.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    required = ["quiz_score", "time_taken", "attempt_count",
                "completion_rate", "prev_score"]
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    # Validate numeric types
    for key in required:
        try:
            data[key] = float(data[key])
        except (ValueError, TypeError):
            return jsonify({"error": f"Field '{key}' must be numeric"}), 400

    try:
        from models.model_loader import predict_difficulty as _predict
        result = _predict(data)
        return jsonify({
            "status": "success",
            "prediction": result,
        })
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


@predict_bp.route("/predict-engagement", methods=["POST"])
def predict_engagement():
    """
    Predict engagement level for a student session.

    Expects JSON:
    {
        "response_freq": 5.2,
        "participation_count": 12,
        "activity_completion": 0.78,
        "idle_time": 8.5,
        "session_time": 45.0,
        "quiz_score": 82.0
    }

    Returns JSON with predicted label and confidence scores.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    required = ["response_freq", "participation_count", "activity_completion",
                "idle_time", "session_time", "quiz_score"]
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    for key in required:
        try:
            data[key] = float(data[key])
        except (ValueError, TypeError):
            return jsonify({"error": f"Field '{key}' must be numeric"}), 400

    try:
        from models.model_loader import predict_engagement as _predict
        result = _predict(data)
        return jsonify({
            "status": "success",
            "prediction": result,
        })
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


@predict_bp.route("/predict-isl", methods=["POST"])
def predict_isl():
    """
    Real-time Indian Sign Language (ISL) Gesture Prediction.
    Accepts sequence of 30 frames x 63 bilateral hand landmarks.
    Returns predicted ISL class, confidence score, and per-class probabilities.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    sequence = data.get("sequence") or data.get("landmarks") or data.get("frames")
    if sequence is None:
        # Default mock sequence for test/ping requests
        import numpy as np
        sequence = np.random.rand(30, 63).tolist()

    try:
        from models.model_loader import predict_sign_language as _predict_isl
        result = _predict_isl(sequence)
        return jsonify({
            "status": "success",
            "standard": "ISLRTC & INCLUDE (IIT Madras / AI4Bharat)",
            "prediction": result,
        }), 200
    except Exception as e:
        return jsonify({"error": f"ISL prediction failed: {str(e)}"}), 500

