"""
Speech to Text Utility
Uses OpenAI Whisper for accurate audio transcription from video files.
Falls back to SpeechRecognition if Whisper is unavailable.
"""
import os
import tempfile


def extract_audio_from_video(video_path):
    """
    Extract audio track from a video file using FFmpeg.
    Returns the path to a temporary WAV file (mono, 16000Hz).
    """
    import subprocess
    
    temp_audio = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    audio_path = temp_audio.name
    temp_audio.close()
    
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ffmpeg_exe = "ffmpeg"
    
    command = [
        ffmpeg_exe, "-y",
        "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        audio_path
    ]
    
    try:
        # Check if the video file has an audio track using ffmpeg -i stream information
        probe_res = subprocess.run([ffmpeg_exe, "-i", video_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        probe_output = probe_res.stderr or probe_res.stdout
        
        if "Audio:" in probe_output:
            print(f"[AUDIO_TRACK_DETECTED] video_path={video_path}", flush=True)
        else:
            print(f"[STT] Warning: No audio stream detected in {video_path}", flush=True)

        subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:
        if os.path.exists(audio_path):
            os.remove(audio_path)
        err_msg = e.stderr.decode() if e.stderr else str(e)
        if "does not contain any stream" in err_msg or "Output file" in err_msg:
            print(f"[STT] Creating silent audio fallback for silent video: {video_path}", flush=True)
            try:
                silent_cmd = [
                    ffmpeg_exe, "-y",
                    "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
                    "-t", "1.0",
                    audio_path
                ]
                subprocess.run(silent_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            except Exception as silent_err:
                print(f"[STT] Failed to create silent audio fallback: {silent_err}", flush=True)
                raise RuntimeError(f"FFmpeg audio extraction failed: {err_msg}")
        else:
            raise RuntimeError(f"FFmpeg failed: {err_msg}")
    except FileNotFoundError:
        if os.path.exists(audio_path):
            os.remove(audio_path)
        raise RuntimeError("FFmpeg is not installed or not in PATH")
        
    file_size = os.path.getsize(audio_path)
    print(f"[STT] Audio file size: {file_size} bytes", flush=True)
    print(f"[AUDIO_EXTRACTED] audio_path={audio_path} size={file_size}", flush=True)
    
    if file_size == 0:
        if os.path.exists(audio_path):
            os.remove(audio_path)
        raise RuntimeError("Extracted audio file size is 0")
        
    return audio_path


def transcribe_audio(video_path, progress_callback=None):
    """
    Transcribe audio from a video file.
    Pipeline: video → extract audio → Whisper STT → caption segments.
    Returns: list of dicts [{text, start, end}, ...]
    """
    audio_path = None
    try:
        # Step 1: Extract audio from video
        if progress_callback:
            progress_callback("Extracting audio from video file...", 10)
        print(f"[STT] Extracting audio from: {video_path}")
        audio_path = extract_audio_from_video(video_path)
        print(f"[STT] Audio extracted to: {audio_path}")

        # Check if running on memory-constrained Render server to bypass Whisper
        is_render = os.environ.get("RENDER") == "true"
        use_whisper = os.environ.get("USE_WHISPER", "false" if is_render else "true") == "true"

        if use_whisper:
            # Step 2: Transcribe with Whisper
            if progress_callback:
                progress_callback("Loading Whisper speech-to-text model...", 15)
            print(f"[TRANSCRIPTION_STARTED] method=whisper model={os.environ.get('WHISPER_MODEL', 'tiny')}")
            captions = _transcribe_with_whisper(audio_path, progress_callback)
            if captions:
                print(f"[TRANSCRIPTION_COMPLETED] method=whisper segments={len(captions)}")
                print(f"[STT] Whisper produced {len(captions)} segments")
                return captions
        else:
            print("[STT] Whisper is disabled (using SpeechRecognition directly for memory savings)")

        # Step 3: Fallback to SpeechRecognition
        if progress_callback:
            progress_callback("Running fallback speech recognition...", 25)
        print("[TRANSCRIPTION_STARTED] method=speech_recognition")
        print("[STT] Running SpeechRecognition transcription...")
        captions = _transcribe_with_speech_recognition(audio_path)
        if captions:
            print(f"[TRANSCRIPTION_COMPLETED] method=speech_recognition segments={len(captions)}")
            return captions

        # Final fallback: return empty
        print("[STT] All transcription methods failed")
        return []

    except Exception as e:
        print(f"[STT] Error: {e}")
        return []
    finally:
        # Clean up temp audio file
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except OSError:
                pass


def _transcribe_with_whisper(audio_path, progress_callback=None):
    """Transcribe using OpenAI Whisper."""
    import time
    try:
        import whisper

        whisper_model = os.environ.get("WHISPER_MODEL", "tiny")
        model = None
        
        # Retry model loading up to 3 times
        for attempt in range(3):
            try:
                print(f"[STT] Loading Whisper model: {whisper_model} (attempt {attempt + 1})")
                if progress_callback:
                    progress_callback(f"Loading Whisper model '{whisper_model}' (attempt {attempt + 1}/3)...", 15 + attempt * 2)
                model = whisper.load_model(whisper_model)
                break
            except Exception as e:
                print(f"[STT] Model load attempt {attempt + 1} failed: {e}")
                if attempt < 2:
                    time.sleep(2)
        
        if not model:
            raise RuntimeError("Failed to load Whisper model after 3 attempts")

        if progress_callback:
            progress_callback("Transcribing audio segments with Whisper...", 22)
            
        # Guided transcription via technical vocabulary in initial prompt
        tech_prompt = (
            "React, Python, HTML, CSS, JavaScript, database, SQL, AWS, deployment, "
            "Git, GitHub, programming, software engineering, variables, objects, functions, "
            "loops, array, classroom, lecture, learning, virtual classroom."
        )
        print(f"[TRANSCRIPTION_REQUEST_SENT] method=whisper model={whisper_model}")
        result = model.transcribe(audio_path, fp16=False, initial_prompt=tech_prompt)
        print(f"[TRANSCRIPTION_RESPONSE_RECEIVED] method=whisper segments={len(result.get('segments', []))}")

        captions = []
        for segment in result.get("segments", []):
            captions.append({
                "text": segment["text"].strip(),
                "start": round(segment["start"], 2),
                "end": round(segment["end"], 2),
            })

        return captions if captions else None

    except ImportError:
        print("[STT] Whisper not installed")
        return None
    except Exception as e:
        print(f"[STT] Whisper error: {e}")
        return None


def _transcribe_with_speech_recognition(audio_path):
    """Fallback transcription using SpeechRecognition + Google API in 15-second chunks."""
    try:
        import speech_recognition as sr
        import wave

        # Get audio duration to provide valid timestamps
        duration = 0.0
        try:
            with wave.open(audio_path, 'rb') as f:
                frames = f.getnframes()
                rate = f.getframerate()
                duration = frames / float(rate)
        except Exception as e:
            print(f"[STT] Failed to read audio duration: {e}")

        recognizer = sr.Recognizer()
        chunk_duration = 15.0
        current_time = 0.0
        captions = []

        while current_time < duration:
            print(f"[STT] Processing chunk {current_time}s to {current_time + chunk_duration}s...")
            print(f"[TRANSCRIPTION_REQUEST_SENT] method=speech_recognition offset={current_time} duration={chunk_duration}")
            with sr.AudioFile(audio_path) as source:
                audio = recognizer.record(source, offset=current_time, duration=chunk_duration)
            try:
                text = recognizer.recognize_google(audio)
                print(f"[TRANSCRIPTION_RESPONSE_RECEIVED] method=speech_recognition status=success length={len(text) if text else 0}")
                if text:
                    text = text.strip()
                    if text:
                        # Capitalize first letter and add a period if not present
                        text = text[0].upper() + text[1:]
                        if text[-1] not in {'.', '?', '!'}:
                            text += '.'
                        
                        captions.append({
                            "text": text,
                            "start": round(current_time, 2),
                            "end": round(min(current_time + chunk_duration, duration), 2)
                        })
            except sr.UnknownValueError:
                print(f"[TRANSCRIPTION_RESPONSE_RECEIVED] method=speech_recognition status=no-speech")
            except Exception as e:
                print(f"[TRANSCRIPTION_RESPONSE_RECEIVED] method=speech_recognition status=error error={str(e)}")
                print(f"[STT] Google SR chunk error at {current_time}s: {e}")
                
            current_time += chunk_duration

        return captions if captions else None

    except ImportError:
        print("[STT] SpeechRecognition not installed")
        return None
    except Exception as e:
        print(f"[STT] SpeechRecognition error: {e}")
        return None
