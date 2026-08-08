"""
Lip Reading Model — Visual Phoneme Classifier
Predicts phoneme / text token from visual mouth region features.
"""

import numpy as np
import torch
import torch.nn as nn


class LipReadingNNModel(nn.Module):
    """
    Bidirectional LSTM Neural Network for Visual Phoneme Classification.
    """
    def __init__(self, sequence_length: int = 15, feature_dim: int = 40, num_classes: int = 50):
        super().__init__()
        self.sequence_length = sequence_length
        self.feature_dim = feature_dim
        self.num_classes = num_classes
        self.lstm = nn.LSTM(feature_dim, 64, batch_first=True, bidirectional=True)
        self.fc = nn.Linear(128, num_classes)
        self.softmax = nn.Softmax(dim=-1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        lstm_out, _ = self.lstm(x)
        logits = self.fc(lstm_out[:, -1, :])
        return self.softmax(logits)


def build_lip_reading_model(sequence_length: int = 15, feature_dim: int = 40, num_classes: int = 50) -> LipReadingNNModel:
    """
    Builds and returns the Lip Reading Visual Phoneme Classifier model.
    """
    return LipReadingNNModel(sequence_length, feature_dim, num_classes)


if __name__ == "__main__":
    model = build_lip_reading_model()
    print(f"[OK] Lip reading model created: {type(model).__name__}")
    dummy_input = torch.randn(2, 15, 40)
    output = model(dummy_input)
    print(f"[OK] Test inference shape: {output.shape}")
