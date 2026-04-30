"""
Speech to Text Utility
Uses OpenAI Whisper for accurate audio transcription from video files.
Falls back to SpeechRecognition if Whisper is unavailable.
"""
import os
import tempfile


def extract_audio_from_video(video_path):
    """
    Extract audio track from a video file using moviepy.
    Returns the path to a temporary WAV file.
    """
    try:
        from moviepy.editor import VideoFileClip
    except ImportError:
        from moviepy import VideoFileClip

    temp_audio = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    temp_audio.close()

    clip = VideoFileClip(video_path)
    if clip.audio is None:
        clip.close()
        raise ValueError("Video has no audio track")
    clip.audio.write_audiofile(temp_audio.name, logger=None)
    clip.close()

    return temp_audio.name


def transcribe_audio(video_path):
    """
    Transcribe audio from a video file.
    Pipeline: video → extract audio → Whisper STT → caption segments.
    Returns: list of dicts [{text, start, end}, ...]
    """
    audio_path = None
    try:
        # Step 1: Extract audio from video
        print(f"[STT] Extracting audio from: {video_path}")
        audio_path = extract_audio_from_video(video_path)
        print(f"[STT] Audio extracted to: {audio_path}")

        # Step 2: Transcribe with Whisper
        captions = _transcribe_with_whisper(audio_path)
        if captions:
            print(f"[STT] Whisper produced {len(captions)} segments")
            return captions

        # Step 3: Fallback to SpeechRecognition
        print("[STT] Whisper failed, trying SpeechRecognition fallback...")
        captions = _transcribe_with_speech_recognition(audio_path)
        if captions:
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


def _transcribe_with_whisper(audio_path):
    """Transcribe using OpenAI Whisper."""
    try:
        import whisper

        model = whisper.load_model("base")
        result = model.transcribe(audio_path, fp16=False)

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
    """Fallback transcription using SpeechRecognition + Google API."""
    try:
        import speech_recognition as sr

        recognizer = sr.Recognizer()
        with sr.AudioFile(audio_path) as source:
            audio = recognizer.record(source)

        text = recognizer.recognize_google(audio)
        # SpeechRecognition doesn't give timestamps, so return as single segment
        return [{
            "text": text,
            "start": 0.0,
            "end": 0.0,
        }]

    except ImportError:
        print("[STT] SpeechRecognition not installed")
        return None
    except Exception as e:
        print(f"[STT] SpeechRecognition error: {e}")
        return None
