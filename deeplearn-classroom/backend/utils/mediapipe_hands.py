"""
MediaPipe Hands Utils & ISL Landmark Recognition Engine
-------------------------------------------------------
Extracts real 21 3D hand landmarks via MediaPipe, detects hands,
computes geometric finger states and spatial-temporal features,
and integrates with ISL CNN and Neural Classifier models.
"""

import os
import io
import math
import base64
import numpy as np
from PIL import Image

# MediaPipe & OpenCV
try:
    import cv2
    import mediapipe as mp
    HAS_MEDIAPIPE = True
    mp_hands = mp.solutions.hands
except ImportError:
    HAS_MEDIAPIPE = False
    mp_hands = None
    cv2 = None


_detector_instance = None


def get_hands_detector():
    """Singleton getter for MediaPipe Hands detector."""
    global _detector_instance
    if not HAS_MEDIAPIPE:
        return None
    if _detector_instance is None:
        try:
            _detector_instance = mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=2,
                min_detection_confidence=0.40,
                min_tracking_confidence=0.40,
            )
        except Exception as e:
            print(f"[WARN] Failed to initialize MediaPipe Hands: {e}")
            _detector_instance = None
    return _detector_instance


from PIL import Image, ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True

def decode_image(image_data):
    """
    Decodes image input from base64 string, bytes, or numpy array into RGB numpy array.
    """
    try:
        if isinstance(image_data, str):
            if ',' in image_data:
                image_data = image_data.split(',')[1]
            img_bytes = base64.b64decode(image_data)
            pil_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
            return np.array(pil_img)
        elif isinstance(image_data, bytes):
            pil_img = Image.open(io.BytesIO(image_data)).convert('RGB')
            return np.array(pil_img)
        elif isinstance(image_data, np.ndarray):
            if image_data.ndim == 2:
                pil_img = Image.fromarray((image_data * 255 if image_data.max() <= 1.0 else image_data).astype(np.uint8), 'L').convert('RGB')
                return np.array(pil_img)
            elif image_data.shape[2] == 4:
                return cv2.cvtColor(image_data, cv2.COLOR_RGBA2RGB) if cv2 else image_data[:, :, :3]
            return image_data
        else:
            return np.zeros((240, 320, 3), dtype=np.uint8)
    except Exception as e:
        print(f"[ISL Image Decode Error] {e}")
        return np.zeros((240, 320, 3), dtype=np.uint8)


def detect_hands_and_landmarks(image_data):
    """
    Runs MediaPipe Hands on an image frame.
    
    Returns dict:
      {
        "hands_detected": int,
        "landmarks": [ [ {"x": float, "y": float, "z": float}, ... 21 points ] ],
        "handedness": [ "Right" | "Left" ],
        "bboxes": [ [min_x, min_y, max_x, max_y] ], # normalized [0, 1]
        "rgb_image": np.ndarray (H, W, 3)
      }
    """
    rgb_img = decode_image(image_data)
    h, w = rgb_img.shape[:2]

    detector = get_hands_detector()
    if detector is None:
        return {
            "hands_detected": 0,
            "landmarks": [],
            "handedness": [],
            "bboxes": [],
            "rgb_image": rgb_img,
        }

    try:
        results = detector.process(rgb_img)
    except Exception as e:
        print(f"[ISL MediaPipe] Detection error: {e}")
        return {
            "hands_detected": 0,
            "landmarks": [],
            "handedness": [],
            "bboxes": [],
            "rgb_image": rgb_img,
        }

    if not results.multi_hand_landmarks:
        return {
            "hands_detected": 0,
            "landmarks": [],
            "handedness": [],
            "bboxes": [],
            "rgb_image": rgb_img,
        }

    landmarks_list = []
    handedness_list = []
    bboxes_list = []

    for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
        # Extract 21 landmarks
        lms = []
        xs, ys = [], []
        for lm in hand_landmarks.landmark:
            lms.append({
                "x": float(round(lm.x, 4)),
                "y": float(round(lm.y, 4)),
                "z": float(round(lm.z, 4)),
            })
            xs.append(lm.x)
            ys.append(lm.y)

        landmarks_list.append(lms)

        # Handedness label
        hand_label = "Right"
        if results.multi_handedness and idx < len(results.multi_handedness):
            try:
                hand_label = results.multi_handedness[idx].classification[0].label
            except Exception:
                pass
        handedness_list.append(hand_label)

        # Bounding box with padding
        min_x = max(0.0, min(xs) - 0.05)
        min_y = max(0.0, min(ys) - 0.05)
        max_x = min(1.0, max(xs) + 0.05)
        max_y = min(1.0, max(ys) + 0.05)
        bboxes_list.append([min_x, min_y, max_x, max_y])

    return {
        "hands_detected": len(landmarks_list),
        "landmarks": landmarks_list,
        "handedness": handedness_list,
        "bboxes": bboxes_list,
        "rgb_image": rgb_img,
    }


def _dist(p1, p2):
    """Euclidean distance between two 2D/3D points."""
    x1, y1 = p1["x"], p1["y"]
    x2, y2 = p2["x"], p2["y"]
    return math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)


def classify_hand_geometry(landmarks_list, handedness_list=None):
    """
    Classifies authentic Indian Sign Language gestures based on 21 3D hand landmarks.
    
    Landmark Indices:
      0: Wrist
      1-4: Thumb (CMC, MCP, IP, Tip)
      5-8: Index (MCP, PIP, DIP, Tip)
      9-12: Middle (MCP, PIP, DIP, Tip)
      13-16: Ring (MCP, PIP, DIP, Tip)
      17-20: Pinky (MCP, PIP, DIP, Tip)
    
    Returns:
      (prediction_label, confidence, reason) or (None, 0.0, None)
    """
    if not landmarks_list or len(landmarks_list) == 0:
        return None, 0.0, "No hands"

    # Check 2-hand gestures first
    if len(landmarks_list) >= 2:
        h1 = landmarks_list[0]
        h2 = landmarks_list[1]
        wrist1, wrist2 = h1[0], h2[0]
        wrist_dist = _dist(wrist1, wrist2)

        # 1. Namaste (Anjali Mudra / Prayer)
        # Both hands are close together, palms facing each other, all fingertips pointing up
        all_up_1 = all(h1[tip]["y"] < h1[0]["y"] for tip in [8, 12, 16, 20])
        all_up_2 = all(h2[tip]["y"] < h2[0]["y"] for tip in [8, 12, 16, 20])
        palm_close = _dist(h1[9], h2[9]) < 0.28 or _dist(h1[12], h2[12]) < 0.25

        if all_up_1 and all_up_2 and palm_close:
            return "NAMASTE", 0.96, "Bilateral prayer palms"

        # 2. Madad (Help) - Fist resting on open flat palm
        h1_is_fist = all(_dist(h1[tip], h1[0]) < _dist(h1[pip], h1[0]) * 1.15 for tip, pip in [(8,6),(12,10),(16,14),(20,18)])
        h2_is_open = all(_dist(h2[tip], h2[0]) > _dist(h2[pip], h2[0]) * 1.2 for tip, pip in [(8,6),(12,10),(16,14),(20,18)])
        if (h1_is_fist and h2_is_open) or (h2_is_fist and h1_is_open if 'h1_is_open' in locals() else False):
            return "HELP", 0.91, "Fist on flat support palm"

        # 3. Swagat (Welcome) - Both palms open sweeping upward
        h1_is_open = all(_dist(h1[tip], h1[0]) > _dist(h1[pip], h1[0]) * 1.25 for tip, pip in [(8,6),(12,10),(16,14),(20,18)])
        h2_is_open = all(_dist(h2[tip], h2[0]) > _dist(h2[pip], h2[0]) * 1.25 for tip, pip in [(8,6),(12,10),(16,14),(20,18)])
        if h1_is_open and h2_is_open and wrist_dist > 0.20:
            return "WELCOME", 0.92, "Bilateral open welcome palms"

    # Analyze primary (dominant) hand
    lms = landmarks_list[0]
    wrist = lms[0]

    # Finger extension metrics (comparing distance from wrist to tip vs PIP/MCP)
    # Tip index: 4, 8, 12, 16, 20
    # PIP index: 2, 6, 10, 14, 18
    # MCP index: 1, 5, 9, 13, 17

    index_dist_tip  = _dist(lms[8], wrist)
    index_dist_pip  = _dist(lms[6], wrist)
    index_open      = index_dist_tip > index_dist_pip * 1.22 and lms[8]["y"] < lms[6]["y"]

    middle_dist_tip = _dist(lms[12], wrist)
    middle_dist_pip = _dist(lms[10], wrist)
    middle_open     = middle_dist_tip > middle_dist_pip * 1.22 and lms[12]["y"] < lms[10]["y"]

    ring_dist_tip   = _dist(lms[16], wrist)
    ring_dist_pip   = _dist(lms[14], wrist)
    ring_open       = ring_dist_tip > ring_dist_pip * 1.22 and lms[16]["y"] < lms[14]["y"]

    pinky_dist_tip  = _dist(lms[20], wrist)
    pinky_dist_pip  = _dist(lms[18], wrist)
    pinky_open      = pinky_dist_tip > pinky_dist_pip * 1.22 and lms[20]["y"] < lms[18]["y"]

    # Thumb extension: check tip relative to IP and MCP
    thumb_dist_tip  = _dist(lms[4], wrist)
    thumb_dist_ip   = _dist(lms[3], wrist)
    thumb_open      = thumb_dist_tip > thumb_dist_ip * 1.15

    # Check vertical orientation for thumb
    thumb_up   = lms[4]["y"] < lms[3]["y"] and lms[3]["y"] < lms[2]["y"]
    thumb_down = lms[4]["y"] > lms[3]["y"] and lms[3]["y"] > lms[2]["y"]

    # Distance between thumb tip (4) and index tip (8)
    thumb_index_dist = _dist(lms[4], lms[8])

    # ── ISL Gesture Classifications ──────────────────────────────────────────

    # 1. GOOD / ACCHA / THUMBS UP
    if thumb_up and not index_open and not middle_open and not ring_open and not pinky_open:
        return "GOOD", 0.94, "Thumbs up"

    # 2. BAD / BURA / THUMBS DOWN
    if thumb_down and not index_open and not middle_open and not ring_open and not pinky_open:
        return "BAD", 0.93, "Thumbs down"

    # 3. OK SIGN: Thumb and index touching in circle, other 3 fingers open
    if thumb_index_dist < 0.065 and middle_open and ring_open and pinky_open:
        return "OK", 0.94, "Thumb-index circle"

    # 4. PEACE / VICTORY / TWO: Index & Middle open, Ring & Pinky closed
    if index_open and middle_open and not ring_open and not pinky_open:
        v_dist = _dist(lms[8], lms[12])
        if v_dist > 0.04:
            return "PEACE", 0.93, "V-sign peace"
        return "TWO", 0.90, "Two fingers"

    # 5. I LOVE YOU (ILY): Thumb, Index, Pinky open; Middle, Ring closed
    if thumb_open and index_open and not middle_open and not ring_open and pinky_open:
        return "I LOVE YOU", 0.95, "ILY gesture"

    # 6. CALL ME: Thumb and Pinky open; Index, Middle, Ring closed
    if thumb_open and not index_open and not middle_open and not ring_open and pinky_open:
        return "CALL ME", 0.92, "Shaka / Call me"

    # 7. POINT / ONE: Index finger open pointing up; others closed
    if index_open and not middle_open and not ring_open and not pinky_open and not thumb_up:
        return "ONE", 0.91, "Point / One"

    # 8. THREE: Index, Middle, Ring open; Pinky closed
    if index_open and middle_open and ring_open and not pinky_open:
        return "THREE", 0.90, "Three fingers"

    # 9. FOUR: Index, Middle, Ring, Pinky open; Thumb tucked
    if index_open and middle_open and ring_open and pinky_open and not thumb_open:
        return "FOUR", 0.92, "Four fingers"

    # 10. HELLO / STOP / FIVE / OPEN PALM: All 5 fingers open
    if index_open and middle_open and ring_open and pinky_open and thumb_open:
        # If hand is held upright in front of camera
        if lms[8]["y"] < wrist["y"] and lms[12]["y"] < wrist["y"]:
            return "HELLO", 0.93, "Open waving palm"

    # 11. YES / HA: Closed fist held upright
    all_closed = (not index_open and not middle_open and not ring_open and not pinky_open and not thumb_up and not thumb_down)
    if all_closed:
        return "YES", 0.88, "Fist affirmative"

    # 12. NO / NAHI: Index pointing up near chin / chest
    if index_open and not middle_open and not ring_open and not pinky_open:
        return "NO", 0.89, "Index wag"

    return None, 0.0, "Undetermined hand pose"


def crop_hand_image(rgb_image, bbox, target_size=128):
    """
    Crops hand region from RGB image and formats for ISL Alphabet CNN.
    """
    h, w = rgb_image.shape[:2]
    min_x, min_y, max_x, max_y = bbox

    px_min_x = max(0, int(min_x * w))
    px_min_y = max(0, int(min_y * h))
    px_max_x = min(w, int(max_x * w))
    px_max_y = min(h, int(max_y * h))

    if px_max_x <= px_min_x or px_max_y <= px_min_y:
        return np.zeros((target_size, target_size, 1), dtype=np.float32)

    crop = rgb_image[px_min_y:px_max_y, px_min_x:px_max_x]
    pil_crop = Image.fromarray(crop).convert('L')
    pil_crop = pil_crop.resize((target_size, target_size), Image.BILINEAR)

    arr = np.array(pil_crop, dtype=np.float32) / 255.0
    return arr.reshape(target_size, target_size, 1)


def preprocess_image_for_isl(image_data, img_size=128):
    """Preprocesses full image for ISL alphabet model."""
    rgb = decode_image(image_data)
    pil_img = Image.fromarray(rgb).convert('L')
    pil_img = pil_img.resize((img_size, img_size), Image.BILINEAR)
    arr = np.array(pil_img, dtype=np.float32) / 255.0
    return arr.reshape(img_size, img_size, 1)


def preprocess_frame_sequence_for_isl(frames_data, max_frames=8, img_size=128):
    """Preprocesses a sequence of frames for ISL word recognition."""
    if not isinstance(frames_data, (list, tuple)) or len(frames_data) == 0:
        return np.zeros((max_frames, img_size, img_size, 3), dtype=np.float32)

    frames = []
    for item in frames_data:
        try:
            rgb = decode_image(item)
            pil_img = Image.fromarray(rgb).resize((img_size, img_size), Image.BILINEAR)
            arr = np.array(pil_img, dtype=np.float32) / 255.0
            frames.append(arr)
        except Exception:
            continue

    if not frames:
        return np.zeros((max_frames, img_size, img_size, 3), dtype=np.float32)

    if len(frames) > max_frames:
        indices = np.linspace(0, len(frames) - 1, max_frames, dtype=int).tolist()
        frames = [frames[i] for i in indices]

    while len(frames) < max_frames:
        frames.append(frames[-1].copy())

    return np.array(frames[:max_frames], dtype=np.float32)
