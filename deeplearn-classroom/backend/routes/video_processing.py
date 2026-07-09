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
    title           = request.form.get("title") or file.filename
    print(f"[VIDEO_UPLOAD_STARTED] filename={filename}", flush=True)
    print(f"[UPLOAD_STARTED] filename={filename}", flush=True)
    print(f"[VIDEO_RECEIVED] route=upload-video filename={filename}")
    print(f"[CAPTION_REQUEST_STARTED] route=upload-video filename={filename}")
    input_path      = os.path.join(UPLOAD_FOLDER, filename)
    output_filename = f"signed_{filename}"
    output_path     = os.path.join(PROCESSED_FOLDER, output_filename)

    # ── Save to local disk first ──────────────────────────────────────────────
    file.save(input_path)
    print(f"[VIDEO_UPLOAD_SUCCESS] filename={filename}", flush=True)

    if not os.path.exists(input_path) or os.path.getsize(input_path) == 0:
        return jsonify({"error": "Upload failed: file is empty or could not be saved"}), 500

    # ── Save to database ──────────────────────────────────────────────────────
    teacher_id = request.form.get("teacher_id", 1, type=int)
    course_id = request.form.get("course_id", 1, type=int)

    from database.db import get_db_connection
    print("[DATABASE_SAVE_STARTED]", flush=True)
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
            INSERT INTO videos (teacher_id, course_id, title, filename, original_url, processed_url, status)
            VALUES (?, ?, ?, ?, ?, ?, 'processing')
        """, (teacher_id, course_id, title, filename, input_path, output_path))
        video_id = cursor.lastrowid
        conn.commit()
        print("[DATABASE_SAVE_SUCCESS]", flush=True)
        print(f"[VIDEO_SAVED_TO_DATABASE] video_id={video_id} filename={filename}", flush=True)
        print(f"[VIDEO_RECORD_CREATED] video_id={video_id}", flush=True)
    except Exception as db_err:
        conn.rollback()
        print(f"[Upload] Database insertion failed: {db_err}")
    finally:
        conn.close()

    # ── Upload original to R2 (non-blocking — happens before pipeline) ────────
    r2_input_key = make_r2_key("uploads", filename)
    url = upload_file(input_path, r2_input_key)
    if url and (url.startswith("http://") or url.startswith("https://")):
        print(f"[R2_UPLOAD_SUCCESS] key={r2_input_key} url={url}", flush=True)
        # Update the DB record with original R2 URL
        print("[DATABASE_SAVE_STARTED]", flush=True)
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE videos SET original_url = ?, r2_url = ? WHERE video_id = ?", (url, url, video_id))
            conn.commit()
            print("[DATABASE_SAVE_SUCCESS]", flush=True)
            print(f"[VIDEO_SAVED_TO_DATABASE] video_id={video_id} updated with r2_url", flush=True)
        except Exception as e:
            conn.rollback()
            print(f"Error updating original R2 URL in DB: {e}", flush=True)
        finally:
            conn.close()

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


# ── GET /videos ──────────────────────────────────────────────────────────────

@video_bp.route("/videos", methods=["GET"])
def get_videos():
    """
    Return all videos from the database.
    """
    student_id = request.args.get("student_id", type=int)
    print(f"[VIDEO_FETCH_REQUEST] student_id={student_id}", flush=True)
    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT v.video_id, v.teacher_id, v.course_id, v.title, v.filename, v.r2_url, 
                   v.original_url, v.processed_url, v.status, v.uploaded_at, v.processed_at,
                   t.name as uploader
            FROM videos v
            LEFT JOIN teachers t ON v.teacher_id = t.teacher_id
            ORDER BY v.uploaded_at DESC
        """)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        
        videos_list = []
        for row in rows:
            video_dict = dict(zip(columns, row))
            # Format datetime objects to ISO strings
            if video_dict.get("uploaded_at"):
                if not isinstance(video_dict["uploaded_at"], str):
                    video_dict["uploaded_at"] = video_dict["uploaded_at"].isoformat()
            if video_dict.get("processed_at"):
                if not isinstance(video_dict["processed_at"], str):
                    video_dict["processed_at"] = video_dict["processed_at"].isoformat()
            
            # Add captions status based on status column
            video_dict["captions_status"] = "available" if video_dict.get("status") == "done" else "unavailable"
            
            # Map local absolute paths to web-accessible URLs
            auth_query = f"&student_id={student_id}" if student_id else ""
            p_url = video_dict.get("processed_url")
            if p_url and not is_r2_url(p_url):
                rel_name = os.path.basename(p_url)
                video_dict["processed_url"] = f"{request.host_url.rstrip('/')}/download-signed-video?filename={rel_name}{auth_query}"
            
            o_url = video_dict.get("original_url")
            if o_url and not is_r2_url(o_url):
                rel_name = os.path.basename(o_url)
                video_dict["original_url"] = f"{request.host_url.rstrip('/')}/download-signed-video?filename={rel_name}{auth_query}"

            # Map values defensively to guarantee matches with both naming conventions
            video_dict["R2 URL"] = video_dict.get("r2_url") or video_dict.get("processed_url") or video_dict.get("original_url")
            video_dict["upload timestamp"] = video_dict.get("uploaded_at")
            video_dict["captions status"] = video_dict.get("captions_status")
            if not video_dict.get("title"):
                video_dict["title"] = video_dict.get("filename") or "Untitled"
            if not video_dict.get("uploader"):
                video_dict["uploader"] = "Teacher"
            
            videos_list.append(video_dict)
            
        if student_id:
            try:
                from routes.quiz_analytics import get_student_progress_list
                _, lessons = get_student_progress_list(student_id)
                lock_map = {les["lesson_id"]: les["is_locked"] for les in lessons}
                for v in videos_list:
                    lesson_id = f"v_{v['video_id']}"
                    v["is_locked"] = lock_map.get(lesson_id, True)
            except Exception as e:
                print(f"Error setting video locks: {e}")
                for v in videos_list:
                    v["is_locked"] = False
        else:
            for v in videos_list:
                v["is_locked"] = False

        print(f"[VIDEO_LIST_FETCHED] count={len(videos_list)}", flush=True)
        print(f"[VIDEO_URL_RETURNED] count={len(videos_list)}", flush=True)
        return jsonify({"videos": videos_list})
    except Exception as e:
        print(f"Error fetching videos: {e}", flush=True)
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


# ── GET /video-status ─────────────────────────────────────────────────────────

@video_bp.route("/video-status", methods=["GET"])
def video_status():
    """Poll job status. When done, returns `video_url` pointing to R2 (or local path)."""
    job_id = request.args.get("job_id")
    if not job_id:
        return jsonify({"error": "Missing job_id"}), 400

    status = get_job_status(job_id)
    return jsonify(status)


def _find_video_url_in_db(video_id=None, filename=None):
    """
    Search database for video record and return the best available URL and filename.
    """
    if not video_id and not filename:
        return None, None

    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if video_id:
            cursor.execute("""
                SELECT r2_url, processed_url, original_url, status, filename 
                FROM videos 
                WHERE video_id = ?
            """, (video_id,))
        else:
            # Query by filename or title
            cursor.execute("""
                SELECT r2_url, processed_url, original_url, status, filename 
                FROM videos 
                WHERE filename = ? OR title = ? OR filename = ?
                ORDER BY uploaded_at DESC LIMIT 1
            """, (filename, filename, f"signed_{filename}"))
        
        row = cursor.fetchone()
        if row:
            columns = [desc[0] for desc in cursor.description]
            video_data = dict(zip(columns, row))
            
            # Prefer r2_url or processed_url
            url = video_data.get("r2_url") or video_data.get("processed_url")
            
            # Fallback to original_url
            if not url:
                url = video_data.get("original_url")
                
            return url, video_data.get("filename")
    except Exception as e:
        print(f"Error querying DB for video: {e}", flush=True)
    finally:
        conn.close()
    return None, None


def is_video_locked_for_student(video_id, student_id, filename=None):
    if not student_id:
        return False
    try:
        from database.db import get_db_connection
        if not video_id and filename:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT video_id FROM videos WHERE filename = ? OR title = ?", (filename, filename))
            row = cursor.fetchone()
            if row:
                video_id = row[0]
            conn.close()
            
        if not video_id:
            return False
            
        from routes.quiz_analytics import get_student_progress_list
        _, lessons = get_student_progress_list(student_id)
        lesson_id = f"v_{video_id}"
        for les in lessons:
            if les["lesson_id"] == lesson_id:
                return les["is_locked"]
    except Exception as e:
        print(f"Error checking lock status: {e}", flush=True)
    return False


# ── GET /download-signed-video ────────────────────────────────────────────────

@video_bp.route("/download-signed-video", methods=["GET"])
def download_signed_video():
    """
    Return the processed video inline for browser streaming.

    If R2 is configured: 307 redirect → browser fetches directly from Cloudflare.
    If local mode:       stream file inline via send_file(..., as_attachment=False, conditional=True).

    Query params:
        job_id   (optional) — used to look up the R2 URL from job state
        video_id (optional) — used to look up from database
        filename (required) — fallback if no job_id/video_id
    """
    job_id   = request.args.get("job_id")
    video_id = request.args.get("video_id", type=int)
    filename = request.args.get("filename", "")
    student_id = request.args.get("student_id", type=int)
    teacher_id = request.args.get("teacher_id", type=int)

    print(f"[VIDEO_PLAY_REQUEST] video_id={video_id} filename={filename}", flush=True)

    if not student_id and not teacher_id:
        return jsonify({"error": "Unauthorized: student_id or teacher_id is required.", "locked": True}), 403

    if student_id and is_video_locked_for_student(video_id, student_id, filename):
        return jsonify({"error": "You must score at least 35% on the previous quiz to unlock this lesson.", "locked": True}), 403

    # 1. Prefer looking up R2 URL from job state
    if job_id:
        state = get_job_status(job_id)
        video_url = state.get("video_url", "")
        if video_url and is_r2_url(video_url):
            return redirect(video_url, code=307)

    # 2. Try database lookup by video_id or filename
    db_url, db_filename = _find_video_url_in_db(video_id=video_id, filename=filename)
    if db_url:
        if is_r2_url(db_url):
            return redirect(db_url, code=307)
        if os.path.exists(db_url):
            print(f"[VIDEO_STREAM_STARTED] path={db_url}", flush=True)
            try:
                return send_file(db_url, as_attachment=False, conditional=True, mimetype="video/mp4")
            except Exception as e:
                print(f"[VIDEO_STREAM_FAILED] path={db_url} error={e}", flush=True)
                raise
        if db_filename:
            local_processed = os.path.join(PROCESSED_FOLDER, f"signed_{db_filename}")
            if os.path.exists(local_processed):
                print(f"[VIDEO_STREAM_STARTED] path={local_processed}", flush=True)
                try:
                    return send_file(local_processed, as_attachment=False, conditional=True, mimetype="video/mp4")
                except Exception as e:
                    print(f"[VIDEO_STREAM_FAILED] path={local_processed} error={e}", flush=True)
                    raise
            local_original = os.path.join(UPLOAD_FOLDER, db_filename)
            if os.path.exists(local_original):
                print(f"[VIDEO_STREAM_STARTED] path={local_original}", flush=True)
                try:
                    return send_file(local_original, as_attachment=False, conditional=True, mimetype="video/mp4")
                except Exception as e:
                    print(f"[VIDEO_STREAM_FAILED] path={local_original} error={e}", flush=True)
                    raise

    # 3. Fallback: construct URL from filename
    if not filename:
        return jsonify({"error": "Missing filename or job_id/video_id"}), 400

    filename = secure_filename(filename)

    for name in [filename, f"signed_{filename}"]:
        if _r2_enabled():
            r2_key  = make_r2_key("processed", name)
            pub_url = get_public_url(r2_key)
            if is_r2_url(pub_url):
                return redirect(pub_url, code=307)
        local_path = os.path.join(PROCESSED_FOLDER, name)
        if os.path.exists(local_path):
            print(f"[VIDEO_STREAM_STARTED] path={local_path}", flush=True)
            try:
                return send_file(local_path, as_attachment=False, conditional=True, mimetype="video/mp4")
            except Exception as e:
                print(f"[VIDEO_STREAM_FAILED] path={local_path} error={e}", flush=True)
                raise
        local_upload_path = os.path.join(UPLOAD_FOLDER, name)
        if os.path.exists(local_upload_path):
            print(f"[VIDEO_STREAM_STARTED] path={local_upload_path}", flush=True)
            try:
                return send_file(local_upload_path, as_attachment=False, conditional=True, mimetype="video/mp4")
            except Exception as e:
                print(f"[VIDEO_STREAM_FAILED] path={local_upload_path} error={e}", flush=True)
                raise

    print(f"[VIDEO_STREAM_FAILED] file not found filename={filename}", flush=True)
    return jsonify({"error": "File not found. Processing may still be in progress."}), 404


# ── GET /video-url ────────────────────────────────────────────────────────────

@video_bp.route("/video-url", methods=["GET"])
def get_video_url():
    """
    Return the direct URL for a processed video (for embedding in the frontend).

    Query params:
        job_id   — look up from job state (preferred)
        video_id — look up from database
        filename — fallback
    """
    job_id   = request.args.get("job_id")
    video_id = request.args.get("video_id", type=int)
    filename = request.args.get("filename", "")
    student_id = request.args.get("student_id", type=int)
    teacher_id = request.args.get("teacher_id", type=int)

    print(f"[VIDEO_FETCH_REQUEST] video_id={video_id} job_id={job_id} filename={filename}", flush=True)

    if not student_id and not teacher_id:
        return jsonify({"error": "Unauthorized: student_id or teacher_id is required.", "locked": True}), 403

    if student_id and is_video_locked_for_student(video_id, student_id, filename):
        return jsonify({"error": "You must score at least 35% on the previous quiz to unlock this lesson.", "locked": True}), 403

    auth_query = f"&student_id={student_id}" if student_id else f"&teacher_id={teacher_id}"

    # 1. Prefer looking up R2 URL from job state
    if job_id:
        state = get_job_status(job_id)
        video_url = state.get("video_url", "")
        if video_url:
            print(f"[VIDEO_URL_RETURNED] video_url={video_url}", flush=True)
            return jsonify({"video_url": video_url, "source": "job_state"})

    # 2. Try database lookup by video_id or filename
    db_url, db_filename = _find_video_url_in_db(video_id=video_id, filename=filename)
    if db_url:
        if is_r2_url(db_url):
            print(f"[VIDEO_URL_RETURNED] video_url={db_url}", flush=True)
            return jsonify({"video_url": db_url, "source": "database_r2"})
        if os.path.exists(db_url):
            rel_name = os.path.basename(db_url)
            video_url = f"{request.host_url.rstrip('/')}/download-signed-video?filename={rel_name}{auth_query}"
            print(f"[VIDEO_URL_RETURNED] video_url={video_url}", flush=True)
            return jsonify({
                "video_url": video_url,
                "source": "database_local"
            })
        if db_filename:
            local_processed = os.path.join(PROCESSED_FOLDER, f"signed_{db_filename}")
            if os.path.exists(local_processed):
                video_url = f"{request.host_url.rstrip('/')}/download-signed-video?filename=signed_{db_filename}{auth_query}"
                print(f"[VIDEO_URL_RETURNED] video_url={video_url}", flush=True)
                return jsonify({
                    "video_url": video_url,
                    "source": "database_local_processed"
                })
            local_original = os.path.join(UPLOAD_FOLDER, db_filename)
            if os.path.exists(local_original):
                video_url = f"{request.host_url.rstrip('/')}/download-signed-video?filename={db_filename}{auth_query}"
                print(f"[VIDEO_URL_RETURNED] video_url={video_url}", flush=True)
                return jsonify({
                    "video_url": video_url,
                    "source": "database_local_original"
                })

    # 3. Fallback: construct URL from filename
    if not filename:
        return jsonify({"error": "Missing job_id, video_id, or filename"}), 400

    filename = secure_filename(filename)

    for name in [filename, f"signed_{filename}"]:
        if _r2_enabled():
            r2_key  = make_r2_key("processed", name)
            pub_url = get_public_url(r2_key)
            print(f"[VIDEO_URL_RETURNED] video_url={pub_url}", flush=True)
            return jsonify({"video_url": pub_url, "source": "r2"})

        local_path = os.path.join(PROCESSED_FOLDER, name)
        if os.path.exists(local_path):
            video_url = f"{request.host_url.rstrip('/')}/download-signed-video?filename={name}{auth_query}"
            print(f"[VIDEO_URL_RETURNED] video_url={video_url}", flush=True)
            return jsonify({
                "video_url": video_url,
                "source": "local_processed"
            })
        local_upload_path = os.path.join(UPLOAD_FOLDER, name)
        if os.path.exists(local_upload_path):
            video_url = f"{request.host_url.rstrip('/')}/download-signed-video?filename={name}{auth_query}"
            print(f"[VIDEO_URL_RETURNED] video_url={video_url}", flush=True)
            return jsonify({
                "video_url": video_url,
                "source": "local_original"
            })

    return jsonify({"error": "Video not found"}), 404


# ── POST /extract-captions ────────────────────────────────────────────────────

@video_bp.route("/extract-captions", methods=["POST"])
def extract_captions():
    """
    Extract captions from an uploaded video using speech recognition.
    The video is uploaded to R2 (if configured), registered in the database,
    transcribed, and marked as done.
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
    title      = request.form.get("title") or file.filename
    print(f"[VIDEO_UPLOAD_STARTED] filename={filename}", flush=True)
    print(f"[UPLOAD_STARTED] filename={filename}", flush=True)
    print(f"[VIDEO_RECEIVED] route=extract-captions filename={filename}")
    print(f"[CAPTION_REQUEST_STARTED] route=extract-captions filename={filename}")
    
    input_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(input_path)
    print(f"[VIDEO_UPLOAD_SUCCESS] filename={filename}", flush=True)

    if not os.path.exists(input_path) or os.path.getsize(input_path) == 0:
        return jsonify({"error": "Upload failed: file is empty or could not be saved"}), 500

    # Save to database (initially processing)
    teacher_id = request.form.get("teacher_id", 1, type=int)
    course_id = request.form.get("course_id", 1, type=int)

    from database.db import get_db_connection
    print("[DATABASE_SAVE_STARTED]", flush=True)
    conn = get_db_connection()
    cursor = conn.cursor()
    video_id = None
    try:
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
            INSERT INTO videos (teacher_id, course_id, title, filename, original_url, processed_url, status)
            VALUES (?, ?, ?, ?, ?, ?, 'processing')
        """, (teacher_id, course_id, title, filename, input_path, input_path))
        video_id = cursor.lastrowid
        conn.commit()
        print("[DATABASE_SAVE_SUCCESS]", flush=True)
        print(f"[VIDEO_SAVED_TO_DATABASE] video_id={video_id} filename={filename}", flush=True)
        print(f"[VIDEO_RECORD_CREATED] video_id={video_id}", flush=True)
    except Exception as db_err:
        conn.rollback()
        print(f"[Upload] Database insertion failed: {db_err}")
    finally:
        conn.close()

    # Upload original to R2 (synchronously, since this is simple)
    r2_key = make_r2_key("uploads", filename)
    url = upload_file(input_path, r2_key)
    if url and (url.startswith("http://") or url.startswith("https://")):
        print(f"[R2_UPLOAD_SUCCESS] key={r2_key} url={url}", flush=True)
        print("[DATABASE_SAVE_STARTED]", flush=True)
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE videos SET original_url = ?, processed_url = ?, r2_url = ? WHERE video_id = ?", (url, url, url, video_id))
            conn.commit()
            print("[DATABASE_SAVE_SUCCESS]", flush=True)
        except Exception as e:
            conn.rollback()
            print(f"Error updating R2 URL in DB: {e}", flush=True)
        finally:
            conn.close()

    # Transcribe audio
    from utils.speech_to_text import transcribe_audio
    try:
        captions = transcribe_audio(input_path)
        if not captions:
            captions = [{"text": "No speech detected in video.", "start": 0.0, "end": 2.0}]

        # Save transcript & captions to DB and mark status as done
        print("[DATABASE_SAVE_STARTED]", flush=True)
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            full_transcript = " ".join([cap["text"] for cap in captions])
            cursor.execute("""
                UPDATE videos 
                SET status = 'done', transcript = ?, processed_at = CURRENT_TIMESTAMP
                WHERE video_id = ?
            """, (full_transcript, video_id))

            # Delete any old captions for this video_id
            cursor.execute("DELETE FROM video_captions WHERE video_id = ?", (video_id,))

            # Insert captions
            for cap in captions:
                cursor.execute("""
                    INSERT INTO video_captions (video_id, start_time, end_time, text)
                    VALUES (?, ?, ?, ?)
                """, (video_id, cap["start"], cap["end"], cap["text"]))

            conn.commit()
            print("[DATABASE_SAVE_SUCCESS]", flush=True)
        except Exception as e:
            conn.rollback()
            print(f"Error saving captions to DB: {e}", flush=True)
        finally:
            conn.close()

    except Exception as e:
        print(f"Transcription failed: {e}", flush=True)
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE videos SET status = 'error' WHERE video_id = ?", (video_id,))
            conn.commit()
        except Exception:
            pass
        finally:
            conn.close()
        return jsonify({"error": f"Transcription failed: {str(e)}"}), 500
    finally:
        # Keep local file if R2 is disabled, otherwise clean it up
        if url and (url.startswith("http://") or url.startswith("https://")):
            _cleanup_local(input_path)

    return jsonify({
        "status": "done",
        "video_id": video_id,
        "filename": filename,
        "captions": captions
    })


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
    Get captions for a video by video_id, job_id, or filename.
    Query params:
        video_id - ID in the videos database table
        job_id   - UUID from active job state
        filename - Name of original or processed file
        format   - 'json' (default), 'srt', or 'vtt'
    """
    video_id = request.args.get("video_id", type=int)
    job_id = request.args.get("job_id")
    filename = request.args.get("filename")
    fmt = request.args.get("format", "json").lower()
    
    if not video_id and not job_id and not filename:
        return jsonify({"error": "Missing video_id, job_id, or filename"}), 400

    # If video_id is missing but filename is provided, look up video_id in database
    if not video_id and filename:
        from database.db import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT video_id FROM videos 
                WHERE filename = ? OR title = ? OR filename = ?
                ORDER BY uploaded_at DESC LIMIT 1
            """, (filename, filename, f"signed_{filename}"))
            row = cursor.fetchone()
            if row:
                video_id = row[0]
        except Exception as e:
            print(f"Error looking up video_id by filename: {e}", flush=True)
        finally:
            conn.close()
        
    captions = []
    
    # 1. Fetch from database if video_id is provided (or resolved)
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
    print(f"[CAPTION_FETCHED] video_id={video_id} job_id={job_id} format={fmt} count={len(captions)}")
            
    if fmt == "srt":
        srt_content = generate_srt(captions)
        name = f"captions_{video_id or job_id or filename}.srt"
        return srt_content, 200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": f"attachment; filename={name}"
        }
    elif fmt == "vtt":
        vtt_content = generate_vtt(captions)
        name = f"captions_{video_id or job_id or filename}.vtt"
        return vtt_content, 200, {
            "Content-Type": "text/vtt; charset=utf-8",
            "Content-Disposition": f"attachment; filename={name}"
        }
    else:
        return jsonify({"video_id": video_id, "job_id": job_id, "filename": filename, "captions": captions})


# ── DELETE /videos/<video_id> ─────────────────────────────────────────────────

@video_bp.route("/videos/<int:video_id>", methods=["DELETE"])
def delete_video(video_id):
    """
    Delete a video record and its associated files/captions.

    Query params:
        teacher_id (required) — must match the video's uploader for authorization

    Cascade deletes:
        - video_captions  (via FK ON DELETE CASCADE + explicit)
        - video_views     (via FK ON DELETE CASCADE + explicit)
        - videos          (the record itself)

    Storage cleanup:
        - R2: deletes uploads/<filename> and processed/signed_<filename>
        - Local: removes files from uploads/ and processed_videos/ directories
    """
    teacher_id = request.args.get("teacher_id", type=int)
    if not teacher_id:
        return jsonify({"error": "teacher_id is required"}), 400

    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Fetch video record and verify ownership
        cursor.execute(
            "SELECT video_id, teacher_id, filename, r2_url, original_url, processed_url "
            "FROM videos WHERE video_id = ?",
            (video_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Video not found"}), 404

        cols = [d[0] for d in cursor.description]
        video = dict(zip(cols, row))

        if video["teacher_id"] != teacher_id:
            return jsonify({"error": "Forbidden: you do not own this video"}), 403

        filename = video.get("filename") or ""
        r2_url   = video.get("r2_url") or ""

        # ── Storage cleanup ────────────────────────────────────────────────
        if r2_url and is_r2_url(r2_url):
            # Delete both the original upload and the processed signed copy from R2
            delete_file(make_r2_key("uploads", filename))
            delete_file(make_r2_key("processed", f"signed_{filename}"))
            print(f"[DELETE_VIDEO] R2 objects deleted for video_id={video_id}", flush=True)
        else:
            # Local filesystem cleanup
            for folder, name in [
                (UPLOAD_FOLDER, filename),
                (PROCESSED_FOLDER, f"signed_{filename}"),
                (UPLOAD_FOLDER, video.get("original_url", "")),
                (PROCESSED_FOLDER, video.get("processed_url", "")),
            ]:
                for candidate in [os.path.join(folder, name), name]:
                    if candidate and os.path.isfile(candidate):
                        try:
                            os.remove(candidate)
                            print(f"[DELETE_VIDEO] Removed local file: {candidate}", flush=True)
                        except OSError as oe:
                            print(f"[DELETE_VIDEO] Could not remove {candidate}: {oe}", flush=True)

        # ── Database cascade cleanup ───────────────────────────────────────
        cursor.execute("DELETE FROM video_captions WHERE video_id = ?", (video_id,))
        cursor.execute("DELETE FROM video_views    WHERE video_id = ?", (video_id,))
        cursor.execute("DELETE FROM videos         WHERE video_id = ?", (video_id,))
        conn.commit()

        print(f"[DELETE_VIDEO] video_id={video_id} deleted by teacher_id={teacher_id}", flush=True)
        return jsonify({"success": True, "video_id": video_id, "message": "Video deleted successfully"})

    except Exception as e:
        conn.rollback()
        print(f"[DELETE_VIDEO] Error deleting video_id={video_id}: {e}", flush=True)
        return jsonify({"error": f"Failed to delete video: {str(e)}"}), 500
    finally:
        conn.close()


# ── PUT /videos/<video_id> ────────────────────────────────────────────────────

@video_bp.route("/videos/<int:video_id>", methods=["PUT"])
def update_video(video_id):
    """
    Update video metadata (title, description, subject, chapter).

    Body (JSON):
        title       (str, optional)
        description (str, optional)
        subject     (str, optional)
        chapter     (str, optional)

    Query params:
        teacher_id (required) — must match the video's uploader
    """
    teacher_id = request.args.get("teacher_id", type=int)
    if not teacher_id:
        return jsonify({"error": "teacher_id is required"}), 400

    body = request.get_json(force=True, silent=True) or {}

    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Verify ownership
        cursor.execute(
            "SELECT video_id, teacher_id FROM videos WHERE video_id = ?",
            (video_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Video not found"}), 404

        cols = [d[0] for d in cursor.description]
        video = dict(zip(cols, row))
        if video["teacher_id"] != teacher_id:
            return jsonify({"error": "Forbidden: you do not own this video"}), 403

        # Build dynamic UPDATE
        allowed_fields = ["title", "description", "subject", "chapter"]
        updates = {f: body[f] for f in allowed_fields if f in body}
        if not updates:
            return jsonify({"error": "No updatable fields provided"}), 400

        set_clause = ", ".join(f"{f} = ?" for f in updates)
        values = list(updates.values()) + [video_id]

        # Use ALTER TABLE … ADD COLUMN IF NOT EXISTS (SQLite-safe via try/except)
        for col, col_type in [("description", "TEXT"), ("subject", "VARCHAR(100)"), ("chapter", "VARCHAR(100)")]:
            try:
                cursor.execute(f"ALTER TABLE videos ADD COLUMN {col} {col_type} DEFAULT NULL")
                conn.commit()
            except Exception:
                pass  # Column already exists

        cursor.execute(f"UPDATE videos SET {set_clause} WHERE video_id = ?", values)
        conn.commit()

        # Return updated record
        cursor.execute(
            "SELECT video_id, teacher_id, course_id, title, filename, r2_url, "
            "original_url, processed_url, status, uploaded_at FROM videos WHERE video_id = ?",
            (video_id,),
        )
        updated_row = cursor.fetchone()
        updated_cols = [d[0] for d in cursor.description]
        updated = dict(zip(updated_cols, updated_row))
        if updated.get("uploaded_at") and not isinstance(updated["uploaded_at"], str):
            updated["uploaded_at"] = updated["uploaded_at"].isoformat()

        print(f"[UPDATE_VIDEO] video_id={video_id} updated by teacher_id={teacher_id} fields={list(updates.keys())}", flush=True)
        return jsonify({"success": True, "video": updated})

    except Exception as e:
        conn.rollback()
        print(f"[UPDATE_VIDEO] Error updating video_id={video_id}: {e}", flush=True)
        return jsonify({"error": f"Failed to update video: {str(e)}"}), 500
    finally:
        conn.close()


# ── GET /videos/<video_id> ────────────────────────────────────────────────────

@video_bp.route("/videos/<int:video_id>", methods=["GET"])
def get_video(video_id):
    """
    Fetch a single video record by ID.
    """
    teacher_id = request.args.get("teacher_id", type=int)
    student_id = request.args.get("student_id", type=int)

    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT v.video_id, v.teacher_id, v.course_id, v.title, v.filename, v.r2_url, "
            "v.original_url, v.processed_url, v.status, v.uploaded_at, v.processed_at, "
            "t.name as uploader "
            "FROM videos v LEFT JOIN teachers t ON v.teacher_id = t.teacher_id "
            "WHERE v.video_id = ?",
            (video_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Video not found"}), 404

        cols = [d[0] for d in cursor.description]
        video = dict(zip(cols, row))
        if video.get("uploaded_at") and not isinstance(video["uploaded_at"], str):
            video["uploaded_at"] = video["uploaded_at"].isoformat()

        auth_query = f"&teacher_id={teacher_id}" if teacher_id else (f"&student_id={student_id}" if student_id else "")
        for url_key in ["processed_url", "original_url"]:
            u = video.get(url_key)
            if u and not is_r2_url(u):
                rel = os.path.basename(u)
                video[url_key] = f"{request.host_url.rstrip('/')}/download-signed-video?filename={rel}{auth_query}"

        return jsonify({"video": video})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

