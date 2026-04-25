"""
Video Pipeline Utility
Orchestrates the entire extraction, transcription, and rendering pipeline.
"""
import os
import threading
import time

# Mock dictionary to store job statuses
_JOBS = {}

def process_video_pipeline(job_id, input_path, output_path):
    """
    Background worker to process the video.
    Step 1: Upload video → save to /uploads/
    Step 2: Extract audio from video using moviepy
    Step 3: Run speech-to-text on audio (OpenAI Whisper / SpeechRecognition)
    Step 4: Convert transcript text → sign gesture sequences (word by word)
    Step 5: Render sign avatar overlay on each video frame using OpenCV
    Step 6: Merge processed frames back into video with original visuals
    Step 7: Save output to /processed_videos/
    """
    _JOBS[job_id] = {"status": "processing", "progress": 0}
    
    try:
        from utils.speech_to_text import transcribe_audio
        from utils.sign_injector import text_to_gesture_sequence
        
        # Simulate Step 2: Audio extraction
        time.sleep(1)
        _JOBS[job_id]["progress"] = 20
        
        # Simulate Step 3: Transcription
        captions = transcribe_audio(input_path)
        time.sleep(2)
        _JOBS[job_id]["progress"] = 40
        
        # Simulate Step 4: Text to Gestures
        for cap in captions:
            cap["gestures"] = text_to_gesture_sequence(cap["text"])
        time.sleep(1)
        _JOBS[job_id]["progress"] = 60
        
        # Simulate Step 5 & 6: Rendering frames with OpenCV and merging
        # In production: cv2.VideoCapture -> cv2.VideoWriter + render_avatar_on_frame -> ffmpeg audio merge
        time.sleep(3)
        _JOBS[job_id]["progress"] = 90
        
        # Simulate Step 7: Save output
        # For mock, we'll just copy input to output to simulate a created file
        with open(input_path, 'rb') as f_in:
            with open(output_path, 'wb') as f_out:
                f_out.write(f_in.read())
        
        time.sleep(1)
        _JOBS[job_id] = {"status": "done", "progress": 100, "captions": captions}
        
    except Exception as e:
        _JOBS[job_id] = {"status": "error", "error": str(e)}

def start_pipeline(input_path, output_path):
    """
    Starts the video processing in a background thread.
    Returns a job_id.
    """
    import uuid
    job_id = str(uuid.uuid4())
    
    thread = threading.Thread(target=process_video_pipeline, args=(job_id, input_path, output_path))
    thread.daemon = True
    thread.start()
    
    return job_id

def get_job_status(job_id):
    return _JOBS.get(job_id, {"status": "unknown"})
