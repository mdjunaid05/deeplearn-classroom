"""
Avatar Renderer Utility
Renders a sign language avatar overlay onto video frames using OpenCV.
Draws a stylized stick-figure avatar with gesture text in the bottom-right corner.
"""
import cv2
import numpy as np


def render_avatar_on_frame(frame, gesture_word):
    """
    Draws a 200×200 sign language avatar overlay in the bottom-right corner.
    The avatar shows a stick figure with animated pose hints and the current
    gesture word displayed below.

    Args:
        frame: numpy array (BGR image)
        gesture_word: string — the current ASL gesture or FS:WORD
    Returns:
        frame with overlay rendered
    """
    h, w = frame.shape[:2]
    overlay_size = 200
    padding = 20

    # Coordinates for bottom-right corner
    x1 = w - overlay_size - padding
    y1 = h - overlay_size - padding - 50  # Extra space for caption bar below
    x2 = x1 + overlay_size
    y2 = y1 + overlay_size

    # Ensure bounds
    if x1 < 0 or y1 < 0:
        return frame

    # Create overlay
    overlay = frame.copy()

    # Dark semi-transparent background with rounded appearance
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (15, 15, 25), -1)
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 200, 0), 1)

    # Avatar center
    cx = x1 + overlay_size // 2
    cy = y1 + overlay_size // 2 - 10

    # Determine pose based on gesture
    is_fingerspell = gesture_word.startswith("FS:")
    display_word = gesture_word[3:] if is_fingerspell else gesture_word

    # Draw avatar stick figure
    head_radius = 18
    body_length = 45
    arm_length = 35

    # Head
    cv2.circle(overlay, (cx, cy - 30), head_radius, (0, 230, 120), 2)

    # Body
    cv2.line(overlay, (cx, cy - 30 + head_radius), (cx, cy + body_length - 20), (0, 230, 120), 2)

    # Arms — vary angle slightly based on word hash for visual variation
    word_hash = sum(ord(c) for c in display_word) % 6
    arm_angles = [
        (-40, -30),   # Both up
        (-20, -50),   # Left down, right up
        (-50, -20),   # Left up, right down
        (-35, -45),   # Slight variation
        (-10, -60),   # One way
        (-60, -10),   # Other way
    ]
    left_angle, right_angle = arm_angles[word_hash]

    shoulder_y = cy - 5
    # Left arm
    left_x = cx + int(arm_length * np.cos(np.radians(180 + left_angle)))
    left_y = shoulder_y + int(arm_length * np.sin(np.radians(180 + left_angle)))
    cv2.line(overlay, (cx, shoulder_y), (left_x, left_y), (0, 230, 120), 2)

    # Right arm
    right_x = cx + int(arm_length * np.cos(np.radians(right_angle)))
    right_y = shoulder_y + int(arm_length * np.sin(np.radians(right_angle)))
    cv2.line(overlay, (cx, shoulder_y), (right_x, right_y), (0, 230, 120), 2)

    # Hands (circles at arm ends)
    cv2.circle(overlay, (left_x, left_y), 5, (0, 255, 200), -1)
    cv2.circle(overlay, (right_x, right_y), 5, (0, 255, 200), -1)

    # Label: "ASL" or "FS" mode indicator
    mode_label = "FINGERSPELL" if is_fingerspell else "ASL SIGN"
    mode_color = (0, 200, 255) if is_fingerspell else (0, 255, 150)
    cv2.putText(overlay, mode_label, (x1 + 8, y1 + 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, mode_color, 1)

    # Gesture word at bottom of overlay box
    text_bg_y1 = y2 - 30
    cv2.rectangle(overlay, (x1, text_bg_y1), (x2, y2), (0, 100, 60), -1)

    text = display_word.upper()[:15]  # Truncate very long words
    text_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)[0]
    text_x = x1 + (overlay_size - text_size[0]) // 2
    text_y = y2 - 8
    cv2.putText(overlay, text, (text_x, text_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)

    # Blend overlay onto frame
    alpha = 0.85
    frame = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)

    return frame
