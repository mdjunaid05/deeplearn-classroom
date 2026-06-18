"""
Video Processing Routes
Endpoints: /upload-video, /video-status, /download-signed-video, /extract-captions
"""
import os
from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename
from utils.video_pipeline import start_pipeline, get_job_status

video_bp = Blueprint("video", __name__)

# Resolve paths relative to the backend root directory (two levels up from routes/)
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
UPLOAD_FOLDER = os.path.join(BACKEND_DIR, "uploads")
PROCESSED_FOLDER = os.path.join(BACKEND_DIR, "processed_videos")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".webm", ".mkv"}
MAX_UPLOAD_BYTES = 512 * 1024 * 1024  # 512 MB (matches Flask app config)


def _allowed_file(filename):
    ext = os.path.splitext(filename)[1].lower()
    return ext in ALLOWED_EXTENSIONS


@video_bp.route("/upload-video", methods=["POST"])
def upload_video():
    if "video_file" not in request.files:
        return jsonify({"error": "No video_file provided"}), 400
    
    file = request.files["video_file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    if not _allowed_file(file.filename):
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    filename = secure_filename(file.filename)
    input_path = os.path.join(UPLOAD_FOLDER, filename)
    output_filename = f"signed_{filename}"
    output_path = os.path.join(PROCESSED_FOLDER, output_filename)
    
    file.save(input_path)

    # Verify the file was saved and is non-empty
    if not os.path.exists(input_path) or os.path.getsize(input_path) == 0:
        return jsonify({"error": "Upload failed: file is empty or could not be saved"}), 500
    
    job_id = start_pipeline(input_path, output_path)
    
    return jsonify({
        "status": "processing",
        "job_id": job_id,
        "filename": output_filename
    })

@video_bp.route("/video-status", methods=["GET"])
def video_status():
    job_id = request.args.get("job_id")
    if not job_id:
        return jsonify({"error": "Missing job_id"}), 400
        
    status = get_job_status(job_id)
    return jsonify(status)

@video_bp.route("/download-signed-video", methods=["GET"])
def download_signed_video():
    job_id = request.args.get("job_id")
    filename = request.args.get("filename")
    if not filename:
        return jsonify({"error": "Missing filename"}), 400
        
    filename = secure_filename(filename)
    path = os.path.join(PROCESSED_FOLDER, filename)
    if not os.path.exists(path):
        return jsonify({"error": "File not found or processing not complete"}), 404
        
    return send_file(path, as_attachment=True)

@video_bp.route("/extract-captions", methods=["POST"])
def extract_captions():
    if "video_file" not in request.files:
        return jsonify({"error": "No video_file provided"}), 400
        
    file = request.files["video_file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    if not _allowed_file(file.filename):
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    filename = secure_filename(file.filename)
    input_path = os.path.join(UPLOAD_FOLDER, f"temp_{filename}")
    file.save(input_path)

    if not os.path.exists(input_path) or os.path.getsize(input_path) == 0:
        return jsonify({"error": "Upload failed: file is empty or could not be saved"}), 500
    
    from utils.speech_to_text import transcribe_audio
    try:
        captions = transcribe_audio(input_path)
    except Exception as e:
        return jsonify({"error": f"Transcription failed: {str(e)}"}), 500
    finally:
        # Always clean up the temp file
        if os.path.exists(input_path):
            try:
                os.remove(input_path)
            except OSError:
                pass
        
    return jsonify({"captions": captions})
