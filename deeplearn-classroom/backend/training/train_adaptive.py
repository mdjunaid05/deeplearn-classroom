"""
Train Adaptive Learning Model
Loads student_activity.csv, trains a feedforward DNN, saves model + scaler.
"""

import os
import sys
import pickle
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from tensorflow.keras.utils import to_categorical

# Add parent dir to path so we can import models
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models.adaptive_model import build_adaptive_model


def main():
    # ── 1. Load dataset ──
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "student_activity.csv")
    df = pd.read_csv(data_path)
    print(f"[INFO] Loaded dataset: {df.shape}")

    # ── 2. Select features & label ──
    feature_cols = ["quiz_score", "time_taken", "attempt_count",
                    "completion_rate", "prev_score"]
    X = df[feature_cols].values
    y_raw = df["difficulty_label"].values

    # ── 3. Encode labels ──
    le = LabelEncoder()
    y_int = le.fit_transform(y_raw)  # Easy=0, Hard=1, Medium=2
    y = to_categorical(y_int, num_classes=3)

    print(f"[INFO] Classes: {le.classes_}")

    # ── 4. Scale features ──
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # ── 5. Train/test split ──
    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, random_state=42, stratify=y_int
    )

    # ── 6. Build & train model ──
    model = build_adaptive_model(input_dim=X_train.shape[1], num_classes=3)
    model.summary()

    history = model.fit(
        X_train, y_train,
        epochs=50,
        batch_size=16,
        validation_split=0.2,
        verbose=1,
    )

    # ── 7. Evaluate ──
    loss, accuracy = model.evaluate(X_test, y_test, verbose=0)
    print(f"\n[✓] Test Accuracy: {accuracy:.4f}")
    print(f"[✓] Test Loss:     {loss:.4f}")

    # ── 8. Save model & scaler ──
    save_dir = os.path.join(os.path.dirname(__file__), "..", "saved_models")
    os.makedirs(save_dir, exist_ok=True)

    model_path = os.path.join(save_dir, "adaptive_model.h5")
    model.save(model_path)
    print(f"[✓] Model saved: {model_path}")

    scaler_path = os.path.join(save_dir, "adaptive_scaler.pkl")
    with open(scaler_path, "wb") as f:
        pickle.dump(scaler, f)
    print(f"[✓] Scaler saved: {scaler_path}")

    # Save label encoder too
    le_path = os.path.join(save_dir, "adaptive_label_encoder.pkl")
    with open(le_path, "wb") as f:
        pickle.dump(le, f)
    print(f"[✓] Label encoder saved: {le_path}")


if __name__ == "__main__":
    main()
