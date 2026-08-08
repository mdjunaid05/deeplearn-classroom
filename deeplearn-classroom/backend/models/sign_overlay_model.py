"""
Sign Overlay Model — Translates encoded text tokens to sequence of hand landmarks.
"""

import numpy as np
import torch
import torch.nn as nn


class SignOverlayNNModel(nn.Module):
    def __init__(self, vocab_size: int = 1000, embedding_dim: int = 64, seq_len: int = 20, output_features: int = 63):
        super().__init__()
        self.vocab_size = vocab_size
        self.embedding_dim = embedding_dim
        self.seq_len = seq_len
        self.output_features = output_features
        self.embedding = nn.Embedding(vocab_size, embedding_dim)
        self.lstm = nn.LSTM(embedding_dim, 128, batch_first=True)
        self.fc = nn.Linear(128, output_features)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        emb = self.embedding(x)
        out, _ = self.lstm(emb)
        return self.fc(out)


def build_sign_overlay_model(vocab_size: int = 1000, embedding_dim: int = 64, seq_len: int = 20, output_features: int = 63) -> SignOverlayNNModel:
    return SignOverlayNNModel(vocab_size=vocab_size, embedding_dim=embedding_dim, seq_len=seq_len, output_features=output_features)


if __name__ == "__main__":
    model = build_sign_overlay_model()
    print(f"[OK] Sign overlay model created: {type(model).__name__}")
    dummy_tokens = torch.randint(0, 500, (2, 20))
    out = model(dummy_tokens)
    print(f"[OK] Sign overlay output shape: {out.shape}")
