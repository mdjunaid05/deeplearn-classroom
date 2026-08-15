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
import mimetypes
import traceback
from flask import Blueprint, request, jsonify, send_file, redirect
from werkzeug.utils import secure_filename
from utils.video_pipeline import start_pipeline, get_job_status
from utils.storage import (
    upload_file, get_public_url, delete_file, download_file,
    is_r2_url, make_r2_key, make_structured_r2_key,
    generate_presigned_upload_url, verify_upload, download_from_r2,
    _r2_enabled
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

# MIME type map for video content-type detection
VIDEO_CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
}

def _detect_video_content_type(filename: str) -> str:
    """Detect the content type from a video filename."""
    ext = os.path.splitext(filename)[1].lower()
    return VIDEO_CONTENT_TYPES.get(ext, "video/mp4")


def _allowed_file(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS


def _get_base_url() -> str:
    """Return the correct external base URL, respecting reverse-proxy headers.

    On Render (and similar PaaS), the app sits behind a TLS-terminating proxy.
    Flask's request.host_url ignores X-Forwarded-Proto and always returns
    http://, which causes mixed-content blocks when the frontend is on HTTPS.
    This helper reads the standard proxy headers to reconstruct the real URL.
    """
    proto = request.headers.get("X-Forwarded-Proto", request.scheme)
    host  = request.headers.get("X-Forwarded-Host", request.host)
    return f"{proto}://{host}"


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
    print(f"[UPLOAD_REQUEST_RECEIVED] route=upload-video method={request.method} content_type={request.content_type}", flush=True)

    if "video_file" not in request.files:
        print("[UPLOAD_REQUEST_RECEIVED] ERROR: No video_file field in multipart form", flush=True)
        return jsonify({"error": "No video_file provided"}), 400
    print(f"[UPLOAD_REQUEST_RECEIVED] route=upload-video", flush=True)

    file = request.files["video_file"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not _allowed_file(file.filename):
        return jsonify({
            "error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        }), 400

    filename        = secure_filename(file.filename)
    title           = request.form.get("title") or file.filename
    content_type    = _detect_video_content_type(filename)

    print(f"[FILE_VALIDATED] filename={filename} content_type={content_type}", flush=True)
    print(f"[VIDEO_UPLOAD_STARTED] filename={filename}", flush=True)

    input_path      = os.path.join(UPLOAD_FOLDER, filename)
    output_filename = f"signed_{filename}"
    output_path     = os.path.join(PROCESSED_FOLDER, output_filename)

    # ── Save to local disk first ──────────────────────────────────────────────
    file.save(input_path)
    file_size = os.path.getsize(input_path) if os.path.exists(input_path) else 0
    print(f"[VIDEO_UPLOAD_SUCCESS] filename={filename} size={file_size}", flush=True)

    if not os.path.exists(input_path) or file_size == 0:
        print(f"[R2_UPLOAD_FAILED] File empty or missing after save: {input_path}", flush=True)
        return jsonify({"error": "Upload failed: file is empty or could not be saved"}), 500

    if file_size > MAX_UPLOAD_BYTES:
        _cleanup_local(input_path)
        return jsonify({"error": f"File too large ({file_size / (1024*1024):.1f} MB). Maximum is {MAX_UPLOAD_BYTES / (1024*1024):.0f} MB."}), 413

    # ── Save to database ──────────────────────────────────────────────────────
    teacher_id = request.form.get("teacher_id", 1, type=int)
    course_id = request.form.get("course_id", 1, type=int)
    description = request.form.get("description") or ""
    visibility = request.form.get("visibility") or "Published"
    thumbnail = request.form.get("thumbnail") or ""
    hidden = request.form.get("hidden", 0, type=int)
    deleted = request.form.get("deleted", 0, type=int)
    archived = request.form.get("archived", 0, type=int)

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
            INSERT INTO videos (teacher_id, course_id, title, filename, original_url, processed_url, status, 
                upload_status, processing_status, caption_status, signing_status,
                description, thumbnail, visibility, hidden, deleted, archived)
            VALUES (?, ?, ?, ?, ?, ?, 'processing', 
                'uploading', 'pending', 'pending', 'pending',
                ?, ?, ?, ?, ?, ?)
        """, (teacher_id, course_id, title, filename, input_path, output_path, description, thumbnail, visibility, hidden, deleted, archived))
        video_id = cursor.lastrowid
        conn.commit()
        print("[DATABASE_SAVE_SUCCESS]", flush=True)
        print(f"[VIDEO_UPLOADED] video_id={video_id} filename={filename}", flush=True)
        print(f"[DATABASE_RECORD_CREATED] video_id={video_id}", flush=True)
        print(f"[CLASSROOM_ID] classroom_id={course_id}", flush=True)
        print(f"[COURSE_ID] course_id={course_id}", flush=True)
        print(f"[VIDEO_SAVED_TO_DATABASE] video_id={video_id} filename={filename}", flush=True)
        print(f"[VIDEO_RECORD_CREATED] video_id={video_id}", flush=True)
    except Exception as db_err:
        conn.rollback()
        print(f"[DATABASE_SAVE_FAILED] error={db_err} traceback={traceback.format_exc()}", flush=True)
    finally:
        conn.close()

    # ── Upload original to R2 (non-blocking — happens before pipeline) ────────
    r2_input_key = make_r2_key("uploads", filename)
    url = upload_file(input_path, r2_input_key, content_type=content_type)
    if url and is_r2_url(url):
        print(f"[R2_UPLOAD_SUCCESS] key={r2_input_key} url={url}", flush=True)
        print(f"[VIDEO_UPLOADED] video_id={video_id} url={url}", flush=True)
        # Update the DB record with original R2 URL
        print("[DATABASE_SAVE_STARTED]", flush=True)
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            r2_input_key = make_r2_key("uploads", filename)
            cursor.execute("UPDATE videos SET original_url = ?, r2_url = ?, r2_key = ?, upload_status = 'uploaded' WHERE video_id = ?", (url, url, r2_input_key, video_id))
            conn.commit()
            print("[DATABASE_SAVE_SUCCESS]", flush=True)
            print(f"[VIDEO_SAVED_TO_DATABASE] video_id={video_id} updated with r2_url={url}", flush=True)
            print(f"[VIDEO_LIST_UPDATED] video_id={video_id}", flush=True)
        except Exception as e:
            conn.rollback()
            print(f"[DATABASE_SAVE_FAILED] error={e} traceback={traceback.format_exc()}", flush=True)
        finally:
            conn.close()
    else:
        print(f"[R2_UPLOAD_FAILED] R2 upload returned local path, video stays on disk: {url}", flush=True)

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


def _get_app_base_url():
    """Return base URL using https protocol when running behind reverse proxies (Render/Vercel)."""
    return _get_base_url()


# ── POST /request-upload-url ──────────────────────────────────────────────────

@video_bp.route("/request-upload-url", methods=["POST"])
def request_upload_url():
    """
    Generate a presigned PUT URL for direct browser-to-R2 upload.
    
    The browser will use this URL to upload the file directly to Cloudflare R2.
    R2 secret credentials NEVER leave the backend.
    
    Flow:
        1. Frontend calls this endpoint with metadata
        2. Backend creates DB record + generates presigned URL
        3. Frontend uploads directly to R2 using the presigned URL
        4. Frontend calls /confirm-upload to verify and start processing
    
    Request JSON:
        { "teacher_id": 1, "course_id": 1, "filename": "lecture.mp4", 
          "content_type": "video/mp4", "title": "My Lecture", "file_size": 12345678 }
    
    Returns:
        { "upload_url": "https://...", "r2_key": "original/1/42/original.mp4",
          "video_id": 42, "expires_in": 3600 }
    """
    if not _r2_enabled():
        return jsonify({"error": "R2 storage not configured. Use /upload-video (proxy upload) instead."}), 503
    
    data = request.get_json(silent=True) or {}
    teacher_id = data.get("teacher_id", 1)
    course_id = data.get("course_id", 1)
    filename = secure_filename(data.get("filename", "video.mp4"))
    content_type = data.get("content_type", "video/mp4")
    title = data.get("title") or filename
    file_size = data.get("file_size", 0)
    description = data.get("description", "")
    visibility = data.get("visibility", "Published")
    
    if not _allowed_file(filename):
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400
    
    # Create database record first (status = 'uploading')
    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    video_id = None
    try:
        # Ensure referenced rows exist
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
            INSERT INTO videos (
                teacher_id, course_id, title, filename, status,
                upload_status, processing_status, caption_status, signing_status,
                description, visibility, file_size
            ) VALUES (?, ?, ?, ?, 'uploading',
                'uploading', 'pending', 'pending', 'pending',
                ?, ?, ?)
        """, (teacher_id, course_id, title, filename, description, visibility, file_size))
        video_id = cursor.lastrowid
        
        # Generate R2 key using new structured format
        r2_key = make_structured_r2_key("original", course_id, video_id, filename)
        
        # Update the record with the R2 key
        cursor.execute("UPDATE videos SET r2_key = ? WHERE video_id = ?", (r2_key, video_id))
        conn.commit()
        
        print(f"[PRESIGNED_UPLOAD_REQUESTED] video_id={video_id} r2_key={r2_key}", flush=True)
    except Exception as db_err:
        conn.rollback()
        print(f"[PRESIGNED_UPLOAD_DB_FAILED] error={db_err}", flush=True)
        return jsonify({"error": f"Database error: {str(db_err)}"}), 500
    finally:
        conn.close()
    
    # Generate presigned PUT URL
    expires_in = 3600  # 1 hour
    upload_url = generate_presigned_upload_url(r2_key, content_type=content_type, expires_in=expires_in)
    
    if not upload_url:
        # Mark as failed if we can't generate URL
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE videos SET upload_status = 'failed' WHERE video_id = ?", (video_id,))
        conn.commit()
        conn.close()
        return jsonify({"error": "Failed to generate presigned upload URL"}), 500
    
    return jsonify({
        "upload_url": upload_url,
        "r2_key": r2_key,
        "video_id": video_id,
        "expires_in": expires_in,
        "content_type": content_type,
    })


# ── POST /confirm-upload ──────────────────────────────────────────────────────

@video_bp.route("/confirm-upload", methods=["POST"])
def confirm_upload():
    """
    Verify that a direct-to-R2 upload completed successfully, then start the
    video processing pipeline.
    
    Called by the frontend AFTER uploading directly to R2 via presigned URL.
    
    Request JSON:
        { "video_id": 42, "r2_key": "original/1/42/original.mp4" }
    
    Steps:
        1. Verify R2 object exists (head_object)
        2. Update DB: upload_status='uploaded', original_url, r2_url
        3. Download video from R2 to local temp dir for pipeline
        4. Start pipeline in background
    
    Returns:
        { "status": "processing", "job_id": "...", "video_id": 42 }
    """
    data = request.get_json(silent=True) or {}
    video_id = data.get("video_id")
    r2_key = data.get("r2_key")
    
    if not video_id or not r2_key:
        return jsonify({"error": "video_id and r2_key are required"}), 400
    
    # Step 1: Verify the R2 object exists
    if not verify_upload(r2_key):
        # Don't delete the DB record — this is a recoverable state
        from database.db import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE videos SET upload_status = 'failed' WHERE video_id = ?", (video_id,))
        conn.commit()
        conn.close()
        return jsonify({
            "error": "R2 object not found. Upload may have failed.",
            "video_id": video_id,
            "recoverable": True,
        }), 404
    
    # Step 2: Update DB with confirmed upload info
    from database.db import get_db_connection
    r2_url = get_public_url(r2_key)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE videos SET 
                upload_status = 'uploaded',
                original_url = ?, 
                r2_url = ?, 
                r2_key = ?,
                status = 'processing',
                processing_status = 'pending',
                updated_at = CURRENT_TIMESTAMP
            WHERE video_id = ?
        """, (r2_url, r2_url, r2_key, video_id))
        
        # Fetch filename for pipeline
        cursor.execute("SELECT filename, course_id FROM videos WHERE video_id = ?", (video_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Video record not found"}), 404
        filename = row[0]
        course_id = row[1]
        
        conn.commit()
        print(f"[CONFIRM_UPLOAD_SUCCESS] video_id={video_id} r2_key={r2_key}", flush=True)
    except Exception as db_err:
        conn.rollback()
        return jsonify({"error": f"Database error: {str(db_err)}"}), 500
    finally:
        conn.close()
    
    # Step 3: Download from R2 to local temp for pipeline processing
    input_path = os.path.join(UPLOAD_FOLDER, filename)
    output_filename = f"signed_{filename}"
    output_path = os.path.join(PROCESSED_FOLDER, output_filename)
    
    if not download_from_r2(r2_key, input_path):
        # Fallback: pipeline can still work if R2 public URL is accessible
        print(f"[CONFIRM_UPLOAD] R2 download failed, pipeline will attempt with URL", flush=True)
    
    # Step 4: Start pipeline — ISL output goes to isl/{videoId}/isl-video.mp4
    isl_r2_key = f"isl/{video_id}/isl-video.mp4"
    job_id = start_pipeline(
        input_path,
        output_path,
        output_r2_key=isl_r2_key,
        video_id=video_id
    )
    
    return jsonify({
        "status": "processing",
        "job_id": job_id,
        "video_id": video_id,
        "filename": output_filename,
    })


# ── GET /videos ──────────────────────────────────────────────────────────────

@video_bp.route("/videos", methods=["GET"])
def get_videos():
    """
    Return all videos from the database.
    If student_id is provided, filters for published videos in classes the student is enrolled in.
    """
    student_id = request.args.get("student_id", type=int)
    teacher_id = request.args.get("teacher_id", type=int)
    print(f"[VIDEO_LIST_REQUEST] student_id={student_id} teacher_id={teacher_id}", flush=True)

    from database.db import get_db_connection
    conn = get_db_connection()
    # NOTE: R2 sync now runs at startup in app.py, not per-request

    cursor = conn.cursor()

    try:
        enrolled_courses = []
        if student_id:
            cursor.execute("SELECT DISTINCT course_id FROM student_progress WHERE student_id = ?", (student_id,))
            enrolled_courses = [r[0] for r in cursor.fetchall()]
            if not enrolled_courses:
                # Fallback to course_id 1
                enrolled_courses = [1]
                print(f"[STUDENT_ENROLLMENT_FOUND] student_id={student_id} course_id=1 (fallback)", flush=True)
            else:
                print(f"[STUDENT_ENROLLMENT_FOUND] student_id={student_id} enrolled_courses={enrolled_courses}", flush=True)

            placeholders = ",".join("?" for _ in enrolled_courses)
            query = f"""
                SELECT v.*, t.name as uploader
                FROM videos v
                LEFT JOIN teachers t ON v.teacher_id = t.teacher_id
                WHERE v.course_id IN ({placeholders})
                  AND (v.visibility = 'Published' OR v.visibility IS NULL)
                  AND (v.hidden = 0 OR v.hidden IS NULL)
                  AND (v.deleted = 0 OR v.deleted IS NULL)
                  AND (v.archived = 0 OR v.archived IS NULL)
                ORDER BY v.uploaded_at DESC
            """
            cursor.execute(query, tuple(enrolled_courses))
        elif teacher_id:
            query = """
                SELECT v.*, t.name as uploader
                FROM videos v
                LEFT JOIN teachers t ON v.teacher_id = t.teacher_id
                WHERE v.teacher_id = ?
                ORDER BY v.uploaded_at DESC
            """
            cursor.execute(query, (teacher_id,))
        else:
            query = """
                SELECT v.*, t.name as uploader
                FROM videos v
                LEFT JOIN teachers t ON v.teacher_id = t.teacher_id
                WHERE (v.visibility = 'Published' OR v.visibility IS NULL)
                  AND (v.hidden = 0 OR v.hidden IS NULL)
                  AND (v.deleted = 0 OR v.deleted IS NULL)
                  AND (v.archived = 0 OR v.archived IS NULL)
                ORDER BY v.uploaded_at DESC
            """
            cursor.execute(query)

        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

        base_app_url = _get_app_base_url()
        videos_list = []
        for row in rows:
            video_dict = dict(zip(columns, row))
            if video_dict.get("uploaded_at"):
                if not isinstance(video_dict["uploaded_at"], str):
                    video_dict["uploaded_at"] = video_dict["uploaded_at"].isoformat()
            if video_dict.get("processed_at"):
                if not isinstance(video_dict["processed_at"], str):
                    video_dict["processed_at"] = video_dict["processed_at"].isoformat()

            # Use the dedicated caption_status column if available, fallback to status check
            video_dict["captions_status"] = video_dict.get("caption_status") or ("available" if video_dict.get("status") == "done" else "unavailable")

            # ── FRESH URL RESOLUTION ──────────────────────────────────────────
            # CRITICAL FIX: Presigned URLs stored in the DB expire after 7 days.
            # Always regenerate the playable URL from r2_key at request time so
            # the browser always receives a valid, non-expired URL.
            # If R2_PUBLIC_URL is set (bucket is public), get_public_url() returns
            # a permanent URL with no expiry. If not set, it generates a fresh
            # 7-day presigned URL. Either way, it is always current.
            r2_key = video_dict.get("r2_key")
            if r2_key:
                fresh_r2_url = get_public_url(r2_key)
                if fresh_r2_url and fresh_r2_url != r2_key:  # r2_key returned as-is when R2 disabled
                    video_dict["r2_url"] = fresh_r2_url
                    video_dict["original_url"] = fresh_r2_url
                    video_dict["processed_url"] = fresh_r2_url
                    print(f"[VIDEO_URL_REFRESHED] video_id={video_dict.get('video_id')} r2_key={r2_key}", flush=True)
            else:
                # No r2_key: fall back to local/legacy URL handling
                auth_query = f"&student_id={student_id}" if student_id else f"&teacher_id={teacher_id}" if teacher_id else ""
                p_url = video_dict.get("processed_url")
                if p_url and not is_r2_url(p_url):
                    rel_name = os.path.basename(p_url)
                    video_dict["processed_url"] = f"{base_app_url}/download-signed-video?filename={rel_name}{auth_query}"

                o_url = video_dict.get("original_url")
                if o_url and not is_r2_url(o_url):
                    rel_name = os.path.basename(o_url)
                    video_dict["original_url"] = f"{base_app_url}/download-signed-video?filename={rel_name}{auth_query}"

            video_dict["R2 URL"] = video_dict.get("r2_url") or video_dict.get("processed_url") or video_dict.get("original_url")
            video_dict["upload timestamp"] = video_dict.get("uploaded_at")
            video_dict["captions status"] = video_dict.get("captions_status")
            if not video_dict.get("title"):
                video_dict["title"] = video_dict.get("filename") or "Untitled"
            if not video_dict.get("uploader"):
                video_dict["uploader"] = "Teacher"

            # camelCase / snake_case mapping defensive alignment
            video_dict["videoId"] = video_dict.get("video_id")
            video_dict["originalVideoId"] = video_dict.get("original_video_id")
            video_dict["classroomId"] = video_dict.get("course_id")
            video_dict["courseId"] = video_dict.get("course_id")
            video_dict["teacherId"] = video_dict.get("teacher_id")
            # videoUrl: fresh R2 URL is the source of truth when available
            video_dict["videoUrl"] = video_dict.get("r2_url") or video_dict.get("processed_url") or video_dict.get("original_url")
            video_dict["thumbnail"] = video_dict.get("thumbnail") or ""
            video_dict["visibility"] = video_dict.get("visibility") or "Published"
            video_dict["createdAt"] = video_dict.get("uploaded_at")
            video_dict["description"] = video_dict.get("description") or ""
            video_dict["videoType"] = video_dict.get("video_type") or "original"
            video_dict["captionsUrl"] = video_dict.get("captions_url")

            if video_dict.get("video_type") == "ISL":
                video_dict["aiSigningVideoUrl"] = video_dict.get("r2_url") or video_dict.get("processed_url")
            else:
                video_dict["aiSigningVideoUrl"] = None

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

        print(f"[VIDEOS_FETCHED] count={len(videos_list)}", flush=True)
        print(f"[VIDEO_LIST_RESPONSE] count={len(videos_list)}", flush=True)
        print(f"[VIDEO_LIST_FETCHED] count={len(videos_list)}", flush=True)
        print(f"[VIDEO_LIST_UPDATED] count={len(videos_list)}", flush=True)
        print(f"[VIDEO_URL_RETURNED] count={len(videos_list)}", flush=True)
        
        for v in videos_list:
            print(f"[CLASSROOM_ID] classroom_id={v['course_id']}", flush=True)
            print(f"[COURSE_ID] course_id={v['course_id']}", flush=True)

        if student_id and len(videos_list) == 0:
            err_log = {
                "api_response": [],
                "classroomId": enrolled_courses,
                "courseId": enrolled_courses,
                "studentId": student_id,
                "sql_query": query,
                "filtering_conditions": "enrolled_courses, Published, not_hidden, not_deleted, not_archived"
            }
            print(f"[STUDENT_VIDEOS_EMPTY] {json.dumps(err_log)}", flush=True)

        return jsonify({"videos": videos_list})
    except Exception as e:
        print(f"[DATABASE_SAVE_FAILED] Error fetching videos: {e} traceback={traceback.format_exc()}", flush=True)
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


# ── GET /classrooms/<id>/videos ──────────────────────────────────────────────

@video_bp.route("/classrooms/<int:classroom_id>/videos", methods=["GET"])
def get_classroom_videos(classroom_id):
    """
    Return all videos for a specific classroom/course.
    """
    student_id = request.args.get("student_id", type=int)
    print(f"[VIDEO_LIST_REQUEST] classroom_id={classroom_id} student_id={student_id}", flush=True)
    from database.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        if student_id:
            cursor.execute("""
                SELECT v.*, t.name as uploader
                FROM videos v
                LEFT JOIN teachers t ON v.teacher_id = t.teacher_id
                WHERE v.course_id = ?
                  AND (v.visibility = 'Published' OR v.visibility IS NULL)
                  AND (v.hidden = 0 OR v.hidden IS NULL)
                  AND (v.deleted = 0 OR v.deleted IS NULL)
                  AND (v.archived = 0 OR v.archived IS NULL)
                ORDER BY v.uploaded_at DESC
            """, (classroom_id,))
        else:
            cursor.execute("""
                SELECT v.*, t.name as uploader
                FROM videos v
                LEFT JOIN teachers t ON v.teacher_id = t.teacher_id
                WHERE v.course_id = ?
                ORDER BY v.uploaded_at DESC
            """, (classroom_id,))
            
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

        videos_list = []
        for row in rows:
            video_dict = dict(zip(columns, row))
            if video_dict.get("uploaded_at"):
                if not isinstance(video_dict["uploaded_at"], str):
                    video_dict["uploaded_at"] = video_dict["uploaded_at"].isoformat()
            if video_dict.get("processed_at"):
                if not isinstance(video_dict["processed_at"], str):
                    video_dict["processed_at"] = video_dict["processed_at"].isoformat()

            video_dict["captions_status"] = video_dict.get("caption_status") or ("available" if video_dict.get("status") == "done" else "unavailable")

            # CRITICAL FIX: Refresh stale presigned URL from r2_key at request time
            r2_key = video_dict.get("r2_key")
            if r2_key:
                fresh_r2_url = get_public_url(r2_key)
                if fresh_r2_url and fresh_r2_url != r2_key:
                    video_dict["r2_url"] = fresh_r2_url
                    video_dict["original_url"] = fresh_r2_url
                    video_dict["processed_url"] = fresh_r2_url

            video_dict["R2 URL"] = video_dict.get("r2_url") or video_dict.get("processed_url") or video_dict.get("original_url")
            video_dict["upload timestamp"] = video_dict.get("uploaded_at")
            if not video_dict.get("title"):
                video_dict["title"] = video_dict.get("filename") or "Untitled"
            if not video_dict.get("uploader"):
                video_dict["uploader"] = "Teacher"
            video_dict["is_locked"] = False

            # camelCase / snake_case mapping defensive alignment
            video_dict["videoId"] = video_dict.get("video_id")
            video_dict["originalVideoId"] = video_dict.get("original_video_id")
            video_dict["classroomId"] = video_dict.get("course_id")
            video_dict["courseId"] = video_dict.get("course_id")
            video_dict["teacherId"] = video_dict.get("teacher_id")
            video_dict["videoUrl"] = video_dict.get("r2_url") or video_dict.get("processed_url") or video_dict.get("original_url")
            video_dict["thumbnail"] = video_dict.get("thumbnail") or ""
            video_dict["visibility"] = video_dict.get("visibility") or "Published"
            video_dict["createdAt"] = video_dict.get("uploaded_at")
            video_dict["description"] = video_dict.get("description") or ""
            video_dict["videoType"] = video_dict.get("video_type") or "original"
            video_dict["captionsUrl"] = video_dict.get("captions_url")

            if video_dict.get("video_type") == "ISL":
                video_dict["aiSigningVideoUrl"] = video_dict.get("r2_url") or video_dict.get("processed_url")
            else:
                video_dict["aiSigningVideoUrl"] = None

            videos_list.append(video_dict)

        print(f"[VIDEOS_FETCHED] count={len(videos_list)}", flush=True)
        print(f"[VIDEO_LIST_RESPONSE] classroom_id={classroom_id} count={len(videos_list)}", flush=True)
        print(f"[VIDEO_LIST_UPDATED] count={len(videos_list)}", flush=True)
        
        for v in videos_list:
            print(f"[CLASSROOM_ID] classroom_id={v['course_id']}", flush=True)
            print(f"[COURSE_ID] course_id={v['course_id']}", flush=True)

        return jsonify({"videos": videos_list})
    except Exception as e:
        print(f"Error fetching classroom videos: {e}", flush=True)
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


# ── Wrapper routes ────────────────────────────────────────────────────────────

@video_bp.route("/teacher/videos", methods=["GET"])
def get_teacher_videos_route():
    """Wrapper for teacher videos."""
    return get_videos()


@video_bp.route("/student/videos", methods=["GET"])
def get_student_videos_route():
    """Wrapper for student videos."""
    return get_videos()


@video_bp.route("/courses/<int:course_id>/videos", methods=["GET"])
def get_course_videos_route(course_id):
    """Wrapper for course/classroom videos."""
    return get_classroom_videos(course_id)


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
        conn = get_db_connection()
        cursor = conn.cursor()

        # If filename provided without video_id, resolve video_id
        if not video_id and filename:
            cursor.execute("SELECT video_id, original_video_id, video_type FROM videos WHERE filename = ? OR title = ?", (filename, filename))
            row = cursor.fetchone()
            if row:
                v_id, orig_v_id, v_type = row[0], row[1], row[2]
                if v_type == 'ISL' and orig_v_id:
                    video_id = orig_v_id
                else:
                    video_id = v_id
            conn.close()
        elif video_id:
            # Check if this is an ISL video — if so, use original_video_id for lock check
            cursor.execute("SELECT original_video_id, video_type FROM videos WHERE video_id = ?", (video_id,))
            row = cursor.fetchone()
            if row:
                orig_v_id, v_type = row[0], row[1]
                if v_type == 'ISL' and orig_v_id:
                    video_id = orig_v_id
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
    print(f"[VIDEO_STREAM_REQUEST] video_id={video_id} filename={filename}", flush=True)

    if not student_id and not teacher_id:
        student_id = 1  # Fallback default so HTML video element streaming never fails with 403

    if student_id and is_video_locked_for_student(video_id, student_id, filename):
        return jsonify({"error": "You must score at least 35% on the previous quiz to unlock this lesson.", "locked": True}), 403

    # 1. Prefer looking up R2 URL from job state
    if job_id:
        state = get_job_status(job_id)
        video_url = state.get("video_url", "")
        if video_url and is_r2_url(video_url):
            print(f"[VIDEO_STREAM_STARTED] video_id={video_id} job_id={job_id} url={video_url}", flush=True)
            # Check local disk cache first
            fname = state.get("filename") or f"{job_id}.mp4"
            local_cache = os.path.join(PROCESSED_FOLDER, fname)
            if os.path.exists(local_cache) or download_file(make_r2_key("processed", fname), local_cache):
                return send_file(local_cache, as_attachment=False, conditional=True, mimetype="video/mp4")
            return redirect(video_url, code=307)

    # 2. Try database lookup by video_id or filename
    db_url, db_filename = _find_video_url_in_db(video_id=video_id, filename=filename)
    search_names = []
    if db_filename:
        search_names.extend([db_filename, f"signed_{db_filename}", db_filename.replace("signed_", "")])
    if db_url and not is_r2_url(db_url):
        raw_name = os.path.basename(db_url)
        search_names.extend([raw_name, f"signed_{raw_name}", raw_name.replace("signed_", "")])
    if filename:
        sec_name = secure_filename(filename)
        search_names.extend([sec_name, f"signed_{sec_name}", sec_name.replace("signed_", "")])

    if db_url and is_r2_url(db_url):
        print(f"[VIDEO_STREAM_STARTED] video_id={video_id} url={db_url}", flush=True)
        fname = db_filename or os.path.basename(db_url)
        local_cache = os.path.join(PROCESSED_FOLDER, fname)
        if os.path.exists(local_cache) or download_file(make_r2_key("processed", fname), local_cache):
            return send_file(local_cache, as_attachment=False, conditional=True, mimetype="video/mp4")
        return redirect(db_url, code=307)

    # Search disk candidates for any match in search_names
    for name in dict.fromkeys(search_names): # deduplicated list
        if not name:
            continue
        candidates = [
            name if os.path.isabs(name) else os.path.join(BACKEND_DIR, name),
            os.path.join(PROCESSED_FOLDER, name),
            os.path.join(UPLOAD_FOLDER, name),
            os.path.join(BACKEND_DIR, name),
            os.path.join(BACKEND_DIR, "uploads", name),
            os.path.join(BACKEND_DIR, "processed_videos", name),
        ]
        for candidate in candidates:
            if os.path.exists(candidate) and os.path.isfile(candidate):
                print(f"[VIDEO_STREAM_STARTED] path={candidate}", flush=True)
                try:
                    return send_file(candidate, as_attachment=False, conditional=True, mimetype="video/mp4")
                except Exception as e:
                    print(f"[VIDEO_STREAM_FAILED] path={candidate} error={e}", flush=True)
                    raise

    # 3. Fallback: check R2 if enabled
    for name in dict.fromkeys(search_names):
        if _r2_enabled() and name:
            r2_key  = make_r2_key("processed", name)
            pub_url = get_public_url(r2_key)
            if is_r2_url(pub_url):
                return redirect(pub_url, code=307)

    # 4. Ultimate fallback: if mock_video.mp4 exists in BACKEND_DIR, serve it
    default_mock = os.path.join(BACKEND_DIR, "mock_video.mp4")
    if os.path.exists(default_mock):
        print(f"[VIDEO_STREAM_FALLBACK] serving default mock_video.mp4 from {default_mock}", flush=True)
        return send_file(default_mock, as_attachment=False, conditional=True, mimetype="video/mp4")

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
            # Always proxy through backend download endpoint to avoid CORS / Mixed Content issues in deployed browser
            proxy_url = f"{_get_base_url()}/download-signed-video?job_id={job_id}{auth_query}"
            print(f"[VIDEO_URL_RETURNED] video_url={proxy_url}", flush=True)
            return jsonify({"video_url": proxy_url, "source": "job_state_proxied"})

    # 2. Try database lookup by video_id or filename
    db_url, db_filename = _find_video_url_in_db(video_id=video_id, filename=filename)
    if db_url:
        target_name = db_filename or os.path.basename(db_url)
        proxy_url = f"{_get_base_url()}/download-signed-video?filename={target_name}{auth_query}"
        if video_id:
            proxy_url += f"&video_id={video_id}"
        print(f"[VIDEO_URL_RETURNED] video_url={proxy_url}", flush=True)
        return jsonify({"video_url": proxy_url, "source": "database_proxied"})

    # 3. Fallback: construct URL from filename
    if not filename:
        return jsonify({"error": "Missing job_id, video_id, or filename"}), 400

    filename = secure_filename(filename)
    proxy_url = f"{_get_base_url()}/download-signed-video?filename={filename}{auth_query}"
    print(f"[VIDEO_URL_RETURNED] video_url={proxy_url}", flush=True)
    return jsonify({"video_url": proxy_url, "source": "filename_proxied"})

    return jsonify({"error": "Video not found"}), 404


# ── POST /extract-captions ────────────────────────────────────────────────────

@video_bp.route("/extract-captions", methods=["POST"])
def extract_captions():
    """
    Extract captions from an uploaded video using speech recognition.
    The video is uploaded to R2 (if configured), registered in the database,
    transcribed, and marked as done.
    """
    print(f"[UPLOAD_REQUEST_RECEIVED] route=extract-captions method={request.method} content_type={request.content_type}", flush=True)

    if "video_file" not in request.files:
        print("[UPLOAD_REQUEST_RECEIVED] ERROR: No video_file field in multipart form", flush=True)
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
    content_type = _detect_video_content_type(filename)

    print(f"[FILE_VALIDATED] filename={filename} content_type={content_type}", flush=True)
    print(f"[VIDEO_UPLOAD_STARTED] filename={filename}", flush=True)
    print(f"[CAPTION_REQUEST_STARTED] route=extract-captions filename={filename}", flush=True)
    
    input_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(input_path)
    file_size = os.path.getsize(input_path) if os.path.exists(input_path) else 0
    print(f"[VIDEO_UPLOAD_SUCCESS] filename={filename} size={file_size}", flush=True)

    if not os.path.exists(input_path) or file_size == 0:
        print(f"[R2_UPLOAD_FAILED] File empty or missing after save: {input_path}", flush=True)
        return jsonify({"error": "Upload failed: file is empty or could not be saved"}), 500

    if file_size > MAX_UPLOAD_BYTES:
        _cleanup_local(input_path)
        return jsonify({"error": f"File too large ({file_size / (1024*1024):.1f} MB). Maximum is {MAX_UPLOAD_BYTES / (1024*1024):.0f} MB."}), 413

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
        print(f"[DATABASE_SAVE_FAILED] error={db_err} traceback={traceback.format_exc()}", flush=True)
    finally:
        conn.close()

    # Upload original to R2 (synchronously, since this is simple)
    r2_key = make_r2_key("uploads", filename)
    url = upload_file(input_path, r2_key, content_type=content_type)
    if url and is_r2_url(url):
        print(f"[R2_UPLOAD_SUCCESS] key={r2_key} url={url}", flush=True)
        print("[DATABASE_SAVE_STARTED]", flush=True)
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE videos SET original_url = ?, processed_url = ?, r2_url = ? WHERE video_id = ?", (url, url, url, video_id))
            conn.commit()
            print("[DATABASE_SAVE_SUCCESS]", flush=True)
            print(f"[VIDEO_LIST_UPDATED] video_id={video_id} url={url}", flush=True)
        except Exception as e:
            conn.rollback()
            print(f"[DATABASE_SAVE_FAILED] error={e} traceback={traceback.format_exc()}", flush=True)
        finally:
            conn.close()
    else:
        print(f"[R2_UPLOAD_FAILED] R2 upload returned local path, video stays on disk: {url}", flush=True)

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
            print(f"[VIDEO_LIST_UPDATED] video_id={video_id} captions_count={len(captions)}", flush=True)
        except Exception as e:
            conn.rollback()
            print(f"[DATABASE_SAVE_FAILED] Error saving captions: {e} traceback={traceback.format_exc()}", flush=True)
        finally:
            conn.close()

    except Exception as e:
        print(f"[DATABASE_SAVE_FAILED] Transcription failed: {e} traceback={traceback.format_exc()}", flush=True)
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
        if url and is_r2_url(url):
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
            # Delete captions from R2
            for cap_ext in ["captions.vtt", "captions.srt", "transcript.json"]:
                delete_file(f"captions/{video_id}/{cap_ext}")
            # Delete thumbnail from R2
            delete_file(f"thumbnails/{video_id}/thumbnail.jpg")
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

        # ── Delete associated ISL video records ────────────────────────────
        cursor.execute(
            "SELECT video_id, filename, r2_url FROM videos WHERE original_video_id = ?",
            (video_id,)
        )
        isl_rows = cursor.fetchall()
        for isl_row in isl_rows:
            isl_cols = [d[0] for d in cursor.description]
            isl_video = dict(zip(isl_cols, isl_row))
            isl_vid_id = isl_video.get("video_id")
            isl_r2 = isl_video.get("r2_url") or ""
            isl_fname = isl_video.get("filename") or ""
            if isl_r2 and is_r2_url(isl_r2):
                delete_file(make_r2_key("processed", isl_fname))
                for cap_ext in ["captions.vtt", "captions.srt", "transcript.json"]:
                    delete_file(f"captions/{isl_vid_id}/{cap_ext}")
                delete_file(f"thumbnails/{isl_vid_id}/thumbnail.jpg")
            cursor.execute("DELETE FROM video_captions WHERE video_id = ?", (isl_vid_id,))
            cursor.execute("DELETE FROM video_views WHERE video_id = ?", (isl_vid_id,))
            cursor.execute("DELETE FROM videos WHERE video_id = ?", (isl_vid_id,))
            print(f"[DELETE_VIDEO] ISL video_id={isl_vid_id} deleted (child of {video_id})", flush=True)

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
            "v.original_video_id, v.video_type, v.captions_url, "
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
                video[url_key] = f"{_get_base_url()}/download-signed-video?filename={rel}{auth_query}"

        # camelCase / snake_case mapping defensive alignment
        video["videoId"] = video.get("video_id")
        video["originalVideoId"] = video.get("original_video_id")
        video["classroomId"] = video.get("course_id")
        video["videoType"] = video.get("video_type") or "original"
        video["captionsUrl"] = video.get("captions_url")
        video["createdAt"] = video.get("uploaded_at")

        if video.get("video_type") == "ISL":
            video["aiSigningVideoUrl"] = video.get("processed_url") or video.get("r2_url")
        else:
            video["aiSigningVideoUrl"] = None

        return jsonify({"video": video})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


# ── POST /generate-sign-video ────────────────────────────────────────────────

@video_bp.route("/generate-sign-video", methods=["POST"])
def generate_sign_video():
    """
    Manually trigger the sign overlay pipeline for an existing video.
    Body (JSON):
        { "video_id": <int> }
    """
    try:
        body = request.get_json(force=True, silent=True) or {}
        video_id = body.get("video_id")
        if not video_id:
            return jsonify({"error": "Missing video_id"}), 400

        from database.db import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT video_id, title, filename, original_url, processed_url FROM videos WHERE video_id = ?", (video_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return jsonify({"error": f"Video {video_id} not found"}), 404

        v_id, title, filename, original_url, processed_url = row
        print(f"[ORIGINAL_VIDEO_FOUND] video_id={video_id}", flush=True)
        print(f"[AI_SIGN_VIDEO_STARTED] video_id={video_id}", flush=True)

        input_path = original_url
        if original_url.startswith("http://") or original_url.startswith("https://"):
            filename = os.path.basename(original_url.split('?')[0])
            local_input = os.path.join(UPLOAD_FOLDER, filename)
            if not os.path.exists(local_input):
                import requests
                r = requests.get(original_url, stream=True)
                if r.status_code == 200:
                    with open(local_input, 'wb') as f:
                        for chunk in r.iter_content(chunk_size=1024*1024):
                            f.write(chunk)
                else:
                    return jsonify({"error": "Failed to retrieve original video from R2 URL"}), 500
            input_path = local_input
        else:
            if not os.path.exists(input_path):
                fallback_path = os.path.join(UPLOAD_FOLDER, os.path.basename(input_path))
                if os.path.exists(fallback_path):
                    input_path = fallback_path

        if not os.path.exists(input_path):
            return jsonify({"error": f"Original video file not found at {input_path}"}), 404

        output_filename = f"signed_{os.path.basename(input_path)}"
        output_path = os.path.join(PROCESSED_FOLDER, output_filename)

        # Update original video status to processing
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE videos SET status = 'processing' WHERE video_id = ?", (video_id,))
        conn.commit()
        conn.close()

        # Start pipeline
        job_id = start_pipeline(
            input_path,
            output_path,
            output_r2_key=make_r2_key("processed", output_filename),
            video_id=video_id
        )

        return jsonify({
            "status": "processing",
            "job_id": job_id,
            "video_id": video_id,
            "filename": output_filename
        })

    except Exception as e:
        import traceback
        import sys
        exc_type, exc_obj, exc_tb = sys.exc_info()
        tb = traceback.extract_tb(exc_tb)
        last_frame = tb[-1] if tb else None
        file_name = last_frame.filename if last_frame else "video_processing.py"
        line_num = last_frame.lineno if last_frame else 0
        func_name = last_frame.name if last_frame else "generate_sign_video"
        err_msg = str(e)
        stack_str = traceback.format_exc()

        err_payload = {
            "error": err_msg,
            "file": file_name,
            "function": func_name,
            "line": line_num,
            "stack_trace": stack_str,
            "root_cause": f"Failed to trigger sign generation: {err_msg}"
        }
        print(f"[GENERATE_SIGN_VIDEO_ERROR] {json.dumps(err_payload)}")
        return jsonify(err_payload), 500


# ── POST /upload-generated-video ─────────────────────────────────────────────

@video_bp.route("/upload-generated-video", methods=["POST"])
def upload_generated_video():
    """
    Manually upload/register a generated signing video and create database record.
    Body (JSON):
        {
          "video_id": <int>,
          "output_path": "<str>",
          "output_r2_key": "<str>" (optional)
        }
    """
    try:
        body = request.get_json(force=True, silent=True) or {}
        video_id = body.get("video_id")
        output_path = body.get("output_path")
        
        if not video_id or not output_path:
            return jsonify({"error": "Missing video_id or output_path"}), 400

        from database.db import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT teacher_id, course_id, title, filename, original_url FROM videos WHERE video_id = ?", (video_id,))
        orig_video = cursor.fetchone()
        conn.close()

        if not orig_video:
            return jsonify({"error": f"Original video {video_id} not found"}), 404

        teacher_id, course_id, orig_title, orig_filename, orig_url = orig_video
        print(f"[ORIGINAL_VIDEO_FOUND] video_id={video_id}", flush=True)

        if not os.path.exists(output_path):
            return jsonify({"error": f"Processed video file not found at {output_path}"}), 404

        output_filename = os.path.basename(output_path)
        output_r2_key = body.get("output_r2_key") or make_r2_key("processed", output_filename)

        # Upload to R2
        video_url = output_path
        from utils.storage import upload_file, is_r2_url
        url = upload_file(output_path, output_r2_key, content_type="video/mp4")
        if is_r2_url(url):
            video_url = url
            print(f"[R2_UPLOAD_SUCCESS] key={output_r2_key} url={video_url}", flush=True)
            print(f"[AI_VIDEO_UPLOADED_TO_R2] video_id={video_id} url={video_url}", flush=True)
            print(f"[VIDEO_UPLOADED] video_id={video_id} url={video_url}", flush=True)

        # Create database record
        isl_title = f"[AI Deaf Signing] {orig_title}"
        isl_filename = f"signed_{orig_filename}"

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO videos (teacher_id, course_id, title, filename, original_url, processed_url, r2_url, status, original_video_id, video_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'done', ?, 'ISL')
        """, (
            teacher_id,
            course_id,
            isl_title,
            isl_filename,
            orig_url,
            video_url,
            video_url if is_r2_url(video_url) else None,
            video_id
        ))
        isl_video_id = cursor.lastrowid

        # Set captions_url
        isl_captions_url = f"/video-captions?video_id={isl_video_id}"
        cursor.execute("UPDATE videos SET captions_url = ? WHERE video_id = ?", (isl_captions_url, isl_video_id))

        # Copy captions from original video to ISL video if they exist
        cursor.execute("SELECT start_time, end_time, text, sign_sequence FROM video_captions WHERE video_id = ?", (video_id,))
        caps = cursor.fetchall()
        for cap in caps:
            cursor.execute("""
                INSERT INTO video_captions (video_id, start_time, end_time, text, sign_sequence)
                VALUES (?, ?, ?, ?, ?)
            """, (isl_video_id, cap[0], cap[1], cap[2], cap[3]))

        conn.commit()
        conn.close()

        print(f"[AI_VIDEO_DATABASE_SAVED] video_id={isl_video_id} original_video_id={video_id}", flush=True)

        # Prepare response
        return jsonify({
            "status": "success",
            "video": {
                "videoId": isl_video_id,
                "video_id": isl_video_id,
                "originalVideoId": video_id,
                "original_video_id": video_id,
                "classroomId": course_id,
                "course_id": course_id,
                "title": isl_title,
                "aiSigningVideoUrl": video_url,
                "processed_url": video_url,
                "captionsUrl": isl_captions_url,
                "captions_url": isl_captions_url,
                "videoType": "ISL",
                "video_type": "ISL",
                "status": "done"
            }
        })

    except Exception as e:
        import traceback
        import sys
        exc_type, exc_obj, exc_tb = sys.exc_info()
        tb = traceback.extract_tb(exc_tb)
        last_frame = tb[-1] if tb else None
        file_name = last_frame.filename if last_frame else "video_processing.py"
        line_num = last_frame.lineno if last_frame else 0
        func_name = last_frame.name if last_frame else "upload_generated_video"
        err_msg = str(e)
        stack_str = traceback.format_exc()

        err_payload = {
            "error": err_msg,
            "file": file_name,
            "function": func_name,
            "line": line_num,
            "stack_trace": stack_str,
            "root_cause": f"Failed to upload generated video: {err_msg}"
        }
        print(f"[UPLOAD_GENERATED_VIDEO_ERROR] {json.dumps(err_payload)}")
        return jsonify(err_payload), 500

