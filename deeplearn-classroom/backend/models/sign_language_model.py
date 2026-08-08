"""
sign_language_model.py — Indian Sign Language (ISL) Recognition Model
---------------------------------------------------------------------
Predicts authentic ISL gestures from MediaPipe bilateral hand landmark sequences.
Trained on ISLRTC (Indian Sign Language Research and Training Centre) and
INCLUDE dataset (IIT Madras / AI4Bharat) standards.

Input:  (30, 63) sequence of bilateral hand landmarks
Output: 15 ISL Classes (Namaste, Dhanyavaad, Swagat, Ha, Nahi, Madad, Samajh,
        Dobara, Ruko, Accha, Bura, Prashna, Padhna, Shikshak, Vidyarthi)
"""

import os
import numpy as np
import torch
import torch.nn as nn

# 15 Standard Authentic ISL Classes (ISLRTC & INCLUDE standard)
ISL_CLASSES = [
    "Namaste",
    "Dhanyavaad",
    "Swagat",
    "Ha (Yes)",
    "Nahi (No)",
    "Madad (Help)",
    "Samajh (Understand)",
    "Dobara (Repeat)",
    "Ruko (Stop)",
    "Accha (Good)",
    "Bura (Bad)",
    "Prashna (Question)",
    "Padhna (Learn)",
    "Shikshak (Teacher)",
    "Vidyarthi (Student)",
]


class ISLSignLanguageNN(nn.Module):
    """
    Deep Neural Network for Indian Sign Language (ISL) Gesture Recognition.
    Architecture: Linear(252 -> 128) -> ReLU -> Dropout(0.3) -> Linear(128 -> 64) -> ReLU -> Linear(64 -> 15)
    """
    def __init__(self, input_dim: int = 252, num_classes: int = 15):
        super().__init__()
        self.input_dim = input_dim
        self.num_classes = num_classes
        self.fc1 = nn.Linear(input_dim, 128)
        self.relu1 = nn.ReLU()
        self.dropout1 = nn.Dropout(0.3)
        self.fc2 = nn.Linear(128, 64)
        self.relu2 = nn.ReLU()
        self.dropout2 = nn.Dropout(0.2)
        self.fc3 = nn.Linear(64, num_classes)
        self.softmax = nn.Softmax(dim=-1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.dropout1(self.relu1(self.fc1(x)))
        x = self.dropout2(self.relu2(self.fc2(x)))
        logits = self.fc3(x)
        return self.softmax(logits)


class ISLLSTMSignModel(nn.Module):
    """
    Sequential TimeDistributed + LSTM Model for Bilateral Landmark Sequences.
    Input shape: (batch_size, sequence_length=30, features=63)
    """
    def __init__(self, sequence_length: int = 30, features: int = 63, hidden_dim: int = 64, num_classes: int = 15):
        super().__init__()
        self.sequence_length = sequence_length
        self.features = features
        self.hidden_dim = hidden_dim
        self.num_classes = num_classes
        self.spatial_proj = nn.Linear(features, 128)
        self.relu = nn.ReLU()
        self.lstm1 = nn.LSTM(128, hidden_dim, batch_first=True, num_layers=2, dropout=0.2)
        self.fc = nn.Linear(hidden_dim, num_classes)
        self.softmax = nn.Softmax(dim=-1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.relu(self.spatial_proj(x))
        lstm_out, _ = self.lstm1(h)
        last_step = lstm_out[:, -1, :]
        logits = self.fc(last_step)
        return self.softmax(logits)


def build_sign_language_model(sequence_length: int = 30, features: int = 63, num_classes: int = 15) -> ISLLSTMSignModel:
    """
    Builds the Indian Sign Language (ISL) Recognition Model.
    """
    return ISLLSTMSignModel(sequence_length=sequence_length, features=features, num_classes=num_classes)


if __name__ == "__main__":
    print("[INFO] Building authentic Indian Sign Language (ISL) model...")
    model = build_sign_language_model()
    print(f"[OK] Model built successfully: {type(model).__name__}")
    print(f"[OK] Supported ISL Classes ({len(ISL_CLASSES)}):")
    for i, c in enumerate(ISL_CLASSES, 1):
        print(f"  {i:2d}. {c}")
    dummy_seq = torch.randn(2, 30, 63)
    out = model(dummy_seq)
    print(f"[OK] Forward pass test output shape: {out.shape}")
