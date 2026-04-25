"""
Speech to Text Utility
Wraps OpenAI Whisper or SpeechRecognition.
"""
import os

def transcribe_audio(audio_path):
    """
    Mock transcription using Whisper.
    In production:
      import whisper
      model = whisper.load_model("base")
      result = model.transcribe(audio_path)
      return result["segments"]
    """
    print(f"[INFO] Mock transcribing audio: {audio_path}")
    # Return mock captions: [{text, start, end}]
    return [
        {"text": "Welcome to the class.", "start": 0.0, "end": 2.0},
        {"text": "Today we will learn about neural networks.", "start": 2.5, "end": 5.0},
    ]
