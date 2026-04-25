"""
Sign Injector Utility
Maps text to sign gestures (using the sign_overlay_model logic or dictionary).
"""
import re

def text_to_gesture_sequence(text):
    """
    Translates text into a sequence of gesture words.
    In production, this queries sign_overlay_model.h5.
    For now, it returns the words directly mapped to some known signs.
    """
    words = re.sub(r'[^\w\s]', '', text).lower().split()
    # Mock lookup
    return words
