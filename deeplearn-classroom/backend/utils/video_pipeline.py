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
import threading
import uuid

_JOBS = {}


def process_video_pipeline(job_id, input_path, output_path):
    """
    Background worker that runs the full pipeline.
    Updates _JOBS[job_id] with progress and status.
    """
    _JOBS[job_id] = {"status": "processing", "progress": 0, "step": "Initializing..."}

    try:
        # ── Step 1: Transcribe audio ──────────────────────────────
        _JOBS[job_id].update({"progress": 5, "step": "Extracting audio & transcribing..."})

        from utils.speech_to_text import transcribe_audio
        captions = transcribe_audio(input_path)

        if not captions:
            captions = [{"text": "No speech detected in video.", "start": 0.0, "end": 2.0}]

        _JOBS[job_id].update({"progress": 30, "step": f"Transcription complete — {len(captions)} segments"})

        # ── Step 2: Map text to sign gestures ─────────────────────
        _JOBS[job_id].update({"progress": 35, "step": "Mapping text to sign gestures..."})

        from utils.sign_injector import text_to_gesture_sequence, get_gesture_duration
        for cap in captions:
            cap["gestures"] = text_to_gesture_sequence(cap["text"])

        _JOBS[job_id].update({"progress": 40, "step": "Gesture mapping complete"})

        # ── Step 3: Render avatar overlay + captions on video ─────
        _JOBS[job_id].update({"progress": 45, "step": "Rendering sign overlay on video frames..."})

        _render_video_with_overlay(input_path, output_path, captions, job_id)

        # ── Done ──────────────────────────────────────────────────
        formatted_captions = []
        for cap in captions:
            formatted_captions.append({
                "text": cap["text"],
                "start_time": _format_time(cap["start"]),
                "end_time": _format_time(cap["end"]),
                "gestures": cap.get("gestures", []),
            })

        _JOBS[job_id] = {
            "status": "done",
            "progress": 100,
            "step": "Complete",
            "captions": formatted_captions,
        }
        print(f"[Pipeline] Job {job_id} completed successfully")

    except Exception as e:
        print(f"[Pipeline] Job {job_id} failed: {e}")
        _JOBS[job_id] = {"status": "error", "error": str(e)}


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
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        current_time = frame_idx / fps

        # Find the active caption for this timestamp
        active_caption = None
        active_gesture = None
        for c in captions:
            if c["start"] <= current_time <= c["end"]:
                active_caption = c["text"]
                gestures = c.get("gestures", [])
                if gestures:
                    # Calculate which gesture word to show based on time within segment
                    segment_duration = max(c["end"] - c["start"], 0.1)
                    elapsed = current_time - c["start"]
                    gesture_idx = min(
                        int((elapsed / segment_duration) * len(gestures)),
                        len(gestures) - 1
                    )
                    active_gesture = gestures[gesture_idx]
                break

        # Render sign avatar overlay
        if active_gesture:
            frame = render_avatar_on_frame(frame, active_gesture)

        # Burn caption text
        if active_caption:
            frame = _burn_caption(frame, active_caption, width, height)

        writer.write(frame)
        frame_idx += 1

        # Update progress (45% → 95%)
        if total_frames > 0 and frame_idx % max(1, total_frames // 20) == 0:
            render_progress = 45 + int((frame_idx / total_frames) * 50)
            _JOBS[job_id].update({
                "progress": min(render_progress, 95),
                "step": f"Rendering frame {frame_idx}/{total_frames}"
            })

    cap.release()
    writer.release()

    # Try to merge audio back using ffmpeg
    _merge_audio(input_path, output_path)

    _JOBS[job_id].update({"progress": 98, "step": "Finalizing..."})


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


def start_pipeline(input_path, output_path):
    """
    Start the video processing pipeline in a background thread.
    Returns a unique job_id.
    """
    job_id = str(uuid.uuid4())
    thread = threading.Thread(
        target=process_video_pipeline,
        args=(job_id, input_path, output_path)
    )
    thread.daemon = True
    thread.start()
    return job_id


def get_job_status(job_id):
    """Get the current status of a processing job."""
    return _JOBS.get(job_id, {"status": "unknown"})
