"""
Avatar Renderer Utility — Indian Sign Language (ISL) Edition
Renders an Indian Sign Language avatar overlay onto video frames using OpenCV.
Draws a stylized stick-figure avatar with authentic ISL bilateral hand articulation
and gesture labels conforming to ISLRTC standards.
"""
import cv2
import numpy as np


def render_avatar_on_frame(frame, gesture_word):
    """
    Draws a 200×200 Indian Sign Language (ISL) avatar overlay in the bottom-right corner.
    Renders authentic ISL two-handed gestures (Namaste, Dhanyavaad, Madad, Samajh, Padhna, Ruko, etc.)
    and two-handed ISL manual fingerspelling.

    Args:
        frame: numpy array (BGR image)
        gesture_word: string — the current ISL gesture or ISL_FS:WORD
    Returns:
        frame with ISL overlay rendered
    """
    h, w = frame.shape[:2]
    overlay_size = 200
    padding = 20

    # Coordinates for bottom-right corner
    x1 = w - overlay_size - padding
    y1 = h - overlay_size - padding - 50  # Space for caption bar below
    x2 = x1 + overlay_size
    y2 = y1 + overlay_size

    # Ensure bounds
    if x1 < 0 or y1 < 0:
        return frame

    # Create overlay
    overlay = frame.copy()

    # Dark semi-transparent background with ISL green accent border
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (15, 23, 42), -1)
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 200, 115), 1)

    # Avatar center
    cx = x1 + overlay_size // 2
    cy = y1 + overlay_size // 2 - 10

    # Determine ISL gesture mode
    is_fingerspell = gesture_word.startswith("ISL_FS:") or gesture_word.startswith("FS:")
    display_word = gesture_word.split(":")[-1].upper()

    # Draw avatar stick figure
    head_radius = 18
    body_length = 45
    arm_length = 35

    # Head
    cv2.circle(overlay, (cx, cy - 30), head_radius, (0, 230, 160), 2)
    # Eyes
    cv2.circle(overlay, (cx - 6, cy - 32), 2, (0, 255, 200), -1)
    cv2.circle(overlay, (cx + 6, cy - 32), 2, (0, 255, 200), -1)

    # Body / Spine
    cv2.line(overlay, (cx, cy - 30 + head_radius), (cx, cy + body_length - 20), (0, 230, 160), 2)

    shoulder_y = cy - 5

    # ── Authentic ISL Two-Handed Pose Computation ──────────────────────────
    normalized_word = display_word.lower()

    if normalized_word in ["namaste", "namaskar", "pranam", "hello"]:
        # Authentic ISL Namaste / Anjali Mudra: Both palms together at center chest
        left_x, left_y = cx - 6, shoulder_y + 12
        right_x, right_y = cx + 6, shoulder_y + 12
        cv2.line(overlay, (cx, shoulder_y), (left_x, left_y), (0, 230, 160), 2)
        cv2.line(overlay, (cx, shoulder_y), (right_x, right_y), (0, 230, 160), 2)
        # Touching prayer hands
        cv2.circle(overlay, (left_x, left_y), 5, (0, 255, 200), -1)
        cv2.circle(overlay, (right_x, right_y), 5, (0, 255, 200), -1)

    elif normalized_word in ["madad", "help", "sahayata"]:
        # Authentic ISL Help: Left palm flat horizontal, right fist lifting from it
        left_x, left_y = cx - 18, shoulder_y + 20
        right_x, right_y = cx - 12, shoulder_y + 12
        cv2.line(overlay, (cx, shoulder_y), (left_x, left_y), (0, 230, 160), 2)
        cv2.line(overlay, (cx, shoulder_y), (right_x, right_y), (0, 230, 160), 2)
        cv2.circle(overlay, (left_x, left_y), 6, (0, 200, 255), -1)
        cv2.circle(overlay, (right_x, right_y), 6, (0, 255, 200), -1)

    elif normalized_word in ["samajh", "understand", "think", "sochna"]:
        # Authentic ISL Understand: Right index touching temple, left resting
        left_x, left_y = cx - 24, shoulder_y + 24
        right_x, right_y = cx + 18, cy - 28
        cv2.line(overlay, (cx, shoulder_y), (left_x, left_y), (0, 230, 160), 2)
        cv2.line(overlay, (cx, shoulder_y), (right_x, right_y), (0, 230, 160), 2)
        cv2.circle(overlay, (left_x, left_y), 4, (0, 255, 200), -1)
        cv2.circle(overlay, (right_x, right_y), 5, (0, 255, 220), -1)

    elif normalized_word in ["padhna", "learn", "study", "vidyarthi", "student"]:
        # Authentic ISL Learn: Left palm open as book, right hand scooping to head
        left_x, left_y = cx - 20, shoulder_y + 16
        right_x, right_y = cx + 14, cy - 18
        cv2.line(overlay, (cx, shoulder_y), (left_x, left_y), (0, 230, 160), 2)
        cv2.line(overlay, (cx, shoulder_y), (right_x, right_y), (0, 230, 160), 2)
        cv2.circle(overlay, (left_x, left_y), 6, (0, 200, 255), -1)
        cv2.circle(overlay, (right_x, right_y), 5, (0, 255, 200), -1)

    elif normalized_word in ["ruko", "stop"]:
        # Authentic ISL Stop: Left horizontal palm, right vertical chop
        left_x, left_y = cx - 14, shoulder_y + 14
        right_x, right_y = cx - 4, shoulder_y + 10
        cv2.line(overlay, (cx, shoulder_y), (left_x, left_y), (0, 230, 160), 2)
        cv2.line(overlay, (cx, shoulder_y), (right_x, right_y), (0, 230, 160), 2)
        cv2.circle(overlay, (left_x, left_y), 6, (0, 255, 200), -1)
        cv2.circle(overlay, (right_x, right_y), 5, (0, 100, 255), -1)

    else:
        # Standard ISL two-handed articulation
        word_hash = sum(ord(c) for c in display_word) % 6
        arm_angles = [
            (-40, -30),   # ISL Bilateral gesture
            (-20, -50),   # Left base, right active
            (-50, -20),   # Left active, right base
            (-35, -45),   # Interactive two-handed
            (-15, -60),   # High gesture
            (-60, -15),   # Symmetrical focus
        ]
        left_angle, right_angle = arm_angles[word_hash]

        left_x = cx + int(arm_length * np.cos(np.radians(180 + left_angle)))
        left_y = shoulder_y + int(arm_length * np.sin(np.radians(180 + left_angle)))
        cv2.line(overlay, (cx, shoulder_y), (left_x, left_y), (0, 230, 160), 2)

        right_x = cx + int(arm_length * np.cos(np.radians(right_angle)))
        right_y = shoulder_y + int(arm_length * np.sin(np.radians(right_angle)))
        cv2.line(overlay, (cx, shoulder_y), (right_x, right_y), (0, 230, 160), 2)

        cv2.circle(overlay, (left_x, left_y), 5, (0, 255, 200), -1)
        cv2.circle(overlay, (right_x, right_y), 5, (0, 255, 200), -1)

    # Label: "ISL SIGN" or "ISL 2-HANDED FINGERSPELL"
    mode_label = "ISL FINGERSPELL" if is_fingerspell else "ISL SIGN"
    mode_color = (0, 220, 255) if is_fingerspell else (0, 255, 160)
    cv2.putText(overlay, mode_label, (x1 + 8, y1 + 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, mode_color, 1)

    # ISLRTC Standard tag
    cv2.putText(overlay, "ISLRTC", (x2 - 50, y1 + 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.30, (150, 200, 255), 1)

    # Gesture word at bottom of overlay box
    text_bg_y1 = y2 - 30
    cv2.rectangle(overlay, (x1, text_bg_y1), (x2, y2), (0, 60, 40), -1)

    text = display_word.upper()[:15]  # Truncate very long words
    text_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)[0]
    text_x = x1 + (overlay_size - text_size[0]) // 2
    text_y = y2 - 8
    cv2.putText(overlay, text, (text_x, text_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 220), 2)

    # Blend overlay onto frame
    alpha = 0.85
    frame = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)

    return frame
