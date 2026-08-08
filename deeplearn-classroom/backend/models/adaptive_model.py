"""
Adaptive Learning Model — Feedforward Neural Network
Predicts recommended difficulty level: Easy / Medium / Hard
Input features (5): quiz_score, time_taken, attempt_count, completion_rate, prev_score
"""

import numpy as np
import torch
import torch.nn as nn


class AdaptiveNNModel(nn.Module):
    def __init__(self, input_dim: int = 5, num_classes: int = 3):
        super().__init__()
        self.input_dim = input_dim
        self.num_classes = num_classes
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, num_classes),
            nn.Softmax(dim=-1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def build_adaptive_model(input_dim: int = 5, num_classes: int = 3) -> AdaptiveNNModel:
    return AdaptiveNNModel(input_dim=input_dim, num_classes=num_classes)


if __name__ == "__main__":
    model = build_adaptive_model()
    print(f"[OK] Adaptive model created: {type(model).__name__}")
    dummy_input = torch.randn(2, 5)
    out = model(dummy_input)
    print(f"[OK] Adaptive output shape: {out.shape}")
