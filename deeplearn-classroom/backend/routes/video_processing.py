"""
Video Processing Routes
Endpoints: /upload-video, /video-status, /download-signed-video, /extract-captions
"""
import os
from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename
from utils.video_pipeline import start_pipeline, get_job_status

video_bp = Blueprint("video", __name__)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "..", "uploads")
PROCESSED_FOLDER = os.path.join(os.path.dirname(__file__), "..", "processed_videos")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

@video_bp.route("/upload-video", methods=["POST"])
def upload_video():
    if "video_file" not in request.files:
        return jsonify({"error": "No video_file provided"}), 400
    
    file = request.files["video_file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    filename = secure_filename(file.filename)
    input_path = os.path.join(UPLOAD_FOLDER, filename)
    output_filename = f"signed_{filename}"
    output_path = os.path.join(PROCESSED_FOLDER, output_filename)
    
    file.save(input_path)
    
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
        
    path = os.path.join(PROCESSED_FOLDER, filename)
    if not os.path.exists(path):
        return jsonify({"error": "File not found or processing not complete"}), 404
        
    return send_file(path, as_attachment=True)

@video_bp.route("/extract-captions", methods=["POST"])
def extract_captions():
    if "video_file" not in request.files:
        return jsonify({"error": "No video_file provided"}), 400
        
    file = request.files["video_file"]
    filename = secure_filename(file.filename)
    input_path = os.path.join(UPLOAD_FOLDER, f"temp_{filename}")
    file.save(input_path)
    
    from utils.speech_to_text import transcribe_audio
    captions = transcribe_audio(input_path)
    
    # Clean up temp file
    if os.path.exists(input_path):
        os.remove(input_path)
        
    return jsonify({"captions": captions})
