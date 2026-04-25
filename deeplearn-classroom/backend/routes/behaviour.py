"""
Behaviour Route — /log-behaviour
Runs behaviour model on sequence input and optionally stores result.
"""

import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify

behaviour_bp = Blueprint("behaviour", __name__)


@behaviour_bp.route("/log-behaviour", methods=["POST"])
def log_behaviour():
    """
    Classify student behaviour from a sequence of interaction data
    and optionally store the result.

    Expects JSON:
    {
        "student_id": 1001,
        "sequence": [
            {"click_freq": 12.5, "response_speed": 2.3, "chat_count": 8, "idle_time": 5.0},
            ... (10 items total)
        ]
    }

    Returns JSON with predicted behaviour label and confidence.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    # Validate student_id
    student_id = data.get("student_id")
    if student_id is None:
        return jsonify({"error": "Missing field: student_id"}), 400

    # Validate sequence
    sequence = data.get("sequence")
    if not sequence or not isinstance(sequence, list):
        return jsonify({"error": "Field 'sequence' must be a list"}), 400

    if len(sequence) != 10:
        return jsonify({
            "error": f"Sequence must contain exactly 10 timesteps, got {len(sequence)}"
        }), 400

    required_keys = ["click_freq", "response_speed", "chat_count", "idle_time"]
    for i, step in enumerate(sequence):
        missing = [k for k in required_keys if k not in step]
        if missing:
            return jsonify({
                "error": f"Timestep {i} missing fields: {missing}"
            }), 400
        for key in required_keys:
            try:
                step[key] = float(step[key])
            except (ValueError, TypeError):
                return jsonify({
                    "error": f"Timestep {i}, field '{key}' must be numeric"
                }), 400

    try:
        from models.model_loader import predict_behaviour
        result = predict_behaviour(sequence)

        # Store in database
        try:
            from database.db import query_db
            last_step = sequence[-1]
            session_id = data.get("session_id", str(uuid.uuid4())[:8])
            query_db(
                """INSERT INTO behaviour_logs
                   (student_id, session_id, click_freq, response_speed,
                    chat_count, idle_time, behaviour_label, logged_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    student_id,
                    session_id,
                    last_step["click_freq"],
                    last_step["response_speed"],
                    int(last_step["chat_count"]),
                    last_step["idle_time"],
                    result["predicted_label"],
                    datetime.utcnow().isoformat(),
                ),
            )
        except Exception as db_err:
            # Log but don't fail the prediction
            print(f"[WARN] DB insert failed: {db_err}")

        return jsonify({
            "status": "success",
            "student_id": student_id,
            "prediction": result,
        })

    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500
