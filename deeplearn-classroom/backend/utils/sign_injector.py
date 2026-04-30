"""
Sign Injector Utility
Maps transcribed text to sign language gesture sequences.
Each word is mapped to a known ASL sign or fingerspelled letter-by-letter.
"""
import re

# Common ASL signs dictionary — maps English words to gesture labels.
# In production, this would be a trained model or a full ASL dictionary lookup.
ASL_SIGNS = {
    "hello", "welcome", "thank", "thanks", "you", "please", "sorry", "help",
    "learn", "study", "teach", "teacher", "student", "class", "school",
    "today", "tomorrow", "yesterday", "now", "later", "again",
    "good", "bad", "great", "happy", "sad", "angry", "tired",
    "yes", "no", "maybe", "what", "where", "when", "who", "why", "how",
    "name", "my", "your", "we", "they", "he", "she", "it",
    "book", "read", "write", "question", "answer", "test", "quiz",
    "computer", "network", "data", "model", "train", "neural",
    "deep", "machine", "artificial", "intelligence",
    "understand", "think", "know", "remember", "forget",
    "start", "stop", "finish", "begin", "end",
    "see", "look", "watch", "listen", "speak", "talk", "sign",
    "right", "wrong", "correct", "try",
    "work", "practice", "example", "show",
    "big", "small", "more", "less", "all", "some", "none",
    "time", "day", "week", "month", "year",
    "number", "one", "two", "three", "four", "five",
    "color", "red", "blue", "green", "white", "black",
}

# Common stopwords to skip in sign language (conveyed through context/expression)
STOPWORDS = {
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
    Converts a text string into a list of gesture tokens.

    Each token is either:
      - A known ASL sign word (e.g., "HELLO", "LEARN")
      - A fingerspelled word marked as "FS:WORD" for unknown words

    Stopwords are filtered out as ASL grammar doesn't use them.

    Returns: list of gesture token strings
    """
    # Clean and tokenize
    cleaned = re.sub(r'[^\w\s]', '', text).lower()
    words = cleaned.split()

    gestures = []
    for word in words:
        if not word or word in STOPWORDS:
            continue

        if word in ASL_SIGNS:
            gestures.append(word.upper())
        else:
            # Fingerspell unknown words
            gestures.append(f"FS:{word.upper()}")

    return gestures


def get_gesture_duration(gesture):
    """
    Estimate how long a gesture takes to perform (in seconds).
    Known signs take ~0.8s, fingerspelled words take ~0.3s per letter.
    """
    if gesture.startswith("FS:"):
        word = gesture[3:]
        return max(0.5, len(word) * 0.3)
    return 0.8
