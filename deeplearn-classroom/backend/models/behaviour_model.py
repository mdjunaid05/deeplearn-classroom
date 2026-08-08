"""
Behaviour Analysis Model — Multi-output Neural Network
Predicts Focus Score (regression) and Attention State (classification)
"""

import numpy as np
import torch
import torch.nn as nn


class BehaviourNNModel(nn.Module):
    def __init__(self, input_dim: int = 8):
        super().__init__()
        self.input_dim = input_dim
        self.shared = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
        )
        self.focus_head = nn.Linear(32, 1)
        self.state_head = nn.Sequential(
            nn.Linear(32, 3),
            nn.Softmax(dim=-1),
        )

    def forward(self, x: torch.Tensor):
        feat = self.shared(x)
        focus = self.focus_head(feat)
        state = self.state_head(feat)
        return focus, state


def build_behaviour_model(input_dim: int = 8) -> BehaviourNNModel:
    return BehaviourNNModel(input_dim=input_dim)


if __name__ == "__main__":
    model = build_behaviour_model()
    print(f"[OK] Behaviour model created: {type(model).__name__}")
    dummy_input = torch.randn(2, 8)
    f, s = model(dummy_input)
    print(f"[OK] Focus shape: {f.shape}, State shape: {s.shape}")
