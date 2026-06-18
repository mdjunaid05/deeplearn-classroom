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
import json
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
          "video_id": 1,
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

    # ── Save to database ──────────────────────────────────────────────────────
    teacher_id = request.form.get("teacher_id", 1, type=int)
    course_id = request.form.get("course_id", 1, type=int)

    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    video_id = None
    try:
        # Ensure referenced rows exist (prevents FK violations on MySQL)
        cursor.execute("SELECT teacher_id FROM teachers WHERE teacher_id = ?", (teacher_id,))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO teachers (teacher_id, name, email, password_hash) VALUES (?, ?, ?, ?)",
                (teacher_id, "Teacher", f"teacher{teacher_id}@deeplearn.edu", "seeded"),
            )
        cursor.execute("SELECT course_id FROM courses WHERE course_id = ?", (course_id,))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO courses (course_id, title, teacher_id) VALUES (?, ?, ?)",
                (course_id, "Default Course", teacher_id),
            )

        cursor.execute("""
            INSERT INTO videos (teacher_id, course_id, original_url, processed_url, status)
            VALUES (?, ?, ?, ?, 'processing')
        """, (teacher_id, course_id, input_path, output_path))
        video_id = cursor.lastrowid
        conn.commit()
    except Exception as db_err:
        conn.rollback()
        print(f"[Upload] Database insertion failed: {db_err}")
    finally:
        conn.close()

    # ── Upload original to R2 (non-blocking — happens before pipeline) ────────
    r2_input_key = make_r2_key("uploads", filename)
    upload_file(input_path, r2_input_key)
    # Note: we keep the local copy for the pipeline — pipeline will clean up.

    # ── Start processing pipeline in background ───────────────────────────────
    job_id = start_pipeline(
        input_path, 
        output_path, 
        output_r2_key=make_r2_key("processed", output_filename),
        video_id=video_id
    )

    return jsonify({
        "status":   "processing",
        "job_id":   job_id,
        "video_id": video_id,
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


# ── SRT/VTT Format Helpers ──────────────────────────────────────────────────

def format_srt_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def format_vtt_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

def generate_srt(captions):
    lines = []
    for idx, cap in enumerate(captions):
        lines.append(str(idx + 1))
        start_str = format_srt_time(cap["start"])
        end_str = format_srt_time(cap["end"])
        lines.append(f"{start_str} --> {end_str}")
        lines.append(cap["text"])
        lines.append("")
    return "\n".join(lines)

def generate_vtt(captions):
    lines = ["WEBVTT", ""]
    for idx, cap in enumerate(captions):
        start_str = format_vtt_time(cap["start"])
        end_str = format_vtt_time(cap["end"])
        lines.append(f"{idx + 1}")
        lines.append(f"{start_str} --> {end_str}")
        lines.append(cap["text"])
        lines.append("")
    return "\n".join(lines)


# ── GET /video-captions ───────────────────────────────────────────────────────

@video_bp.route("/video-captions", methods=["GET"])
def get_video_captions():
    """
    Get captions for a video by video_id or job_id.
    Query params:
        video_id - ID in the videos database table
        job_id   - UUID from active job state
        format   - 'json' (default), 'srt', or 'vtt'
    """
    video_id = request.args.get("video_id", type=int)
    job_id = request.args.get("job_id")
    fmt = request.args.get("format", "json").lower()
    
    if not video_id and not job_id:
        return jsonify({"error": "Missing video_id or job_id"}), 400
        
    captions = []
    
    # 1. Fetch from database if video_id is provided
    if video_id:
        from database.db import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT video_id, status FROM videos WHERE video_id = ?", (video_id,))
            video_row = cursor.fetchone()
            if not video_row:
                return jsonify({"error": "Video not found"}), 404
                
            cursor.execute("""
                SELECT start_time, end_time, text 
                FROM video_captions 
                WHERE video_id = ? 
                ORDER BY start_time ASC
            """, (video_id,))
            rows = cursor.fetchall()
            for row in rows:
                captions.append({
                    "start": float(row[0]) if row[0] is not None else 0.0,
                    "end": float(row[1]) if row[1] is not None else 0.0,
                    "text": row[2]
                })
        except Exception as e:
            return jsonify({"error": f"Database error: {str(e)}"}), 500
        finally:
            conn.close()
            
    # 2. Otherwise fetch from active job_id
    elif job_id:
        state = get_job_status(job_id)
        if not state or state.get("status") == "unknown":
            return jsonify({"error": "Job not found"}), 404
        if state.get("status") != "done":
            return jsonify({"error": f"Job is in '{state.get('status')}' state"}), 400
            
        formatted_caps = state.get("captions", [])
        for c in formatted_caps:
            start = c.get("start")
            end = c.get("end")
            if start is None:
                try:
                    parts = c.get("start_time", "0:00").split(":")
                    start = int(parts[0]) * 60 + float(parts[1])
                except Exception:
                    start = 0.0
            if end is None:
                try:
                    parts = c.get("end_time", "0:00").split(":")
                    end = int(parts[0]) * 60 + float(parts[1])
                except Exception:
                    end = start + 2.0
            captions.append({
                "start": start,
                "end": end,
                "text": c.get("text", "")
            })
            
    if fmt == "srt":
        srt_content = generate_srt(captions)
        name = f"captions_{video_id or job_id}.srt"
        return srt_content, 200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": f"attachment; filename={name}"
        }
    elif fmt == "vtt":
        vtt_content = generate_vtt(captions)
        name = f"captions_{video_id or job_id}.vtt"
        return vtt_content, 200, {
            "Content-Type": "text/vtt; charset=utf-8",
            "Content-Disposition": f"attachment; filename={name}"
        }
    else:
        return jsonify({"video_id": video_id, "job_id": job_id, "captions": captions})
