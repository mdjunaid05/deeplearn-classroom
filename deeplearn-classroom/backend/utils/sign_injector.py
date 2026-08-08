"""
Sign Injector Utility — Indian Sign Language (ISL) Edition
Maps transcribed speech text into authentic Indian Sign Language gesture sequences.
Conforms to ISLRTC (Indian Sign Language Research and Training Centre) and INCLUDE dataset lexicons.
"""
import re

# Comprehensive authentic Indian Sign Language (ISL) vocabulary & glosses
ISL_SIGNS = {
    # Greetings & Social
    "namaste", "namaskar", "pranam", "hello", "hi", "welcome", "swagat",
    "thank", "thanks", "dhanyavaad", "shukriya", "please", "kripya",
    "sorry", "help", "madad", "sahayata",

    # Education & Classroom
    "learn", "study", "padhna", "teach", "teacher", "shikshak", "guru",
    "student", "vidyarthi", "class", "classroom", "kaksha", "school",
    "book", "read", "write", "question", "prashna", "sawal", "answer",
    "test", "quiz", "exam", "pariksha",

    # Affirmation & Negation
    "yes", "ha", "haan", "correct", "right", "sahi", "good", "accha", "great",
    "no", "nahi", "na", "wrong", "galat", "bad", "bura", "error",
    "stop", "ruko", "repeat", "dobara", "phir",

    # Cognition & Understanding
    "understand", "samajh", "think", "sochna", "know", "pata", "remember",
    "yaad", "forget", "bhoolna", "start", "shuru", "finish", "khatam",

    # Question markers (ISL Wh- interrogatives)
    "what", "kya", "where", "kaha", "when", "kab", "why", "kyun", "how", "kaise",
    "who", "kaun",

    # STEM & Modern Academic Terminology
    "computer", "network", "data", "model", "train", "neural", "deep",
    "machine", "artificial", "intelligence", "science", "vigyan", "math", "ganit",
    "number", "ginti", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",

    # Time & General
    "today", "tomorrow", "yesterday", "now", "later", "time", "day", "week", "month", "year",
}

# ISL Grammar Stopwords (filtered out as ISL uses Topic-Comment / SOV syntax)
ISL_STOPWORDS = {
    "a", "an", "the", "is", "am", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "shall", "can", "may", "might", "must",
    "of", "in", "on", "at", "to", "for", "with", "by", "from",
    "as", "into", "through", "during", "about", "and", "but", "or",
    "so", "if", "then", "that", "this", "these", "those",
    "not", "very", "just", "also", "than",
}


def text_to_gesture_sequence(text):
    """
    Converts a text string into an Indian Sign Language (ISL) gesture sequence.

    Each token is either:
      - A standardized ISL sign word (e.g., "NAMASTE", "DHANYAVAAD", "SAMAJH", "PADHNA")
      - An ISL two-handed fingerspelled token marked as "ISL_FS:WORD" for unknown words

    Returns: list of ISL gesture tokens
    """
    cleaned = re.sub(r'[^\w\s]', '', text).lower()
    words = cleaned.split()

    gestures = []
    for word in words:
        if not word or word in ISL_STOPWORDS:
            continue

        if word in ISL_SIGNS:
            gestures.append(word.upper())
        else:
            # Fall back to authentic ISL two-handed manual fingerspelling
            gestures.append(f"ISL_FS:{word.upper()}")

    return gestures


def get_gesture_duration(gesture):
    """
    Estimate duration of an ISL gesture in seconds.
    Direct signs take ~0.75s; two-handed fingerspelling takes ~0.25s per letter.
    """
    if gesture.startswith("ISL_FS:") or gesture.startswith("FS:"):
        word = gesture.split(":")[-1]
        return max(0.5, len(word) * 0.25)
    return 0.75
