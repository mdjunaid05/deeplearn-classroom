"""
Caption Generator Utils
Formats captions and chunks text for live display.
"""

def format_caption(text, time):
    """
    Format a caption with a timestamp.
    """
    m = int(time // 60)
    s = int(time % 60)
    formatted_time = f"{m:02d}:{s:02d}"
    return f"[{formatted_time}] {text}"

def chunk_text(text, max_length=50):
    """
    Chunk text into smaller segments suitable for live caption display.
    """
    words = text.split()
    chunks = []
    current_chunk = []
    current_length = 0

    for word in words:
        if current_length + len(word) + 1 > max_length and current_chunk:
            chunks.append(" ".join(current_chunk))
            current_chunk = [word]
            current_length = len(word)
        else:
            current_chunk.append(word)
            current_length += len(word) + 1

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks
