"""
Video Pipeline Utility
Orchestrates the full video processing pipeline:
  1. Extract audio from video (moviepy)
  2. Speech-to-text transcription (Whisper)
  3. Map text to sign language gesture sequences
  4. Render sign language avatar overlay on video frames (OpenCV)
  5. Burn captions onto video frames
  6. Output processed video with sign overlay + captions
"""
import os
import json
import time
import threading
import uuid

# ────────────────────────────────────────────────────────────
# Job State ─ file-based persistence so all Gunicorn workers share state.
# In development (single-process), the in-memory fallback is identical.
# ────────────────────────────────────────────────────────────

# Directory where job state JSON files are stored
_JOBS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "_jobs")
os.makedirs(_JOBS_DIR, exist_ok=True)

# In-memory fallback (used when file I/O fails or in single-process dev mode)
_JOBS_MEMORY: dict = {}
_JOBS_LOCK = threading.Lock()


def _job_path(job_id: str) -> str:
    """Return the file path for a job's state file."""
    return os.path.join(_JOBS_DIR, f"{job_id}.json")


def _write_job(job_id: str, state: dict, video_id: int = None) -> None:
    """Persist job state to disk and database (video_processing_jobs)."""
    state["_ts"] = time.time()  # timestamp for cleanup
    path = _job_path(job_id)
    tmp = path + ".tmp"
    try:
        with open(tmp, "w") as f:
            json.dump(state, f)
        os.replace(tmp, path)  # atomic on POSIX and Windows
    except OSError as e:
        print(f"[Pipeline] Warning: could not persist job {job_id} to disk: {e}")
    
    # Always keep in-memory as well (for same-worker fast reads)
    with _JOBS_LOCK:
        _JOBS_MEMORY[job_id] = state

    # Persist / sync to video_processing_jobs table in database
    try:
        from database.db import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        
        status_val = state.get("status", "processing")
        if status_val == "done":
            db_status = "completed"
        elif status_val == "error":
            db_status = "failed"
        else:
            db_status = "processing"
            
        progress_val = int(state.get("progress", 0))
        current_step = str(state.get("step", ""))[:255]
        error_msg = str(state.get("error", "")) if state.get("error") else None
        video_url = state.get("video_url")
        captions_json = json.dumps(state.get("captions")) if state.get("captions") else None

        cursor.execute("SELECT id FROM video_processing_jobs WHERE job_id = ?", (job_id,))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("""
                UPDATE video_processing_jobs 
                SET status = ?, progress = ?, current_step = ?, error_message = ?, 
                    video_url = ?, formatted_captions = ?, updated_at = CURRENT_TIMESTAMP,
                    completed_at = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
                WHERE job_id = ?
            """, (db_status, progress_val, current_step, error_msg, video_url, captions_json, db_status, job_id))
        else:
            cursor.execute("""
                INSERT INTO video_processing_jobs 
                    (job_id, video_id, status, progress, current_step, error_message, video_url, formatted_captions, started_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (job_id, video_id, db_status, progress_val, current_step, error_msg, video_url, captions_json))
        conn.commit()
        conn.close()
    except Exception as db_err:
        # Non-fatal DB sync warning
        pass


def _read_job(job_id: str) -> dict:
    """Read job state. Prefer memory, then disk, then database fallback."""
    with _JOBS_LOCK:
        if job_id in _JOBS_MEMORY:
            return _JOBS_MEMORY[job_id]

    path = _job_path(job_id)
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                return json.load(f)
    except (OSError, json.JSONDecodeError):
        pass

    # Database fallback (survives Render restarts)
    try:
        from database.db import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT status, progress, current_step, error_message, video_url, formatted_captions
            FROM video_processing_jobs WHERE job_id = ?
        """, (job_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            status_db = row[0] if isinstance(row, (tuple, list)) else row.get("status")
            frontend_status = "done" if status_db == "completed" else "error" if status_db == "failed" else "processing"
            progress_db = row[1] if isinstance(row, (tuple, list)) else row.get("progress", 0)
            step_db = row[2] if isinstance(row, (tuple, list)) else row.get("current_step", "")
            err_db = row[3] if isinstance(row, (tuple, list)) else row.get("error_message")
            vurl_db = row[4] if isinstance(row, (tuple, list)) else row.get("video_url")
            captions_raw = row[5] if isinstance(row, (tuple, list)) else row.get("formatted_captions")
            captions_list = json.loads(captions_raw) if captions_raw and isinstance(captions_raw, str) else captions_raw

            job_state = {
                "status": frontend_status,
                "progress": progress_db,
                "step": step_db,
                "error": err_db,
                "video_url": vurl_db,
                "captions": captions_list,
            }
            with _JOBS_LOCK:
                _JOBS_MEMORY[job_id] = job_state
            return job_state
    except Exception:
        pass

    return {}


def _cleanup_old_jobs(max_age_seconds: int = 3600) -> None:
    """Delete job state files older than max_age_seconds."""
    now = time.time()
    try:
        for fname in os.listdir(_JOBS_DIR):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(_JOBS_DIR, fname)
            try:
                mtime = os.path.getmtime(fpath)
                if now - mtime > max_age_seconds:
                    os.remove(fpath)
            except OSError:
                pass
    except OSError:
        pass
    with _JOBS_LOCK:
        stale = [jid for jid, s in _JOBS_MEMORY.items()
                 if now - s.get("_ts", now) > max_age_seconds]
        for jid in stale:
            del _JOBS_MEMORY[jid]


def process_video_pipeline(job_id, input_path, output_path, output_r2_key=None, video_id=None):
    """
    Background worker that runs the full pipeline.
    Writes job state to disk for cross-worker visibility.
    When output_r2_key is provided, uploads the processed video to R2
    and stores the public URL in job state.
    """
    _write_job(job_id, {"status": "processing", "progress": 0, "step": "Initializing..."})

    try:
        # ── Step 1: Transcribe audio ──────────────────────────────
        def my_callback(step_name, progress_val):
            _write_job(job_id, {
                "progress": progress_val,
                "step": step_name,
                "status": "processing"
            })

        from utils.speech_to_text import transcribe_audio
        captions = transcribe_audio(input_path, progress_callback=my_callback)

        if not captions:
            captions = [{"text": "No speech detected in video.", "start": 0.0, "end": 2.0}]

        print(f"[CAPTIONS_GENERATED] video_id={video_id} count={len(captions)}", flush=True)

        _write_job(job_id, {"progress": 30,
                             "step": f"Transcription complete — {len(captions)} segments",
                             "status": "processing"})

        # ── Step 2: Map text to sign gestures ─────────────────────
        _write_job(job_id, {"progress": 35, "step": "Mapping text to sign gestures...",
                             "status": "processing"})

        from utils.sign_injector import text_to_gesture_sequence, get_gesture_duration
        for cap in captions:
            cap["gestures"] = text_to_gesture_sequence(cap["text"])

        _write_job(job_id, {"progress": 40, "step": "Gesture mapping complete",
                             "status": "processing"})

        # ── Step 3: Render avatar overlay + captions on video ─────
        _write_job(job_id, {"progress": 45, "step": "Rendering sign overlay on video frames...",
                             "status": "processing"})

        _render_video_with_overlay(input_path, output_path, captions, job_id, video_id=video_id)
        print(f"[AI_SIGN_VIDEO_COMPLETED] video_id={video_id} job_id={job_id}", flush=True)

        # ── Done ──────────────────────────────────────────────────
        formatted_captions = []
        for cap in captions:
            formatted_captions.append({
                "text": cap["text"],
                "start": cap["start"],
                "end": cap["end"],
                "start_time": _format_time(cap["start"]),
                "end_time": _format_time(cap["end"]),
                "gestures": cap.get("gestures", []),
            })

        # ── Step 4: Upload to Cloudflare R2 (if configured) ──────
        video_url = output_path  # default: local path
        if output_r2_key:
            try:
                _write_job(job_id, {
                    "status": "processing",
                    "progress": 98,
                    "step": "Uploading to Cloudflare R2...",
                })
                print(f"[R2_UPLOAD_STARTED] key={output_r2_key} source={output_path}", flush=True)
                from utils.storage import upload_file, is_r2_url
                url = upload_file(output_path, output_r2_key, content_type="video/mp4")
                if is_r2_url(url):
                    video_url = url
                    print(f"[R2_UPLOAD_SUCCESS] key={output_r2_key} url={video_url}", flush=True)
                    print(f"[AI_VIDEO_UPLOADED_TO_R2] video_id={video_id} url={video_url}", flush=True)
                    # Delete local processed file — it's in R2 now
                    try:
                        os.remove(output_path)
                        print(f"[Pipeline] Cleaned up local processed file: {output_path}")
                    except OSError:
                        pass
                else:
                    print(f"[R2_UPLOAD_FAILED] R2 returned local path (R2 may be disabled): {url}", flush=True)
                print(f"[Pipeline] Video available at: {video_url}")
            except Exception as r2_err:
                import traceback
                error_info = {
                    "error_message": str(r2_err),
                    "error_type": type(r2_err).__name__,
                    "key": output_r2_key,
                    "output_path": output_path,
                }
                # Extract AWS/botocore error details
                try:
                    from botocore.exceptions import ClientError
                    if isinstance(r2_err, ClientError):
                        resp = r2_err.response or {}
                        error_info["aws_error_code"] = resp.get("Error", {}).get("Code", "unknown")
                        error_info["http_status_code"] = resp.get("ResponseMetadata", {}).get("HTTPStatusCode", "unknown")
                        error_info["r2_response"] = resp.get("Error", {})
                except ImportError:
                    pass
                print(f"[R2_UPLOAD_FAILED] {error_info}", flush=True)
                print(f"[R2_UPLOAD_FAILED] stack_trace={traceback.format_exc()}", flush=True)

        # ── Step 5: Upload captions to R2 ─────────────────────────
        caption_vtt_url = None
        caption_srt_url = None
        if video_id:
            try:
                from utils.storage import upload_file as _upload, is_r2_url as _is_r2, _r2_enabled
                if _r2_enabled():
                    import tempfile
                    # Generate VTT
                    vtt_lines = ["WEBVTT", ""]
                    for idx, cap in enumerate(captions):
                        def _vtt_ts(s):
                            h = int(s // 3600); m = int((s % 3600) // 60); sec = int(s % 60); ms = int((s % 1) * 1000)
                            return f"{h:02d}:{m:02d}:{sec:02d}.{ms:03d}"
                        vtt_lines.append(str(idx + 1))
                        vtt_lines.append(f"{_vtt_ts(cap['start'])} --> {_vtt_ts(cap['end'])}")
                        vtt_lines.append(cap["text"])
                        vtt_lines.append("")
                    vtt_content = "\n".join(vtt_lines)

                    # Generate SRT
                    srt_lines = []
                    for idx, cap in enumerate(captions):
                        def _srt_ts(s):
                            h = int(s // 3600); m = int((s % 3600) // 60); sec = int(s % 60); ms = int((s % 1) * 1000)
                            return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"
                        srt_lines.append(str(idx + 1))
                        srt_lines.append(f"{_srt_ts(cap['start'])} --> {_srt_ts(cap['end'])}")
                        srt_lines.append(cap["text"])
                        srt_lines.append("")
                    srt_content = "\n".join(srt_lines)

                    # Write to temp files and upload
                    vtt_tmp = os.path.join(os.path.dirname(input_path), f"captions_{video_id}.vtt")
                    srt_tmp = os.path.join(os.path.dirname(input_path), f"captions_{video_id}.srt")
                    with open(vtt_tmp, "w", encoding="utf-8") as f:
                        f.write(vtt_content)
                    with open(srt_tmp, "w", encoding="utf-8") as f:
                        f.write(srt_content)

                    vtt_key = f"captions/{video_id}/captions.vtt"
                    srt_key = f"captions/{video_id}/captions.srt"
                    caption_vtt_url = _upload(vtt_tmp, vtt_key, content_type="text/vtt")
                    caption_srt_url = _upload(srt_tmp, srt_key, content_type="text/plain")

                    # Also upload transcript JSON
                    transcript_data = json.dumps([{"start": c["start"], "end": c["end"], "text": c["text"]} for c in captions], indent=2)
                    transcript_tmp = os.path.join(os.path.dirname(input_path), f"transcript_{video_id}.json")
                    with open(transcript_tmp, "w", encoding="utf-8") as f:
                        f.write(transcript_data)
                    _upload(transcript_tmp, f"captions/{video_id}/transcript.json", content_type="application/json")

                    # Cleanup temp files
                    for tmp in [vtt_tmp, srt_tmp, transcript_tmp]:
                        try:
                            os.remove(tmp)
                        except OSError:
                            pass

                    print(f"[CAPTION_UPLOADED_TO_R2] video_id={video_id} vtt={vtt_key} srt={srt_key}", flush=True)
            except Exception as cap_err:
                print(f"[CAPTION_UPLOAD_FAILED] video_id={video_id} error={cap_err}", flush=True)

        # ── Step 6: Generate and upload thumbnail ─────────────────
        thumbnail_url = None
        if video_id:
            try:
                import cv2 as _cv2
                from utils.storage import upload_file as _upload2, is_r2_url as _is_r2_2, _r2_enabled as _r2_on
                if _r2_on():
                    thumb_cap = _cv2.VideoCapture(input_path if os.path.exists(input_path) else output_path)
                    if thumb_cap.isOpened():
                        # Seek to 1 second or first frame
                        fps = thumb_cap.get(_cv2.CAP_PROP_FPS) or 30.0
                        thumb_cap.set(_cv2.CAP_PROP_POS_FRAMES, int(fps))  # 1 second in
                        ret, thumb_frame = thumb_cap.read()
                        if not ret:  # fallback to first frame
                            thumb_cap.set(_cv2.CAP_PROP_POS_FRAMES, 0)
                            ret, thumb_frame = thumb_cap.read()
                        thumb_cap.release()
                        if ret and thumb_frame is not None:
                            thumb_tmp = os.path.join(os.path.dirname(output_path), f"thumb_{video_id}.jpg")
                            _cv2.imwrite(thumb_tmp, thumb_frame)
                            thumb_key = f"thumbnails/{video_id}/thumbnail.jpg"
                            thumbnail_url = _upload2(thumb_tmp, thumb_key, content_type="image/jpeg")
                            try:
                                os.remove(thumb_tmp)
                            except OSError:
                                pass
                            print(f"[THUMBNAIL_UPLOADED_TO_R2] video_id={video_id} key={thumb_key}", flush=True)
            except Exception as thumb_err:
                print(f"[THUMBNAIL_GENERATION_FAILED] video_id={video_id} error={thumb_err}", flush=True)

        # ── Clean up original input file (already in R2 from upload route) ──
        try:
            if os.path.exists(input_path):
                os.remove(input_path)
        except OSError:
            pass

        # ── Step 7: Save to Database ──────────────────────────────
        if video_id:
            from database.db import get_db_connection
            print("[DATABASE_SAVE_STARTED]", flush=True)
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                
                # Fetch original video details
                cursor.execute("""
                    SELECT teacher_id, course_id, title, filename, original_url 
                    FROM videos 
                    WHERE video_id = ?
                """, (video_id,))
                orig_video = cursor.fetchone()
                if not orig_video:
                    raise ValueError(f"Original video record not found in database for video_id {video_id}")
                
                teacher_id, course_id, orig_title, orig_filename, orig_url = orig_video
                print(f"[ORIGINAL_VIDEO_FOUND] video_id={video_id}", flush=True)
                
                # Get video duration
                duration = get_video_duration(output_path if os.path.exists(output_path) else input_path)
                
                # Cloudflare R2 Keys
                r2_cap_key = f"captions/{video_id}/captions.vtt" if caption_vtt_url else None
                r2_thumb_key = f"thumbnails/{video_id}/thumbnail.jpg" if thumbnail_url else None
                isl_r2_key_val = output_r2_key or f"isl/{video_id}/isl-video.mp4"

                # Update original video: status, caption_status, signing_status, thumbnail, duration, R2 keys
                cursor.execute("""
                    UPDATE videos 
                    SET status = 'done', upload_status = 'uploaded', processing_status = 'completed',
                        video_type = 'original', processed_at = CURRENT_TIMESTAMP,
                        caption_status = 'available', signing_status = 'available',
                        r2_captions_key = ?, r2_thumbnail_key = ?, r2_isl_key = ?,
                        thumbnail = ?, duration = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE video_id = ?
                """, (r2_cap_key, r2_thumb_key, isl_r2_key_val, thumbnail_url, duration, video_id))
                
                # Create a NEW record for the ISL video
                isl_title = f"[AI Deaf Signing] {orig_title}"
                isl_filename = f"signed_{orig_filename}"
                from utils.storage import is_r2_url
                
                cursor.execute("""
                    INSERT INTO videos (
                        teacher_id, course_id, title, filename, original_url, processed_url, r2_url,
                        status, upload_status, processing_status, original_video_id, video_type,
                        caption_status, signing_status, r2_key, r2_isl_key, r2_captions_key, r2_thumbnail_key,
                        thumbnail, duration, visibility
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'done', 'uploaded', 'completed', ?, 'ISL', 'available', 'available', ?, ?, ?, ?, ?, ?, 'Published')
                """, (
                    teacher_id, 
                    course_id, 
                    isl_title, 
                    isl_filename, 
                    orig_url, 
                    video_url, 
                    video_url if is_r2_url(video_url) else None, 
                    video_id,
                    isl_r2_key_val,
                    isl_r2_key_val,
                    r2_cap_key,
                    r2_thumb_key,
                    thumbnail_url,
                    duration
                ))
                isl_video_id = cursor.lastrowid
                
                # Now set captions_url for the new ISL video
                isl_captions_url = f"/video-captions?video_id={isl_video_id}"
                cursor.execute("""
                    UPDATE videos 
                    SET captions_url = ? 
                    WHERE video_id = ?
                """, (isl_captions_url, isl_video_id))

                # Also set captions_url on original video
                orig_captions_url = f"/video-captions?video_id={video_id}"
                cursor.execute("""
                    UPDATE videos 
                    SET captions_url = ? 
                    WHERE video_id = ?
                """, (orig_captions_url, video_id))
                
                # Delete any old captions for original and ISL video
                cursor.execute("DELETE FROM video_captions WHERE video_id = ?", (video_id,))
                cursor.execute("DELETE FROM video_captions WHERE video_id = ?", (isl_video_id,))
                
                # Insert new captions for BOTH videos (original and ISL)
                for cap in captions:
                    sign_sequence_json = json.dumps(cap.get("gestures", []))
                    # For original video
                    cursor.execute("""
                        INSERT INTO video_captions (video_id, start_time, end_time, text, sign_sequence)
                        VALUES (?, ?, ?, ?, ?)
                    """, (video_id, cap["start"], cap["end"], cap["text"], sign_sequence_json))
                    # For ISL video
                    cursor.execute("""
                        INSERT INTO video_captions (video_id, start_time, end_time, text, sign_sequence)
                        VALUES (?, ?, ?, ?, ?)
                    """, (isl_video_id, cap["start"], cap["end"], cap["text"], sign_sequence_json))
                    print(f"[TRANSCRIPT_SEGMENT_SAVED] video_id={isl_video_id} start={cap['start']} end={cap['end']} text=\"{cap['text']}\"")
                
                conn.commit()
                print("[DATABASE_SAVE_SUCCESS]", flush=True)
                print(f"[VIDEO_LIST_UPDATED] video_id={video_id}", flush=True)
                print(f"[AI_VIDEO_DATABASE_SAVED] video_id={isl_video_id} original_video_id={video_id}", flush=True)
                print(f"[CAPTION_SAVED] video_id={isl_video_id} count={len(captions)}")
                print(f"[CAPTION_SUCCESS] video_id={video_id}")
                print(f"[ISL_SUCCESS] video_id={video_id}")
                print(f"[Pipeline] Successfully saved {len(captions)} captions to DB for video_id {video_id}")
            except Exception as db_err:
                import traceback
                if 'conn' in locals():
                    conn.rollback()
                print(f"[DATABASE_SAVE_FAILED] video_id={video_id} error={db_err} traceback={traceback.format_exc()}", flush=True)
                raise db_err
            finally:
                if 'conn' in locals():
                    conn.close()

        _write_job(job_id, {
            "status": "done",
            "progress": 100,
            "step": "Complete",
            "captions": formatted_captions,
            "video_url": video_url,
        })
        print(f"[Pipeline] Job {job_id} completed successfully")
        _cleanup_old_jobs()  # Opportunistic cleanup

    except Exception as e:
        import traceback
        import sys
        print(f"[Pipeline] Job {job_id} failed: {e}")
        print(f"[Pipeline] stack_trace={traceback.format_exc()}", flush=True)
        _write_job(job_id, {"status": "error", "error": str(e)})
        
        # Format exact line/file/root cause traceback
        exc_type, exc_obj, exc_tb = sys.exc_info()
        tb = traceback.extract_tb(exc_tb)
        last_frame = tb[-1] if tb else None
        file_name = last_frame.filename if last_frame else "video_pipeline.py"
        line_num = last_frame.lineno if last_frame else 0
        func_name = last_frame.name if last_frame else "process_video_pipeline"
        err_msg = str(e)
        stack_str = traceback.format_exc()
        
        print(json.dumps({
            "error_log": {
                "file": file_name,
                "function": func_name,
                "line": line_num,
                "message": err_msg,
                "stack_trace": stack_str,
                "root_cause": f"Pipeline execution failed: {err_msg}"
            }
        }, indent=2), flush=True)

        if video_id:
            from database.db import get_db_connection
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE videos SET status = 'error', 
                        caption_status = 'failed', signing_status = 'failed',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE video_id = ?
                """, (video_id,))
                conn.commit()
                conn.close()
                print(f"[CAPTION_FAILED] video_id={video_id}", flush=True)
                print(f"[ISL_FAILED] video_id={video_id}", flush=True)
            except Exception:
                pass


def _render_video_with_overlay(input_path, output_path, captions, job_id, video_id=None):
    """
    Process each frame of the video:
    - Overlay a sign language avatar in the bottom-right corner
    - Burn captions at the bottom-center
    """
    import cv2
    from utils.avatar_renderer import render_avatar_on_frame

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    frame_idx = 0
    caption_idx = 0
    num_captions = len(captions)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        current_time = frame_idx / fps

        # Find the active caption for this timestamp (optimized O(1) lookup)
        active_caption = None
        active_gesture = None
        
        while caption_idx < num_captions and current_time > captions[caption_idx]["end"]:
            caption_idx += 1
            
        if caption_idx < num_captions:
            c = captions[caption_idx]
            if c["start"] <= current_time <= c["end"]:
                active_caption = c["text"]
                gestures = c.get("gestures", [])
                if gestures:
                    segment_duration = max(c["end"] - c["start"], 0.1)
                    elapsed = current_time - c["start"]
                    gesture_idx = min(
                        int((elapsed / segment_duration) * len(gestures)),
                        len(gestures) - 1
                    )
                    active_gesture = gestures[gesture_idx]

        # Render sign avatar overlay
        if active_gesture:
            frame = render_avatar_on_frame(frame, active_gesture)

        # Burn caption text
        if active_caption:
            frame = _burn_caption(frame, active_caption, width, height)

        writer.write(frame)
        frame_idx += 1
        time.sleep(0.001)  # Yield GIL so Gunicorn thread can handle /video-status requests

        # Update progress (45% → 95%) — only every 5% to reduce disk I/O
        if total_frames > 0 and frame_idx % max(1, total_frames // 20) == 0:
            render_progress = 45 + int((frame_idx / total_frames) * 50)
            _write_job(job_id, {
                "status": "processing",
                "progress": min(render_progress, 95),
                "step": f"Rendering frame {frame_idx}/{total_frames}"
            })

    cap.release()
    writer.release()
    print(f"[AI_VIDEO_CREATED] video_path={output_path}", flush=True)

    # Try to merge audio back using ffmpeg and transcode to standard H.264
    _merge_audio(input_path, output_path, video_id=video_id)

    _write_job(job_id, {"status": "processing", "progress": 98, "step": "Finalizing..."})


def _burn_caption(frame, text, width, height):
    """Burn caption text at the bottom-center of the frame."""
    import cv2

    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.7
    thickness = 2
    color = (255, 255, 255)
    bg_color = (0, 0, 0)

    # Wrap text if too long
    max_chars = max(30, width // 15)
    lines = []
    words = text.split()
    current_line = ""
    for word in words:
        if len(current_line) + len(word) + 1 > max_chars:
            lines.append(current_line.strip())
            current_line = word + " "
        else:
            current_line += word + " "
    if current_line.strip():
        lines.append(current_line.strip())

    line_height = 30
    total_height = len(lines) * line_height + 20
    y_start = height - total_height - 10

    # Draw semi-transparent background for captions
    overlay = frame.copy()
    cv2.rectangle(overlay, (10, y_start), (width - 10, height - 10), bg_color, -1)
    frame = cv2.addWeighted(overlay, 0.6, frame, 0.4, 0)

    for i, line in enumerate(lines):
        text_size = cv2.getTextSize(line, font, font_scale, thickness)[0]
        x = (width - text_size[0]) // 2
        y = y_start + 15 + i * line_height
        cv2.putText(frame, line, (x, y), font, font_scale, color, thickness)

    return frame


def _get_ffmpeg_exe():
    """Retrieve the ffmpeg executable path via imageio_ffmpeg or fallback to 'ffmpeg'."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def get_video_duration(video_path):
    """Retrieve video duration using ffmpeg."""
    try:
        import subprocess
        import re
        ffmpeg_exe = _get_ffmpeg_exe()
        res = subprocess.run([ffmpeg_exe, "-i", video_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        output = res.stderr or res.stdout
        match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", output)
        if match:
            hours = int(match.group(1))
            minutes = int(match.group(2))
            seconds = float(match.group(3))
            return hours * 3600 + minutes * 60 + seconds
    except Exception as e:
        print(f"Error getting duration: {e}")
    return 0.0


def _merge_audio(original_video, processed_video, video_id=None):
    """
    Merge original audio back into the processed video using ffmpeg and transcode to standard H.264.
    Overwrites the processed video file with web-compatible H.264 / AAC video.
    """
    import subprocess
    temp_output = processed_video + ".temp.mp4"
    ffmpeg_exe = _get_ffmpeg_exe()

    # 1. Primary transcode command: combine H.264 video with AAC audio from original
    cmd = [
        ffmpeg_exe, "-y",
        "-i", processed_video,
        "-i", original_video,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-movflags", "+faststart",
        "-shortest",
        temp_output
    ]

    try:
        print(f"[FFMPEG_STARTING] cmd={' '.join(cmd)}", flush=True)
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode == 0 and os.path.exists(temp_output) and os.path.getsize(temp_output) > 0:
            os.replace(temp_output, processed_video)
            print("[Pipeline] Audio merged and video transcoded to standard H.264/AAC with faststart", flush=True)
            print(f"[FFMPEG_COMPLETED] video_path={processed_video}", flush=True)
            return
        else:
            err_log = result.stderr.decode() if result.stderr else "Unknown error"
            print(f"[Pipeline] Primary ffmpeg transcode failed (code {result.returncode}): {err_log}", flush=True)
    except Exception as e:
        print(f"[Pipeline] Primary ffmpeg attempt error: {e}", flush=True)
    finally:
        if os.path.exists(temp_output):
            try:
                os.remove(temp_output)
            except OSError:
                pass

    # 2. Fallback transcode command: transcode video only to standard H.264 (without audio mapping)
    fallback_cmd = [
        ffmpeg_exe, "-y",
        "-i", processed_video,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        temp_output
    ]

    try:
        print(f"[FFMPEG_FALLBACK_STARTING] cmd={' '.join(fallback_cmd)}", flush=True)
        fb_result = subprocess.run(fallback_cmd, capture_output=True, timeout=120)
        if fb_result.returncode == 0 and os.path.exists(temp_output) and os.path.getsize(temp_output) > 0:
            os.replace(temp_output, processed_video)
            print("[Pipeline] Fallback H.264 transcode succeeded", flush=True)
            print(f"[FFMPEG_COMPLETED] video_path={processed_video}", flush=True)
        else:
            fb_log = fb_result.stderr.decode() if fb_result.stderr else "Unknown error"
            print(f"[Pipeline] Fallback ffmpeg transcode failed (code {fb_result.returncode}): {fb_log}", flush=True)
    except Exception as fb_err:
        print(f"[Pipeline] Fallback ffmpeg error: {fb_err}", flush=True)
    finally:
        if os.path.exists(temp_output):
            try:
                os.remove(temp_output)
            except OSError:
                pass


def _format_time(seconds):
    """Convert seconds to MM:SS format."""
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}:{s:02d}"


def start_pipeline(input_path, output_path, output_r2_key=None, video_id=None):
    """
    Start the video processing pipeline in a background thread.

    Args:
        input_path:     Local path to the input video.
        output_path:    Local path for the processed video output.
        output_r2_key:  R2 object key to upload the processed video to.
                        If None, the processed video stays on local disk.
        video_id:       Optional video_id database primary key.
    Returns:
        str: Unique job_id for polling via /video-status.
    """
    job_id = str(uuid.uuid4())
    thread = threading.Thread(
        target=process_video_pipeline,
        args=(job_id, input_path, output_path),
        kwargs={"output_r2_key": output_r2_key, "video_id": video_id},
    )
    thread.daemon = True
    thread.start()
    return job_id


def get_job_status(job_id):
    """Get the current status of a processing job."""
    state = _read_job(job_id)
    if not state:
        return {"status": "unknown"}
    # Strip internal metadata before returning to client
    return {k: v for k, v in state.items() if not k.startswith("_")}
