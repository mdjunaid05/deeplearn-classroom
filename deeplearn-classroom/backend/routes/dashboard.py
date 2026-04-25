"""
Dashboard Routes — /student-dashboard, /teacher-dashboard
Returns analytics data for the frontend dashboards.
"""

import os
import numpy as np
import pandas as pd
from flask import Blueprint, request, jsonify

dashboard_bp = Blueprint("dashboard", __name__)

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "student_activity.csv")


def _load_data():
    """Load the student activity CSV as a pandas DataFrame."""
    if not os.path.exists(DATA_PATH):
        return None
    return pd.read_csv(DATA_PATH)


@dashboard_bp.route("/student-dashboard", methods=["GET"])
def student_dashboard():
    """
    Return a student's performance, engagement history, and recommended difficulty.

    Query params:
        student_id (int): Student ID to look up.

    Returns JSON with:
        - student_id
        - performance_history (list of quiz scores)
        - engagement_history (list of engagement labels)
        - current_difficulty (most recent predicted difficulty)
        - average_score
        - recommended_next_activity
    """
    student_id = request.args.get("student_id", type=int)
    if student_id is None:
        return jsonify({"error": "Query parameter 'student_id' is required"}), 400

    df = _load_data()
    if df is None:
        return jsonify({"error": "Dataset not found. Run generate_dataset.py first."}), 503

    student_data = df[df["student_id"] == student_id]
    if student_data.empty:
        return jsonify({"error": f"No data found for student_id={student_id}"}), 404

    # Performance history
    perf_history = student_data[["activity_id", "quiz_score", "time_taken",
                                  "attempt_count", "completion_rate"]].to_dict("records")

    # Engagement history
    engagement_history = student_data[["activity_id", "engagement_label",
                                        "session_time", "participation_count"]].to_dict("records")

    # Behaviour history
    behaviour_history = student_data[["activity_id", "behaviour_label",
                                       "idle_time", "chat_count"]].to_dict("records")

    # Current stats
    avg_score = float(student_data["quiz_score"].mean())
    latest = student_data.iloc[-1]
    current_difficulty = str(latest["difficulty_label"])
    current_engagement = str(latest["engagement_label"])
    current_behaviour = str(latest["behaviour_label"])

    # Recommendation logic
    if avg_score >= 75 and current_difficulty != "Hard":
        recommendation = {
            "suggested_difficulty": "Hard",
            "reason": "Consistently high performance — ready for a challenge.",
        }
    elif avg_score < 45:
        recommendation = {
            "suggested_difficulty": "Easy",
            "reason": "Scores suggest foundational review would help.",
        }
    else:
        recommendation = {
            "suggested_difficulty": "Medium",
            "reason": "Performing at grade level — steady progress.",
        }

    return jsonify({
        "status": "success",
        "student_id": student_id,
        "average_score": round(avg_score, 2),
        "current_difficulty": current_difficulty,
        "current_engagement": current_engagement,
        "current_behaviour": current_behaviour,
        "recommendation": recommendation,
        "performance_history": perf_history,
        "engagement_history": engagement_history,
        "behaviour_history": behaviour_history,
    })


@dashboard_bp.route("/teacher-dashboard", methods=["GET"])
def teacher_dashboard():
    """
    Return aggregate analytics for all students.

    Query params:
        course_id (int, optional): Filter by course.

    Returns JSON with:
        - total_students
        - engagement_distribution
        - behaviour_distribution
        - difficulty_distribution
        - student_summaries (list)
        - course_analytics
    """
    df = _load_data()
    if df is None:
        return jsonify({"error": "Dataset not found. Run generate_dataset.py first."}), 503

    # ── Aggregate distributions ──
    engagement_dist = df["engagement_label"].value_counts().to_dict()
    behaviour_dist = df["behaviour_label"].value_counts().to_dict()
    difficulty_dist = df["difficulty_label"].value_counts().to_dict()

    # ── Per-student summaries ──
    student_summaries = []
    for sid, group in df.groupby("student_id"):
        latest = group.iloc[-1]
        student_summaries.append({
            "student_id": int(sid),
            "total_activities": len(group),
            "average_score": round(float(group["quiz_score"].mean()), 2),
            "latest_engagement": str(latest["engagement_label"]),
            "latest_behaviour": str(latest["behaviour_label"]),
            "latest_difficulty": str(latest["difficulty_label"]),
            "completion_rate": round(float(group["completion_rate"].mean()), 2),
        })

    # Sort by average score descending
    student_summaries.sort(key=lambda x: x["average_score"], reverse=True)

    # ── Time-series engagement (simplified: group by activity_id bins) ──
    df_sorted = df.sort_values("activity_id")
    engagement_timeline = []
    bin_size = max(1, len(df_sorted) // 20)
    for i in range(0, len(df_sorted), bin_size):
        chunk = df_sorted.iloc[i:i + bin_size]
        engagement_timeline.append({
            "period": i // bin_size + 1,
            "avg_score": round(float(chunk["quiz_score"].mean()), 2),
            "high_engagement_pct": round(
                float((chunk["engagement_label"] == "High").mean() * 100), 1
            ),
            "active_behaviour_pct": round(
                float((chunk["behaviour_label"] == "Active").mean() * 100), 1
            ),
        })

    return jsonify({
        "status": "success",
        "total_students": int(df["student_id"].nunique()),
        "total_records": len(df),
        "engagement_distribution": engagement_dist,
        "behaviour_distribution": behaviour_dist,
        "difficulty_distribution": difficulty_dist,
        "student_summaries": student_summaries,
        "engagement_timeline": engagement_timeline,
    })
