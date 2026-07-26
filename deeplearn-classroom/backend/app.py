"""
DeepLearn Smart Virtual Classroom — Flask Application
Main entry point for the backend API.
"""

import os
from flask import Flask, jsonify, request
from flask_cors import CORS


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "deeplearn-dev-key-2024")

    # Allow video uploads up to 512 MB
    app.config["MAX_CONTENT_LENGTH"] = 512 * 1024 * 1024

    # ── CORS ──
    # CORS_ORIGINS accepts a comma-separated list of allowed origins, e.g.:
    #   "https://deeplearn-classroom.vercel.app,http://localhost:3000"
    # The wildcard "*" is also accepted for development convenience.
    # Set this in the Render dashboard to your Vercel production URL.
    cors_env = os.environ.get("CORS_ORIGINS", "*")

    # Parse into a list if comma-separated; flask-cors accepts both a string
    # and a list — a list is safer so wildcards don't shadow explicit origins.
    if cors_env == "*":
        allowed_origins = "*"
    else:
        allowed_origins = [o.strip().rstrip("/") for o in cors_env.split(",") if o.strip()]

    CORS(
        app,
        resources={r"/*": {"origins": allowed_origins}},
        supports_credentials=True,
        expose_headers=["Content-Range", "Content-Disposition"],
        allow_headers=["Content-Type", "Authorization", "Range"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    # ── Register blueprints ──
    from routes.auth import auth_bp
    from routes.predict import predict_bp
    from routes.behaviour import behaviour_bp
    from routes.dashboard import dashboard_bp
    from routes.accessibility import accessibility_bp
    from routes.video_processing import video_bp
    from routes.recordings import recordings_bp
    from routes.behaviour_analytics import behaviour_analytics_bp
    from routes.sign_language import sign_language_bp
    from routes.live_session import live_session_bp
    from routes.quiz_analytics import quiz_analytics_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(predict_bp)
    app.register_blueprint(behaviour_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(accessibility_bp)
    app.register_blueprint(video_bp)
    app.register_blueprint(recordings_bp)
    app.register_blueprint(behaviour_analytics_bp)
    app.register_blueprint(sign_language_bp)
    app.register_blueprint(live_session_bp)
    app.register_blueprint(quiz_analytics_bp)

    # ── Auto-seed demo accounts at startup ──
    with app.app_context():
        try:
            from routes.auth import _seed_demo_accounts
            _seed_demo_accounts()
            print("[STARTUP] Demo accounts seeded successfully.", flush=True)
        except Exception as e:
            print(f"[STARTUP] Warning: Demo account seeding error: {e}", flush=True)

    # ── Health check ──
    @app.route("/", methods=["GET"])
    def health():
        return jsonify({
            "status": "running",
            "service": "DeepLearn Smart Virtual Classroom API",
            "version": "2.0.0",
            "endpoints": [
                "POST /predict-difficulty",
                "POST /predict-engagement",
                "POST /log-behaviour",
                "GET  /student-dashboard?student_id=<id>",
                "GET  /teacher-dashboard",
                "POST /recognize-sign",
                "POST /recognize-lip",
                "POST /generate-caption",
                "POST /upload-video",
                "GET  /video-status",
                "GET  /download-signed-video",
                "POST /sign-data",
                "GET  /sign-data/<recording_id>",
                "POST /process-signs",
                "GET  /storage-health",
                "GET  /teacher/videos?teacher_id=<id>",
                "GET  /student/videos?student_id=<id>",
                "GET  /r2-videos",
            ],
        })

    # ── Storage health endpoint ──
    @app.route("/storage-health", methods=["GET"])
    def storage_health():
        from utils.storage import get_r2_diagnostics
        return jsonify(get_r2_diagnostics())

    # ── R2 video listing (for teacher dashboard storage status) ──
    @app.route("/r2-videos", methods=["GET"])
    def r2_videos():
        from utils.storage import list_bucket_videos
        videos = list_bucket_videos()
        return jsonify({"r2_videos": videos, "count": len(videos)})

    # ── Teacher video management endpoint ──
    @app.route("/teacher/videos", methods=["GET"])
    def teacher_videos():
        teacher_id = request.args.get("teacher_id", type=int)
        if not teacher_id:
            return jsonify({"error": "teacher_id is required"}), 400
        from database.db import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT v.video_id, v.teacher_id, v.course_id, v.title, v.filename,
                       v.r2_url, v.original_url, v.processed_url, v.status,
                       v.uploaded_at, v.processed_at, v.original_video_id,
                       v.video_type, v.captions_url, v.description, v.visibility,
                       v.hidden, v.archived, v.file_size, v.duration,
                       v.caption_status, v.signing_status,
                       t.name as uploader,
                       (SELECT COUNT(*) FROM video_views vv WHERE vv.video_id = v.video_id) as view_count,
                       (SELECT COUNT(*) FROM video_captions vc WHERE vc.video_id = v.video_id) as caption_count
                FROM videos v
                LEFT JOIN teachers t ON v.teacher_id = t.teacher_id
                WHERE v.teacher_id = ? AND v.deleted = 0
                ORDER BY v.uploaded_at DESC
            """, (teacher_id,))
            rows = cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            videos = []
            for row in rows:
                video = dict(zip(cols, row))
                if video.get("uploaded_at") and not isinstance(video["uploaded_at"], str):
                    video["uploaded_at"] = video["uploaded_at"].isoformat()
                video["captions_status"] = video.get("caption_status", "pending")
                videos.append(video)
            return jsonify({"videos": videos, "count": len(videos)})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        finally:
            conn.close()

    # ── Student video listing endpoint ──
    @app.route("/student/videos", methods=["GET"])
    def student_videos():
        student_id = request.args.get("student_id", type=int)
        if not student_id:
            return jsonify({"error": "student_id is required"}), 400
        from database.db import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT v.video_id, v.teacher_id, v.course_id, v.title, v.filename,
                       v.r2_url, v.original_url, v.processed_url, v.status,
                       v.uploaded_at, v.video_type, v.captions_url, v.description,
                       v.duration, v.caption_status, v.signing_status,
                       t.name as uploader
                FROM videos v
                LEFT JOIN teachers t ON v.teacher_id = t.teacher_id
                WHERE v.deleted = 0 AND v.hidden = 0 AND v.archived = 0
                  AND v.visibility = 'Published' AND v.status = 'done'
                ORDER BY v.uploaded_at DESC
            """, ())
            rows = cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            videos = []
            for row in rows:
                video = dict(zip(cols, row))
                if video.get("uploaded_at") and not isinstance(video["uploaded_at"], str):
                    video["uploaded_at"] = video["uploaded_at"].isoformat()
                # Check if student has watched this video
                cursor.execute(
                    "SELECT completion_percentage FROM video_views WHERE student_id = ? AND video_id = ? ORDER BY watched_at DESC LIMIT 1",
                    (student_id, video["video_id"])
                )
                view_row = cursor.fetchone()
                video["watched"] = view_row is not None
                video["completion"] = view_row[0] if view_row else 0
                video["has_captions"] = video.get("caption_status") == "available"
                video["has_signing"] = video.get("signing_status") == "available"
                videos.append(video)
            return jsonify({"videos": videos, "count": len(videos)})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        finally:
            conn.close()

    @app.route("/api-info", methods=["GET"])
    def api_info():
        """Return detailed API documentation."""
        return jsonify({
            "models": {
                "adaptive": {
                    "endpoint": "/predict-difficulty",
                    "method": "POST",
                    "input_features": ["quiz_score", "time_taken", "attempt_count",
                                       "completion_rate", "prev_score"],
                    "output_classes": ["Easy", "Medium", "Hard"],
                },
                "engagement": {
                    "endpoint": "/predict-engagement",
                    "method": "POST",
                    "input_features": ["response_freq", "participation_count",
                                       "activity_completion", "idle_time",
                                       "session_time", "quiz_score"],
                    "output_classes": ["High", "Medium", "Low"],
                },
                "behaviour": {
                    "endpoint": "/log-behaviour",
                    "method": "POST",
                    "input_format": "sequence of 10 timesteps",
                    "timestep_features": ["click_freq", "response_speed",
                                          "chat_count", "idle_time"],
                    "output_classes": ["Active", "Passive", "Distracted"],
                },
            },
            "dashboards": {
                "student": "/student-dashboard?student_id=<int>",
                "teacher": "/teacher-dashboard",
            },
        })

    # ── Handle 413 Request Entity Too Large ──
    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({
            "error": "File too large. Maximum upload size is 512 MB."
        }), 413

    return app


if __name__ == "__main__":
    app = create_app()

    # ── Startup R2 sync: repopulate DB from R2 bucket ──
    # This ensures videos survive Render redeploys
    try:
        from database.db import get_db_connection
        from utils.storage import sync_r2_objects_to_db
        conn = get_db_connection()
        synced = sync_r2_objects_to_db(conn, timeout_seconds=15)
        conn.close()
        if synced > 0:
            print(f"[STARTUP] R2 sync populated {synced} video records from Cloudflare R2.", flush=True)
        else:
            print("[STARTUP] R2 sync complete (no new videos to sync).", flush=True)
    except Exception as e:
        print(f"[STARTUP] R2 sync failed (non-fatal): {e}", flush=True)

    port = int(os.environ.get("PORT", 5000))
    # Use threaded=True so that background pipeline threads don't block
    # the main process from handling status-polling requests.
    app.run(host="0.0.0.0", port=port, debug=True, threaded=True)
