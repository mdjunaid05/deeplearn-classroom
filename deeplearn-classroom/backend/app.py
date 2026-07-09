"""
DeepLearn Smart Virtual Classroom — Flask Application
Main entry point for the backend API.
"""

import os
from flask import Flask, jsonify
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

    # ── Health check ──
    @app.route("/", methods=["GET"])
    def health():
        return jsonify({
            "status": "running",
            "service": "DeepLearn Smart Virtual Classroom API",
            "version": "1.0.0",
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
            ],
        })

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
