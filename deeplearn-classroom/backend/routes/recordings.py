import os
import uuid
import subprocess
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from database.db import get_db_connection

recordings_bp = Blueprint("recordings", __name__)

RECORDINGS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)


@recordings_bp.route("/start-class", methods=["POST"])
def start_class():
    data = request.json or {}
    teacher_id = data.get("teacher_id", 1)
    course_id = data.get("course_id", 1)

    session_id = str(uuid.uuid4())
    conn = get_db_connection()
    cursor = conn.cursor()

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
            INSERT INTO live_sessions (session_id, teacher_id, course_id, status)
            VALUES (?, ?, ?, 'live')
        """, (session_id, teacher_id, course_id))

        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Error starting class: {e}")
        conn.close()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        try:
            conn.close()
        except Exception:
            pass

    # Create directory for recordings
    session_dir = os.path.join(RECORDINGS_DIR, str(course_id), session_id)
    os.makedirs(session_dir, exist_ok=True)

    return jsonify({"status": "success", "session_id": session_id})


@recordings_bp.route("/end-class", methods=["POST"])
def end_class():
    data = request.json
    session_id = data.get("session_id")

    if not session_id:
        return jsonify({"status": "error", "message": "Missing session_id"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        UPDATE live_sessions 
        SET status = 'ended', end_time = CURRENT_TIMESTAMP
        WHERE session_id = ?
    """, (session_id,))
    
    conn.commit()
    conn.close()

    return jsonify({"status": "success"})


@recordings_bp.route("/upload-recording", methods=["POST"])
def upload_recording():
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    video_file = request.files['video']
    session_id = request.form.get('session_id')
    teacher_id = request.form.get('teacher_id', 1)
    course_id = request.form.get('course_id', 1)
    duration = request.form.get('duration', 0)
    participants_count = request.form.get('participants_count', 0)
    
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    import re
    if not re.match(r'^[a-zA-Z0-9\-]+$', session_id):
        return jsonify({"error": "Invalid session_id format"}), 400

    session_dir = os.path.join(RECORDINGS_DIR, str(course_id), session_id)
    os.makedirs(session_dir, exist_ok=True)
    
    raw_filename = "raw_recording.webm"
    raw_filepath = os.path.join(session_dir, raw_filename)
    video_file.save(raw_filepath)

    transcript_data = request.form.get('transcript')
    if transcript_data:
        try:
            captions_filepath = os.path.join(session_dir, "captions.json")
            with open(captions_filepath, "w") as f:
                f.write(transcript_data)
        except Exception as e:
            print(f"Error saving transcript: {e}")

    # Process with FFmpeg
    output_filename = "recording.mp4"
    output_filepath = os.path.join(session_dir, output_filename)
    thumbnail_filename = "thumbnail.jpg"
    thumbnail_filepath = os.path.join(session_dir, thumbnail_filename)

    # Convert webm to mp4
    try:
        try:
            import imageio_ffmpeg
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            ffmpeg_exe = 'ffmpeg'

        subprocess.run([
            ffmpeg_exe, '-i', raw_filepath, 
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
            '-c:a', 'aac', '-b:a', '128k',
            output_filepath, '-y'
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Generate thumbnail
        subprocess.run([
            ffmpeg_exe, '-i', output_filepath,
            '-ss', '00:00:01.000', '-vframes', '1',
            thumbnail_filepath, '-y'
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    except subprocess.CalledProcessError as e:
        print(f"FFmpeg Error: {e.stderr.decode() if e.stderr else str(e)}", flush=True)
        # Fallback to raw if ffmpeg fails
        output_filepath = raw_filepath
        output_filename = raw_filename

    # Save to db
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO recordings (session_id, teacher_id, course_id, file_path, thumbnail_path, duration, participants_count, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'processed')
    """, (session_id, teacher_id, course_id, output_filename, thumbnail_filename, duration, participants_count))
    conn.commit()
    conn.close()

    return jsonify({"status": "success", "file": output_filename})


@recordings_bp.route("/recordings", methods=["GET"])
def get_recordings():
    teacher_id = request.args.get("teacher_id")
    student_id = request.args.get("student_id")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT r.recording_id, r.session_id, r.course_id, r.file_path, r.thumbnail_path, 
               r.duration, r.participants_count, r.recording_timestamp, r.status, c.title as class_title
        FROM recordings r
        LEFT JOIN courses c ON r.course_id = c.course_id
    """
    args = []
    if teacher_id:
        query += " WHERE r.teacher_id = ?"
        args.append(teacher_id)
        
    query += " ORDER BY r.recording_timestamp ASC"  # ASC so we know the order of classes
    
    cursor.execute(query, tuple(args))
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    recordings_list = [dict(zip(columns, row)) for row in rows]
    
    if student_id:
        try:
            from routes.quiz_analytics import get_student_progress_list
            _, lessons = get_student_progress_list(student_id)
            lock_map = {les["lesson_id"]: les["is_locked"] for les in lessons}
            for rec in recordings_list:
                lesson_id = f"r_{rec['recording_id']}"
                rec['is_locked'] = lock_map.get(lesson_id, True)
                if rec['is_locked']:
                    rec['locked_reason'] = "You must score at least 35% on the previous quiz to unlock this lesson."
                else:
                    rec['locked_reason'] = None
        except Exception as e:
            print(f"Error checking recording lock status: {e}")
            for rec in recordings_list:
                rec['is_locked'] = False
                rec['locked_reason'] = None
                
    # Sort DESC for displaying the newest first, if desired, or keep ASC for learning path.
    # Usually a learning path is displayed chronologically. Let's keep it ASC for the student path, or DESC for teachers.
    if teacher_id:
        recordings_list.sort(key=lambda x: x['recording_timestamp'], reverse=True)
        
    conn.close()
    
    return jsonify({"recordings": recordings_list})


@recordings_bp.route("/recordings/<int:course_id>/<session_id>/<filename>", methods=["GET"])
def serve_recording(course_id, session_id, filename):
    import re
    if not re.match(r'^[a-zA-Z0-9\-]+$', session_id):
        return jsonify({"error": "Invalid session_id format"}), 400

    student_id = request.args.get("student_id", type=int)
    teacher_id = request.args.get("teacher_id", type=int)

    if not student_id and not teacher_id:
        return jsonify({"error": "Unauthorized: student_id or teacher_id is required.", "locked": True}), 403

    if student_id:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT recording_id FROM recordings WHERE (file_path = ? OR thumbnail_path = ?) AND course_id = ?", (filename, filename, course_id))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            recording_id = row[0]
            try:
                from routes.quiz_analytics import get_student_progress_list
                _, lessons = get_student_progress_list(student_id)
                lesson_id = f"r_{recording_id}"
                for les in lessons:
                    if les["lesson_id"] == lesson_id and les["is_locked"]:
                        return jsonify({"error": "You must score at least 35% on the previous quiz to unlock this lesson.", "locked": True}), 403
            except Exception as e:
                print(f"Error serving locked recording check: {e}")

    filepath = os.path.join(RECORDINGS_DIR, str(course_id), session_id, secure_filename(filename))
    if not os.path.exists(filepath):
        return jsonify({"error": "File not found"}), 404
        
    return send_file(filepath)


@recordings_bp.route("/recordings/<int:recording_id>", methods=["DELETE"])
def delete_recording(recording_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT session_id, course_id FROM recordings WHERE recording_id = ?", (recording_id,))
    row = cursor.fetchone()
    if not row:
        return jsonify({"error": "Recording not found"}), 404
        
    session_id = row[0] if isinstance(row, tuple) else row['session_id']
    course_id = row[1] if isinstance(row, tuple) else row['course_id']
    
    # Delete from DB
    cursor.execute("DELETE FROM recordings WHERE recording_id = ?", (recording_id,))
    conn.commit()
    conn.close()
    
    # Optional: Delete files from disk
    # (Implementation omitted for safety, but could be added here)
    
    return jsonify({"status": "success"})


@recordings_bp.route("/submit-quiz", methods=["POST"])
def submit_quiz():
    data = request.json
    student_id = data.get("student_id")
    recording_id = data.get("recording_id")
    score = data.get("score")
    passed = data.get("passed", False)
    
    if not student_id or not recording_id:
        return jsonify({"error": "Missing student_id or recording_id"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if already exists to update
    cursor.execute("SELECT score_id FROM quiz_scores WHERE student_id = ? AND recording_id = ?", (student_id, recording_id))
    row = cursor.fetchone()
    
    if row:
        cursor.execute("UPDATE quiz_scores SET score = ?, passed = ? WHERE student_id = ? AND recording_id = ?",
                      (score, passed, student_id, recording_id))
    else:
        cursor.execute("INSERT INTO quiz_scores (student_id, recording_id, score, passed) VALUES (?, ?, ?, ?)",
                      (student_id, recording_id, score, passed))
                      
    conn.commit()
    conn.close()
    
    return jsonify({"status": "success", "message": "Quiz score saved", "passed": passed})
