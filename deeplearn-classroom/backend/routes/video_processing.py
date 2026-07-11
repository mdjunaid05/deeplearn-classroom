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
            INSERT INTO videos (teacher_id, course_id, title, filename, original_url, processed_url, status, description, thumbnail, visibility, hidden, deleted, archived)
            VALUES (?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, ?, ?)
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
            cursor.execute("UPDATE videos SET original_url = ?, r2_url = ? WHERE video_id = ?", (url, url, video_id))
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

        videos_list = []
        for row in rows:
            video_dict = dict(zip(columns, row))
            if video_dict.get("uploaded_at"):
                if not isinstance(video_dict["uploaded_at"], str):
                    video_dict["uploaded_at"] = video_dict["uploaded_at"].isoformat()
            if video_dict.get("processed_at"):
                if not isinstance(video_dict["processed_at"], str):
                    video_dict["processed_at"] = video_dict["processed_at"].isoformat()

            video_dict["captions_status"] = "available" if video_dict.get("status") == "done" else "unavailable"

            auth_query = f"&student_id={student_id}" if student_id else f"&teacher_id={teacher_id}" if teacher_id else ""
            p_url = video_dict.get("processed_url")
            if p_url and not is_r2_url(p_url):
                rel_name = os.path.basename(p_url)
                video_dict["processed_url"] = f"{request.host_url.rstrip('/')}/download-signed-video?filename={rel_name}{auth_query}"

            o_url = video_dict.get("original_url")
            if o_url and not is_r2_url(o_url):
                rel_name = os.path.basename(o_url)
                video_dict["original_url"] = f"{request.host_url.rstrip('/')}/download-signed-video?filename={rel_name}{auth_query}"

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
            video_dict["videoUrl"] = video_dict.get("processed_url") or video_dict.get("original_url") or video_dict.get("r2_url")
            video_dict["thumbnail"] = video_dict.get("thumbnail") or ""
            video_dict["visibility"] = video_dict.get("visibility") or "Published"
            video_dict["createdAt"] = video_dict.get("uploaded_at")
            video_dict["description"] = video_dict.get("description") or ""
            video_dict["videoType"] = video_dict.get("video_type") or "original"
            video_dict["captionsUrl"] = video_dict.get("captions_url")

            if video_dict.get("video_type") == "ASL":
                video_dict["aiSigningVideoUrl"] = video_dict.get("processed_url") or video_dict.get("r2_url")
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

            video_dict["captions_status"] = "available" if video_dict.get("status") == "done" else "unavailable"
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
            video_dict["videoUrl"] = video_dict.get("processed_url") or video_dict.get("original_url") or video_dict.get("r2_url")
            video_dict["thumbnail"] = video_dict.get("thumbnail") or ""
            video_dict["visibility"] = video_dict.get("visibility") or "Published"
            video_dict["createdAt"] = video_dict.get("uploaded_at")
            video_dict["description"] = video_dict.get("description") or ""
            video_dict["videoType"] = video_dict.get("video_type") or "original"
            video_dict["captionsUrl"] = video_dict.get("captions_url")

            if video_dict.get("video_type") == "ASL":
                video_dict["aiSigningVideoUrl"] = video_dict.get("processed_url") or video_dict.get("r2_url")
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
    print(f"[VIDEO_STREAM_REQUEST] video_id={video_id} filename={filename}", flush=True)

    if not student_id and not teacher_id:
        return jsonify({"error": "Unauthorized: student_id or teacher_id is required.", "locked": True}), 403

    if student_id and is_video_locked_for_student(video_id, student_id, filename):
        return jsonify({"error": "You must score at least 35% on the previous quiz to unlock this lesson.", "locked": True}), 403

    # 1. Prefer looking up R2 URL from job state
    if job_id:
        state = get_job_status(job_id)
        video_url = state.get("video_url", "")
        if video_url and is_r2_url(video_url):
            print(f"[VIDEO_STREAM_STARTED] video_id={video_id} job_id={job_id} url={video_url}", flush=True)
            return redirect(video_url, code=307)

    # 2. Try database lookup by video_id or filename
    db_url, db_filename = _find_video_url_in_db(video_id=video_id, filename=filename)
    if db_url:
        if is_r2_url(db_url):
            print(f"[VIDEO_STREAM_STARTED] video_id={video_id} url={db_url}", flush=True)
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
                video[url_key] = f"{request.host_url.rstrip('/')}/download-signed-video?filename={rel}{auth_query}"

        # camelCase / snake_case mapping defensive alignment
        video["videoId"] = video.get("video_id")
        video["originalVideoId"] = video.get("original_video_id")
        video["classroomId"] = video.get("course_id")
        video["videoType"] = video.get("video_type") or "original"
        video["captionsUrl"] = video.get("captions_url")
        video["createdAt"] = video.get("uploaded_at")

        if video.get("video_type") == "ASL":
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
        asl_title = f"[AI Deaf Signing] {orig_title}"
        asl_filename = f"signed_{orig_filename}"

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO videos (teacher_id, course_id, title, filename, original_url, processed_url, r2_url, status, original_video_id, video_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'done', ?, 'ASL')
        """, (
            teacher_id,
            course_id,
            asl_title,
            asl_filename,
            orig_url,
            video_url,
            video_url if is_r2_url(video_url) else None,
            video_id
        ))
        asl_video_id = cursor.lastrowid

        # Set captions_url
        asl_captions_url = f"/video-captions?video_id={asl_video_id}"
        cursor.execute("UPDATE videos SET captions_url = ? WHERE video_id = ?", (asl_captions_url, asl_video_id))

        # Copy captions from original video to ASL video if they exist
        cursor.execute("SELECT start_time, end_time, text, sign_sequence FROM video_captions WHERE video_id = ?", (video_id,))
        caps = cursor.fetchall()
        for cap in caps:
            cursor.execute("""
                INSERT INTO video_captions (video_id, start_time, end_time, text, sign_sequence)
                VALUES (?, ?, ?, ?, ?)
            """, (asl_video_id, cap[0], cap[1], cap[2], cap[3]))

        conn.commit()
        conn.close()

        print(f"[AI_VIDEO_DATABASE_SAVED] video_id={asl_video_id} original_video_id={video_id}", flush=True)

        # Prepare response
        return jsonify({
            "status": "success",
            "video": {
                "videoId": asl_video_id,
                "video_id": asl_video_id,
                "originalVideoId": video_id,
                "original_video_id": video_id,
                "classroomId": course_id,
                "course_id": course_id,
                "title": asl_title,
                "aiSigningVideoUrl": video_url,
                "processed_url": video_url,
                "captionsUrl": asl_captions_url,
                "captions_url": asl_captions_url,
                "videoType": "ASL",
                "video_type": "ASL",
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

