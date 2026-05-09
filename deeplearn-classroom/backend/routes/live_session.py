"""
live_session.py — /session-join, /session-leave, /session-status, /session-participants
----------------------------------------------------------------------------------------
Lightweight in-memory + DB live session participant registry.

No WebSockets required. Frontend polls /session-participants every 4 s.
Participants are purged after 15 s of inactivity (heartbeat via any status call).
"""

import time
import threading
from flask import Blueprint, request, jsonify

live_session_bp = Blueprint("live_session", __name__)

# ── In-memory session registry ────────────────────────────────────────────────
# Structure:
#   _sessions = {
#     "<session_id>": {
#       "<user_id>": {
#         "user_id", "name", "role",
#         "is_muted", "is_video_off", "is_speaking",
#         "joined_at", "last_seen"  ← unix timestamp
#       }
#     }
#   }
_sessions: dict = {}
_lock = threading.Lock()

INACTIVE_TIMEOUT_S = 15   # remove participant after 15 s without heartbeat


def _purge_inactive(session_id: str):
    """Remove participants whose last_seen > INACTIVE_TIMEOUT_S ago."""
    now = time.time()
    with _lock:
        session = _sessions.get(session_id, {})
        stale = [uid for uid, p in session.items()
                 if now - p.get("last_seen", 0) > INACTIVE_TIMEOUT_S]
        for uid in stale:
            del session[uid]


# ---------------------------------------------------------------------------
# POST /session-join
# ---------------------------------------------------------------------------
@live_session_bp.route("/session-join", methods=["POST"])
def session_join():
    """Register a user as active in the session."""
    data = request.get_json(silent=True) or {}
    session_id   = data.get("session_id")
    user_id      = str(data.get("user_id", ""))
    name         = data.get("name", "Anonymous")
    role         = data.get("role", "student")
    is_muted     = bool(data.get("is_muted", False))
    is_video_off = bool(data.get("is_video_off", False))

    if not session_id or not user_id:
        return jsonify({"error": "session_id and user_id are required"}), 400

    now = time.time()
    with _lock:
        if session_id not in _sessions:
            _sessions[session_id] = {}
        _sessions[session_id][user_id] = {
            "user_id":      user_id,
            "name":         name,
            "role":         role,
            "is_muted":     is_muted,
            "is_video_off": is_video_off,
            "is_speaking":  False,
            "joined_at":    now,
            "last_seen":    now,
        }

    return jsonify({"status": "joined", "session_id": session_id, "user_id": user_id}), 200


# ---------------------------------------------------------------------------
# POST /session-leave
# ---------------------------------------------------------------------------
@live_session_bp.route("/session-leave", methods=["POST"])
def session_leave():
    """Remove a user from the session (called on disconnect / beforeunload)."""
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    user_id    = str(data.get("user_id", ""))

    if not session_id or not user_id:
        return jsonify({"error": "session_id and user_id are required"}), 400

    with _lock:
        session = _sessions.get(session_id, {})
        session.pop(user_id, None)

    return jsonify({"status": "left"}), 200


# ---------------------------------------------------------------------------
# POST /session-status
# ---------------------------------------------------------------------------
@live_session_bp.route("/session-status", methods=["POST"])
def session_status():
    """
    Update mute/video-off status AND refresh heartbeat (last_seen).
    Called whenever mic/camera is toggled.
    """
    data = request.get_json(silent=True) or {}
    session_id   = data.get("session_id")
    user_id      = str(data.get("user_id", ""))
    is_muted     = bool(data.get("is_muted", False))
    is_video_off = bool(data.get("is_video_off", False))

    if not session_id or not user_id:
        return jsonify({"error": "session_id and user_id are required"}), 400

    now = time.time()
    with _lock:
        session = _sessions.get(session_id, {})
        if user_id in session:
            session[user_id]["is_muted"]     = is_muted
            session[user_id]["is_video_off"] = is_video_off
            session[user_id]["last_seen"]    = now
        else:
            # Re-register if somehow dropped
            session[user_id] = {
                "user_id":      user_id,
                "name":         data.get("name", "Unknown"),
                "role":         data.get("role", "student"),
                "is_muted":     is_muted,
                "is_video_off": is_video_off,
                "is_speaking":  False,
                "joined_at":    now,
                "last_seen":    now,
            }

    return jsonify({"status": "updated"}), 200


# ---------------------------------------------------------------------------
# GET /session-participants?session_id=<id>
# ---------------------------------------------------------------------------
@live_session_bp.route("/session-participants", methods=["GET"])
def session_participants():
    """
    Return the current active participant list for a session.
    Also refreshes the caller's heartbeat and purges stale participants.
    """
    session_id = request.args.get("session_id")
    caller_id  = request.args.get("user_id")   # optional heartbeat refresh

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    _purge_inactive(session_id)

    now = time.time()
    with _lock:
        session = _sessions.get(session_id, {})

        # Refresh heartbeat for caller
        if caller_id and caller_id in session:
            session[caller_id]["last_seen"] = now

        participants = [
            {k: v for k, v in p.items() if k != "last_seen"}
            for p in session.values()
        ]

    # Sort: teacher first, then by joined_at
    participants.sort(key=lambda p: (0 if p["role"] == "teacher" else 1, p.get("joined_at", 0)))

    return jsonify({
        "session_id":   session_id,
        "participants": participants,
        "count":        len(participants),
    }), 200


# ---------------------------------------------------------------------------
# GET /session-info?session_id=<id>   (convenience)
# ---------------------------------------------------------------------------
@live_session_bp.route("/session-info", methods=["GET"])
def session_info():
    """Basic info about an active session (participant count, etc.)."""
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    _purge_inactive(session_id)

    with _lock:
        count = len(_sessions.get(session_id, {}))

    return jsonify({"session_id": session_id, "active_participants": count}), 200
