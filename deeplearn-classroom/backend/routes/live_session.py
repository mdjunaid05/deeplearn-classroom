"""
live_session.py — /session-join, /session-leave, /session-status, /session-participants, /active-session
----------------------------------------------------------------------------------------
Database-backed live session participant registry.

No WebSockets required. Frontend polls /session-participants every 4 s.
Participants are purged after 15 s of inactivity (heartbeat via any status call).
"""

import time
from flask import Blueprint, request, jsonify

live_session_bp = Blueprint("live_session", __name__)

INACTIVE_TIMEOUT_S = 30   # remove participant after 30 s without heartbeat


def _purge_inactive(session_id: str):
    """Remove participants whose last_seen > INACTIVE_TIMEOUT_S ago."""
    now = time.time()
    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            DELETE FROM live_session_participants
            WHERE session_id = ? AND (? - last_seen) > ?
        """, (session_id, now, INACTIVE_TIMEOUT_S))
        conn.commit()
    except Exception as e:
        print(f"Error purging inactive participants: {e}")
    finally:
        conn.close()


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
    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # DELETE then INSERT for cross-database compatibility (SQLite, MySQL, PostgreSQL)
        cursor.execute("""
            DELETE FROM live_session_participants WHERE session_id = ? AND user_id = ?
        """, (session_id, user_id))
        cursor.execute("""
            INSERT INTO live_session_participants (session_id, user_id, name, role, is_muted, is_video_off, joined_at, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (session_id, user_id, name, role, is_muted, is_video_off, now, now))
        conn.commit()
    except Exception as e:
        print(f"Error joining session: {e}")
        return jsonify({"error": "Database error joining session"}), 500
    finally:
        conn.close()

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

    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            DELETE FROM live_session_participants
            WHERE session_id = ? AND user_id = ?
        """, (session_id, user_id))
        conn.commit()
    except Exception as e:
        print(f"Error leaving session: {e}")
    finally:
        conn.close()

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
    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Check if participant exists
        cursor.execute("""
            SELECT joined_at FROM live_session_participants
            WHERE session_id = ? AND user_id = ?
        """, (session_id, user_id))
        row = cursor.fetchone()

        if row:
            # Update status
            cursor.execute("""
                UPDATE live_session_participants
                SET is_muted = ?, is_video_off = ?, last_seen = ?
                WHERE session_id = ? AND user_id = ?
            """, (is_muted, is_video_off, now, session_id, user_id))
        else:
            # Re-register if dropped
            name = data.get("name", "Unknown")
            role = data.get("role", "student")
            cursor.execute("""
                INSERT INTO live_session_participants (session_id, user_id, name, role, is_muted, is_video_off, joined_at, last_seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (session_id, user_id, name, role, is_muted, is_video_off, now, now))
        conn.commit()
    except Exception as e:
        print(f"Error updating session status: {e}")
    finally:
        conn.close()

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
    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Refresh heartbeat for caller
        if caller_id:
            cursor.execute("""
                UPDATE live_session_participants
                SET last_seen = ?
                WHERE session_id = ? AND user_id = ?
            """, (now, session_id, caller_id))
            conn.commit()

        # Get all active participants
        cursor.execute("""
            SELECT user_id, name, role, is_muted, is_video_off, joined_at
            FROM live_session_participants
            WHERE session_id = ?
        """, (session_id,))
        rows = cursor.fetchall()

        columns = [desc[0] for desc in cursor.description]
        participants = []
        for row in rows:
            p = dict(zip(columns, row))
            p["is_muted"] = bool(p["is_muted"])
            p["is_video_off"] = bool(p["is_video_off"])
            participants.append(p)
    except Exception as e:
        print(f"Error fetching participants: {e}")
        participants = []
    finally:
        conn.close()

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

    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    count = 0
    try:
        cursor.execute("""
            SELECT COUNT(*) FROM live_session_participants
            WHERE session_id = ?
        """, (session_id,))
        row = cursor.fetchone()
        count = row[0] if row else 0
    except Exception as e:
        print(f"Error fetching session info: {e}")
    finally:
        conn.close()

    return jsonify({"session_id": session_id, "active_participants": count}), 200


def _purge_stale_sessions():
    """Auto-end live sessions older than 6 hours."""
    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE live_sessions
            SET status = 'ended', end_time = CURRENT_TIMESTAMP
            WHERE status = 'live' AND (julianday('now') - julianday(start_time)) * 24 > 6
        """)
        conn.commit()
    except Exception as e:
        print(f"Error purging stale sessions: {e}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /active-session
# ---------------------------------------------------------------------------
@live_session_bp.route("/active-session", methods=["GET"])
def active_session():
    """Get the currently active live session ID from the database."""
    _purge_stale_sessions()
    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    session_id = None
    try:
        # Query for the latest active session
        cursor.execute("""
            SELECT session_id FROM live_sessions 
            WHERE status = 'live' 
            ORDER BY start_time DESC LIMIT 1
        """)
        row = cursor.fetchone()
        if row:
            session_id = row[0] if isinstance(row, tuple) else row['session_id']
    except Exception as e:
        print(f"Error fetching active session: {e}")
    finally:
        conn.close()

    return jsonify({"session_id": session_id}), 200


# ---------------------------------------------------------------------------
# POST /session-chat   — send a chat message
# ---------------------------------------------------------------------------
@live_session_bp.route("/session-chat", methods=["POST"])
def session_chat_send():
    """Store a new chat message for a live session."""
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    user_id    = str(data.get("user_id", ""))
    user_name  = data.get("user_name", "Anonymous")
    message    = data.get("message", "").strip()

    if not session_id or not user_id or not message:
        return jsonify({"error": "session_id, user_id, and message are required"}), 400

    now = time.time()
    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO session_chat_messages (session_id, user_id, user_name, message, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (session_id, user_id, user_name, message, now))
        conn.commit()
        message_id = cursor.lastrowid
    except Exception as e:
        print(f"Error sending chat message: {e}")
        return jsonify({"error": "Could not send message"}), 500
    finally:
        conn.close()

    return jsonify({
        "status": "sent",
        "message_id": message_id,
        "created_at": now,
    }), 201


# ---------------------------------------------------------------------------
# GET /session-chat?session_id=<id>&after=<timestamp>
# ---------------------------------------------------------------------------
@live_session_bp.route("/session-chat", methods=["GET"])
def session_chat_poll():
    """
    Return chat messages for a session.
    Pass `after` timestamp to get only new messages (long-poll friendly).
    Returns the latest 100 messages if no `after` is specified.
    """
    session_id = request.args.get("session_id")
    after      = request.args.get("after", type=float, default=0)

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    messages = []
    try:
        if after > 0:
            cursor.execute("""
                SELECT message_id, user_id, user_name, message, created_at
                FROM session_chat_messages
                WHERE session_id = ? AND created_at > ?
                ORDER BY created_at ASC
                LIMIT 200
            """, (session_id, after))
        else:
            cursor.execute("""
                SELECT message_id, user_id, user_name, message, created_at
                FROM session_chat_messages
                WHERE session_id = ?
                ORDER BY created_at DESC
                LIMIT 100
            """, (session_id,))

        rows = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]
        for row in rows:
            messages.append(dict(zip(columns, row)))

        # If we fetched latest 100 (no after filter), reverse to chronological order
        if after <= 0:
            messages.reverse()
    except Exception as e:
        print(f"Error fetching chat messages: {e}")
    finally:
        conn.close()

    return jsonify({
        "session_id": session_id,
        "messages":   messages,
        "count":      len(messages),
    }), 200

