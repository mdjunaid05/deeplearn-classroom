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

    # Enable CORS for frontend
    CORS(app, resources={r"/*": {"origins": "*"}})

    # ── Register blueprints ──
    from routes.predict import predict_bp
    from routes.behaviour import behaviour_bp
    from routes.dashboard import dashboard_bp
    from routes.accessibility import accessibility_bp
    from routes.video_processing import video_bp

    app.register_blueprint(predict_bp)
    app.register_blueprint(behaviour_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(accessibility_bp)
    app.register_blueprint(video_bp)

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

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
