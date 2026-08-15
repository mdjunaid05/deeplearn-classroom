"""
DeepLearn Smart Virtual Classroom — Flask Application
Main entry point for the backend API.
"""

import os
from flask import Flask, jsonify, request
from flask_cors import CORS


def _run_r2_startup_sync():
    """Startup R2 sync: repopulate DB from R2 bucket.

    This ensures videos survive Render redeploys. Called inside
    create_app() so it runs under both Gunicorn (wsgi.py) and
    direct __main__ invocation.
    """
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

    # Also accept FRONTEND_URL as a supplementary origin
    frontend_url = os.environ.get("FRONTEND_URL", "").strip().rstrip("/")

    # Parse into a list if comma-separated; flask-cors accepts both a string
    # and a list — a list is safer so wildcards don't shadow explicit origins.
    if cors_env == "*":
        allowed_origins = "*"
    else:
        allowed_origins = [o.strip().rstrip("/") for o in cors_env.split(",") if o.strip()]
        if frontend_url and frontend_url not in allowed_origins:
            allowed_origins.append(frontend_url)

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

    # ── R2 startup sync (runs under both Gunicorn and dev mode) ──
    with app.app_context():
        _run_r2_startup_sync()

    # ── Root info endpoint ──
    @app.route("/", methods=["GET"])
    def root_info():
        return jsonify({
            "status": "running",
            "service": "DeepLearn Smart Virtual Classroom API",
            "version": "2.0.0",
            "endpoints": [
                "GET  /health",
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
                "GET  /videos",
                "GET  /r2-videos",
            ],
        })

    # ── Health check ──
    # ── Health check ──
    @app.route("/health", methods=["GET"])
    def health_check():
        """Production health endpoint — checks backend, database, and R2."""
        checks = {
            "backend": "ok",
            "database": "disconnected",
            "r2": "not_configured",
        }

        # Check database connectivity
        try:
            from database.db import get_db_connection, _get_postgres_url
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            conn.close()
            checks["database"] = "connected"
            checks["db_engine"] = "postgresql (supabase)" if _get_postgres_url() else ("mysql" if os.environ.get("DB_HOST") else "sqlite")
        except Exception as db_err:
            checks["database"] = "error"
            checks["db_error"] = str(db_err)
            print(f"[HEALTH_CHECK] Database error: {db_err}", flush=True)

        # Check R2 connectivity
        from utils.storage import _r2_enabled
        if _r2_enabled():
            try:
                from utils.storage import verify_bucket_access
                if verify_bucket_access():
                    checks["r2"] = "connected"
                else:
                    checks["r2"] = "error"
            except Exception as r2_err:
                checks["r2"] = "error"
                checks["r2_error"] = str(r2_err)
                print(f"[HEALTH_CHECK] R2 error: {r2_err}", flush=True)
        else:
            checks["r2"] = "not_configured"

        is_healthy = checks["backend"] == "ok" and checks["database"] == "connected"
        return jsonify({
            "status": "healthy" if is_healthy else "degraded",
            **checks
        }), 200 if is_healthy else 503

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

    # NOTE: /teacher/videos and /student/videos routes are handled by the
    # video_bp blueprint in routes/video_processing.py. Do NOT duplicate
    # them here — Flask does not allow two routes on the same URL+method.

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
    port = int(os.environ.get("PORT", 5000))
    # Use threaded=True so that background pipeline threads don't block
    # the main process from handling status-polling requests.
    app.run(host="0.0.0.0", port=port, debug=True, threaded=True)
