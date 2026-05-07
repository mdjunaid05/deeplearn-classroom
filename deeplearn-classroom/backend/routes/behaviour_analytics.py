"""
Advanced Behaviour Analytics Route — /behaviour-analytics, /behaviour-events
Logs detailed per-event behaviour data and returns aggregated analytics.
"""

from datetime import datetime
from flask import Blueprint, request, jsonify

behaviour_analytics_bp = Blueprint("behaviour_analytics", __name__)


# ── In-memory event store (for demo; replace with DB in production) ──
_events = []  # list of dicts


@behaviour_analytics_bp.route("/behaviour-events", methods=["POST"])
def log_behaviour_event():
    """
    Log a single real-time behaviour event from the frontend tracker.

    Expects JSON:
    {
        "student_id": 1001,
        "behaviour": "Distracted",
        "engagement_score": 45,
        "focus_score": 30,
        "participation_score": 20,
        "face_detected": true,
        "tab_active": true,
        "interaction_rate": 0.12,
        "session_seconds": 180
    }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    student_id = data.get("student_id")
    if not student_id:
        return jsonify({"error": "student_id required"}), 400

    event = {
        "student_id": int(student_id),
        "behaviour": data.get("behaviour", "Unknown"),
        "engagement_score": float(data.get("engagement_score", 0)),
        "focus_score": float(data.get("focus_score", 0)),
        "participation_score": float(data.get("participation_score", 0)),
        "face_detected": bool(data.get("face_detected", True)),
        "tab_active": bool(data.get("tab_active", True)),
        "interaction_rate": float(data.get("interaction_rate", 0)),
        "session_seconds": int(data.get("session_seconds", 0)),
        "logged_at": datetime.utcnow().isoformat(),
    }

    _events.append(event)

    # Try to persist to DB if available
    try:
        from database.db import query_db
        query_db(
            """INSERT OR IGNORE INTO behaviour_logs
               (student_id, session_id, click_freq, response_speed,
                chat_count, idle_time, behaviour_label, logged_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                student_id,
                f"live-{student_id}",
                event["interaction_rate"] * 10,  # approximate
                0,
                0,
                0,
                event["behaviour"],
                event["logged_at"],
            ),
        )
    except Exception as e:
        print(f"[INFO] DB unavailable, event stored in-memory: {e}")

    return jsonify({"status": "logged", "event": event})


@behaviour_analytics_bp.route("/behaviour-analytics", methods=["GET"])
def get_behaviour_analytics():
    """
    Return aggregated behaviour analytics.
    
    Query params:
        student_id (int, optional): Filter by student
        limit (int): Max events to return (default 100)
    """
    student_id = request.args.get("student_id", type=int)
    limit = request.args.get("limit", type=int, default=100)

    events = _events
    if student_id:
        events = [e for e in events if e["student_id"] == student_id]
    events = events[-limit:]

    if not events:
        return jsonify({
            "status": "success",
            "total_events": 0,
            "avg_engagement": 0,
            "avg_focus": 0,
            "avg_participation": 0,
            "behaviour_distribution": {},
            "recent_events": [],
        })

    from collections import Counter
    behaviour_counts = Counter(e["behaviour"] for e in events)
    avg_engagement = round(sum(e["engagement_score"] for e in events) / len(events), 1)
    avg_focus = round(sum(e["focus_score"] for e in events) / len(events), 1)
    avg_participation = round(sum(e["participation_score"] for e in events) / len(events), 1)

    return jsonify({
        "status": "success",
        "total_events": len(events),
        "avg_engagement": avg_engagement,
        "avg_focus": avg_focus,
        "avg_participation": avg_participation,
        "behaviour_distribution": dict(behaviour_counts),
        "recent_events": events[-20:],
    })


@behaviour_analytics_bp.route("/attendance", methods=["GET"])
def get_attendance():
    """
    Return simulated attendance data for teacher dashboard.
    """
    from database.db import query_db
    import os, pandas as pd

    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "student_activity.csv")
    if not os.path.exists(data_path):
        return jsonify({"error": "Dataset not found"}), 503

    df = pd.read_csv(data_path)
    student_ids = df["student_id"].unique().tolist()

    attendance = []
    for sid in student_ids[:30]:  # limit to 30
        student_data = df[df["student_id"] == sid]
        avg_completion = float(student_data["completion_rate"].mean())
        attendance.append({
            "student_id": int(sid),
            "sessions_attended": len(student_data),
            "avg_completion": round(avg_completion, 2),
            "attendance_rate": round(min(avg_completion * 1.1, 1.0), 2),
            "last_active": "Today" if avg_completion > 0.7 else "2 days ago",
        })

    return jsonify({"status": "success", "attendance": attendance})
