"""
Avatar Renderer Utility
Renders hand skeletons onto frames using OpenCV.
"""
import cv2
import numpy as np

def render_avatar_on_frame(frame, gesture_word):
    """
    Draws a simulated 200x200 avatar overlay in the bottom-right corner.
    """
    h, w, _ = frame.shape
    overlay_size = 200
    
    # Coordinates for bottom right
    x1 = w - overlay_size - 20
    y1 = h - overlay_size - 20
    x2 = x1 + overlay_size
    y2 = y1 + overlay_size

    # Ensure bounds
    if x1 < 0 or y1 < 0:
        return frame

    # Create a dark semi-transparent box
    overlay = frame.copy()
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (20, 20, 20), -1)
    
    # Draw a simulated skeleton
    center_x, center_y = x1 + 100, y1 + 100
    cv2.circle(overlay, (center_x, center_y - 30), 20, (0, 255, 0), 2) # Head
    cv2.line(overlay, (center_x, center_y - 10), (center_x, center_y + 40), (0, 255, 0), 2) # Body
    cv2.line(overlay, (center_x, center_y), (center_x - 30, center_y - 20), (0, 255, 0), 2) # L Arm
    cv2.line(overlay, (center_x, center_y), (center_x + 30, center_y - 20), (0, 255, 0), 2) # R Arm

    # Draw gesture text
    cv2.putText(overlay, gesture_word.upper(), (x1 + 10, y2 - 10), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

    # Blend
    alpha = 0.8
    frame = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)
    
    return frame
