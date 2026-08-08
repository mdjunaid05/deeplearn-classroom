"""
Engagement Model — Multiclass Neural Classifier
Predicts High / Medium / Low engagement level.
"""

import numpy as np
import torch
import torch.nn as nn


class EngagementNNModel(nn.Module):
    def __init__(self, input_dim: int = 6, num_classes: int = 3):
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


def build_engagement_model(input_dim: int = 6, num_classes: int = 3) -> EngagementNNModel:
    return EngagementNNModel(input_dim=input_dim, num_classes=num_classes)


if __name__ == "__main__":
    model = build_engagement_model()
    print(f"[OK] Engagement model created: {type(model).__name__}")
    dummy_input = torch.randn(2, 6)
    out = model(dummy_input)
    print(f"[OK] Engagement output shape: {out.shape}")
