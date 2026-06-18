"""
Video Processing Routes
Endpoints: /upload-video, /video-status, /download-signed-video, /extract-captions

Storage Strategy:
- If Cloudflare R2 is configured (R2_ACCESS_KEY_ID env var set):
    → Videos are uploaded to R2 and served directly from Cloudflare CDN.
    → Render's disk is only used as a temp buffer during upload/processing.
    → /download-signed-video returns a 307 redirect to the R2 URL.
- If R2 is NOT configured (local/dev mode):
    → Videos are kept on disk and served via send_file() as before.
    → No code changes needed — storage.py handles the fallback transparently.
"""
import os
from flask import Blueprint, request, jsonify, send_file, redirect
from werkzeug.utils import secure_filename
from utils.video_pipeline import start_pipeline, get_job_status
from utils.storage import (
    upload_file, get_public_url, delete_file,
    is_r2_url, make_r2_key, _r2_enabled
)

video_bp = Blueprint("video", __name__)

# Resolve absolute paths from the backend root — stable under Gunicorn CWD changes
BACKEND_DIR     = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
UPLOAD_FOLDER   = os.path.join(BACKEND_DIR, "uploads")
PROCESSED_FOLDER= os.path.join(BACKEND_DIR, "processed_videos")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS  = {".mp4", ".avi", ".mov", ".webm", ".mkv"}
MAX_UPLOAD_BYTES    = 512 * 1024 * 1024  # 512 MB


def _allowed_file(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS


def _cleanup_local(path: str) -> None:
    """Silently remove a local temp file."""
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


# ── POST /upload-video ────────────────────────────────────────────────────────

@video_bp.route("/upload-video", methods=["POST"])
def upload_video():
    """
    Accept a video file, optionally upload it to Cloudflare R2,
    then start the sign-overlay + caption pipeline in a background thread.

    Returns:
        {
          "status": "processing",
          "job_id": "<uuid>",
          "filename": "signed_<original>.mp4"
        }
    """
    if "video_file" not in request.files:
        return jsonify({"error": "No video_file provided"}), 400

    file = request.files["video_file"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not _allowed_file(file.filename):
        return jsonify({
            "error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        }), 400

    filename        = secure_filename(file.filename)
    input_path      = os.path.join(UPLOAD_FOLDER, filename)
    output_filename = f"signed_{filename}"
    output_path     = os.path.join(PROCESSED_FOLDER, output_filename)

    # ── Save to local disk first ──────────────────────────────────────────────
    file.save(input_path)

    if not os.path.exists(input_path) or os.path.getsize(input_path) == 0:
        return jsonify({"error": "Upload failed: file is empty or could not be saved"}), 500

    # ── Upload original to R2 (non-blocking — happens before pipeline) ────────
    r2_input_key = make_r2_key("uploads", filename)
    upload_file(input_path, r2_input_key)
    # Note: we keep the local copy for the pipeline — pipeline will clean up.

    # ── Start processing pipeline in background ───────────────────────────────
    job_id = start_pipeline(input_path, output_path, output_r2_key=make_r2_key("processed", output_filename))

    return jsonify({
        "status":   "processing",
        "job_id":   job_id,
        "filename": output_filename,
    })


# ── GET /video-status ─────────────────────────────────────────────────────────

@video_bp.route("/video-status", methods=["GET"])
def video_status():
    """Poll job status. When done, returns `video_url` pointing to R2 (or local path)."""
    job_id = request.args.get("job_id")
    if not job_id:
        return jsonify({"error": "Missing job_id"}), 400

    status = get_job_status(job_id)
    return jsonify(status)


# ── GET /download-signed-video ────────────────────────────────────────────────

@video_bp.route("/download-signed-video", methods=["GET"])
def download_signed_video():
    """
    Return the processed video.

    If R2 is configured: 307 redirect → browser fetches directly from Cloudflare.
    If local mode:       stream file via send_file() as before.

    Query params:
        job_id   (optional) — used to look up the R2 URL from job state
        filename (required) — fallback if no job_id
    """
    job_id   = request.args.get("job_id")
    filename = request.args.get("filename", "")

    # Prefer looking up R2 URL from job state
    if job_id:
        state = get_job_status(job_id)
        video_url = state.get("video_url", "")
        if video_url and is_r2_url(video_url):
            return redirect(video_url, code=307)

    # Fallback: construct URL from filename
    if not filename:
        return jsonify({"error": "Missing filename or job_id"}), 400

    filename = secure_filename(filename)

    if _r2_enabled():
        r2_key  = make_r2_key("processed", filename)
        pub_url = get_public_url(r2_key)
        if is_r2_url(pub_url):
            return redirect(pub_url, code=307)

    # Last resort: serve from local disk
    local_path = os.path.join(PROCESSED_FOLDER, filename)
    if not os.path.exists(local_path):
        return jsonify({"error": "File not found. Processing may still be in progress."}), 404

    return send_file(local_path, as_attachment=True)


# ── GET /video-url ────────────────────────────────────────────────────────────

@video_bp.route("/video-url", methods=["GET"])
def get_video_url():
    """
    Return the direct URL for a processed video (for embedding in the frontend).

    Query params:
        job_id   — look up from job state (preferred)
        filename — fallback
    """
    job_id   = request.args.get("job_id")
    filename = request.args.get("filename", "")

    if job_id:
        state = get_job_status(job_id)
        video_url = state.get("video_url", "")
        if video_url:
            return jsonify({"video_url": video_url, "source": "job_state"})

    if not filename:
        return jsonify({"error": "Missing job_id or filename"}), 400

    filename = secure_filename(filename)

    if _r2_enabled():
        r2_key  = make_r2_key("processed", filename)
        pub_url = get_public_url(r2_key)
        return jsonify({"video_url": pub_url, "source": "r2"})

    # Local mode
    local_path = os.path.join(PROCESSED_FOLDER, filename)
    if os.path.exists(local_path):
        return jsonify({
            "video_url": f"/download-signed-video?filename={filename}",
            "source": "local"
        })

    return jsonify({"error": "Video not found"}), 404


# ── POST /extract-captions ────────────────────────────────────────────────────

@video_bp.route("/extract-captions", methods=["POST"])
def extract_captions():
    """
    Extract captions from an uploaded video using speech recognition.
    The video is processed locally and NOT stored in R2 (temp only).
    """
    if "video_file" not in request.files:
        return jsonify({"error": "No video_file provided"}), 400

    file = request.files["video_file"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not _allowed_file(file.filename):
        return jsonify({
            "error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        }), 400

    filename   = secure_filename(file.filename)
    input_path = os.path.join(UPLOAD_FOLDER, f"temp_{filename}")
    file.save(input_path)

    if not os.path.exists(input_path) or os.path.getsize(input_path) == 0:
        _cleanup_local(input_path)
        return jsonify({"error": "Upload failed: file is empty or could not be saved"}), 500

    from utils.speech_to_text import transcribe_audio
    try:
        captions = transcribe_audio(input_path)
    except Exception as e:
        return jsonify({"error": f"Transcription failed: {str(e)}"}), 500
    finally:
        _cleanup_local(input_path)  # always remove temp file

    return jsonify({"captions": captions})
