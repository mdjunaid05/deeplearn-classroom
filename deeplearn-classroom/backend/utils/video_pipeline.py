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


def _write_job(job_id: str, state: dict) -> None:
    """Persist job state to disk (atomic write via temp file + rename)."""
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


def _read_job(job_id: str) -> dict:
    """Read job state. Prefer disk (cross-worker), fall back to memory."""
    path = _job_path(job_id)
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                return json.load(f)
    except (OSError, json.JSONDecodeError):
        pass
    with _JOBS_LOCK:
        return _JOBS_MEMORY.get(job_id, {})


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

        _render_video_with_overlay(input_path, output_path, captions, job_id)

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

        # ── Clean up original input file (already in R2 from upload route) ──
        try:
            if os.path.exists(input_path):
                os.remove(input_path)
        except OSError:
            pass

        # ── Step 5: Save to Database ──────────────────────────────
        if video_id:
            from database.db import get_db_connection
            print("[DATABASE_SAVE_STARTED]", flush=True)
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                
                # Update status, url, r2_url and transcript
                full_transcript = " ".join([cap["text"] for cap in captions])
                from utils.storage import is_r2_url
                cursor.execute("""
                    UPDATE videos 
                    SET status = 'done', processed_url = ?, r2_url = ?, transcript = ?, processed_at = CURRENT_TIMESTAMP
                    WHERE video_id = ?
                """, (video_url, video_url if is_r2_url(video_url) else None, full_transcript, video_id))
                
                # Delete any old captions for this video_id
                cursor.execute("DELETE FROM video_captions WHERE video_id = ?", (video_id,))
                
                # Insert new captions
                for cap in captions:
                    sign_sequence_json = json.dumps(cap.get("gestures", []))
                    cursor.execute("""
                        INSERT INTO video_captions (video_id, start_time, end_time, text, sign_sequence)
                        VALUES (?, ?, ?, ?, ?)
                    """, (video_id, cap["start"], cap["end"], cap["text"], sign_sequence_json))
                    print(f"[TRANSCRIPT_SEGMENT_SAVED] video_id={video_id} start={cap['start']} end={cap['end']} text=\"{cap['text']}\"")
                
                conn.commit()
                print("[DATABASE_SAVE_SUCCESS]", flush=True)
                print(f"[VIDEO_LIST_UPDATED] video_id={video_id}", flush=True)
                print(f"[CAPTION_SAVED] video_id={video_id} count={len(captions)}")
                print(f"[Pipeline] Successfully saved {len(captions)} captions to DB for video_id {video_id}")
            except Exception as db_err:
                import traceback
                if 'conn' in locals():
                    conn.rollback()
                print(f"[DATABASE_SAVE_FAILED] video_id={video_id} error={db_err} traceback={traceback.format_exc()}", flush=True)
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
        print(f"[Pipeline] Job {job_id} failed: {e}")
        print(f"[Pipeline] stack_trace={traceback.format_exc()}", flush=True)
        _write_job(job_id, {"status": "error", "error": str(e)})
        if video_id:
            from database.db import get_db_connection
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("UPDATE videos SET status = 'error' WHERE video_id = ?", (video_id,))
                conn.commit()
                conn.close()
            except Exception:
                pass


def _render_video_with_overlay(input_path, output_path, captions, job_id):
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

    # Try to merge audio back using ffmpeg
    _merge_audio(input_path, output_path)

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


def _merge_audio(original_video, processed_video):
    """
    Merge original audio back into the processed video using ffmpeg.
    Overwrites the processed video file.
    """
    try:
        import subprocess
        temp_output = processed_video + ".temp.mp4"
        cmd = [
            "ffmpeg", "-y",
            "-i", processed_video,
            "-i", original_video,
            "-c:v", "copy",
            "-c:a", "aac",
            "-map", "0:v:0",
            "-map", "1:a:0?",
            "-shortest",
            temp_output
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode == 0 and os.path.exists(temp_output):
            os.replace(temp_output, processed_video)
            print("[Pipeline] Audio merged successfully")
        else:
            # If ffmpeg fails, keep video without audio
            if os.path.exists(temp_output):
                os.remove(temp_output)
            print("[Pipeline] ffmpeg audio merge skipped (no ffmpeg or no audio)")
    except Exception as e:
        print(f"[Pipeline] Audio merge failed: {e}")


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
