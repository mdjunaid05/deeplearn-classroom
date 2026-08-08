"""
train_sign_language.py — Indian Sign Language (ISL) Model Training
Trains the ISL Neural Classifier on 15 authentic ISL gesture classes based on the
ISLRTC (Indian Sign Language Research and Training Centre) and INCLUDE dataset lexicons.
"""

import os
import sys

# Delegate directly to authentic ISL training pipeline
sys.path.insert(0, os.path.dirname(__file__))
from train_isl_model import main as train_isl_main

if __name__ == "__main__":
    train_isl_main()
