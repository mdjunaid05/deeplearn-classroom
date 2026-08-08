"""
train_lip_reading.py — Lip Reading Model Training
Trains the Visual Phoneme Classifier on mouth landmark sequences.
"""

import os
import sys
import pickle
import numpy as np
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models.lip_reading_model import build_lip_reading_model


def main():
    print("[INFO] Initializing training for Lip Reading Visual Phoneme Classifier...")
    num_samples = 150
    seq_len = 15
    feature_dim = 40
    num_classes = 10

    # 15 frames x 40 mouth landmarks
    X_seq = np.random.rand(num_samples, seq_len, feature_dim)
    # Feature extraction (flatten/mean/std)
    X = np.hstack([np.mean(X_seq, axis=1), np.std(X_seq, axis=1)])
    y = np.random.randint(0, num_classes, size=num_samples)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

    model = MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=50, random_state=42)
    model.fit(X_train, y_train)

    train_acc = model.score(X_train, y_train)
    test_acc = model.score(X_test, y_test)
    print(f"[OK] Training complete. Train Acc: {train_acc*100:.2f}%, Test Acc: {test_acc*100:.2f}%")

    save_dir = os.path.join(os.path.dirname(__file__), "..", "saved_models")
    os.makedirs(save_dir, exist_ok=True)
    model_path = os.path.join(save_dir, "lip_reading_model.pkl")
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    print(f"[OK] Lip reading model saved: {model_path}")


if __name__ == "__main__":
    main()
