"""
MediaPipe Hands Utils
Extracts landmarks and builds sequences for ASL recognition.
"""

import numpy as np

def extract_landmarks(frame):
    """
    Mock function to extract 63 landmarks (21 points * 3 dims) from a frame.
    In production, this would use mediapipe.solutions.hands.
    """
    # Return random 63-dim vector
    return np.random.rand(63).tolist()

def build_sequence(frames, seq_length=30):
    """
    Build a sequence of landmarks from a list of frames.
    Pads or truncates to ensure sequence length of `seq_length`.
    """
    sequence = [extract_landmarks(f) for f in frames]
    if len(sequence) > seq_length:
        sequence = sequence[-seq_length:]
    elif len(sequence) < seq_length:
        # Pad with zeros
        padding = [np.zeros(63).tolist() for _ in range(seq_length - len(sequence))]
        sequence = padding + sequence
    return sequence
