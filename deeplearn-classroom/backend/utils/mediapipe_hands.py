"""
MediaPipe Hands Utils
Extracts landmarks and preprocesses images for ISL recognition.
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


def preprocess_image_for_isl(image_data, img_size=128):
    """
    Preprocess an image for ISL alphabet recognition.
    
    Args:
        image_data: Raw image bytes, base64 string, or numpy array
        img_size: Target size (square)
    
    Returns:
        numpy array of shape (img_size, img_size, 1), normalized [0, 1]
    """
    from PIL import Image
    import io
    import base64

    if isinstance(image_data, str):
        # Base64 string
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        img_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(img_bytes))
    elif isinstance(image_data, bytes):
        img = Image.open(io.BytesIO(image_data))
    elif isinstance(image_data, np.ndarray):
        if image_data.ndim == 2:
            arr = image_data.astype(np.float32)
            if arr.max() > 1.0:
                arr = arr / 255.0
            from PIL import Image as PILImage
            img = PILImage.fromarray((arr * 255).astype(np.uint8), 'L')
        else:
            from PIL import Image as PILImage
            img = PILImage.fromarray(image_data)
    else:
        raise ValueError(f"Unsupported image_data type: {type(image_data)}")

    # Convert to grayscale and resize
    img = img.convert('L')
    img = img.resize((img_size, img_size), Image.BILINEAR)

    arr = np.array(img, dtype=np.float32) / 255.0
    return arr.reshape(img_size, img_size, 1)


def extract_video_frames(video_data, max_frames=8, img_size=128):
    """
    Extract evenly-spaced frames from video data for ISL word recognition.
    
    Args:
        video_data: Path to video file or raw video bytes
        max_frames: Number of frames to extract
        img_size: Target frame size (square)
    
    Returns:
        numpy array of shape (max_frames, img_size, img_size, 3), normalized [0, 1]
    """
    import cv2
    import tempfile
    import os

    # If bytes, write to temp file
    if isinstance(video_data, bytes):
        tmp = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
        tmp.write(video_data)
        tmp.close()
        video_path = tmp.name
        cleanup = True
    else:
        video_path = str(video_data)
        cleanup = False

    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return np.zeros((max_frames, img_size, img_size, 3), dtype=np.float32)

        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total <= 0:
            cap.release()
            return np.zeros((max_frames, img_size, img_size, 3), dtype=np.float32)

        indices = np.linspace(0, total - 1, max_frames, dtype=int).tolist() if total > max_frames else list(range(total))

        frames = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if ret and frame is not None:
                frame = cv2.resize(frame, (img_size, img_size))
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append(frame.astype(np.float32) / 255.0)

        cap.release()

        # Pad if needed
        while len(frames) < max_frames:
            if frames:
                frames.append(frames[-1].copy())
            else:
                frames.append(np.zeros((img_size, img_size, 3), dtype=np.float32))

        return np.array(frames[:max_frames])
    finally:
        if cleanup:
            os.unlink(video_path)
