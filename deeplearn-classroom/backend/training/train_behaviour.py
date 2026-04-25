"""
Train Behaviour Classification Model (LSTM)
Loads student_activity.csv, creates sequences, trains LSTM, saves model + scaler.
"""

import os
import sys
import pickle
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from tensorflow.keras.utils import to_categorical

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models.behaviour_model import build_behaviour_model


SEQUENCE_LENGTH = 10
FEATURE_COLS = ["clicks", "response_speed", "chat_count", "idle_time"]


def create_sequences(df, seq_len=10):
    """
    Create sequences from the flat CSV for LSTM training.
    Each student's rows are grouped and sliced into windows of `seq_len`.
    If a student has fewer rows than seq_len, their data is padded.
    """
    sequences = []
    labels = []

    for student_id, group in df.groupby("student_id"):
        group = group.sort_values("activity_id").reset_index(drop=True)
        features = group[FEATURE_COLS].values
        behaviour = group["behaviour_label"].values

        if len(group) >= seq_len:
            for i in range(len(group) - seq_len + 1):
                sequences.append(features[i:i + seq_len])
                labels.append(behaviour[i + seq_len - 1])
        else:
            # Pad with zeros at the start
            padded = np.zeros((seq_len, len(FEATURE_COLS)))
            padded[seq_len - len(features):] = features
            sequences.append(padded)
            labels.append(behaviour[-1])

    return np.array(sequences), np.array(labels)


def main():
    # ── 1. Load dataset ──
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "student_activity.csv")
    df = pd.read_csv(data_path)
    print(f"[INFO] Loaded dataset: {df.shape}")

    # ── 2. Create sequences ──
    X_seq, y_raw = create_sequences(df, seq_len=SEQUENCE_LENGTH)
    print(f"[INFO] Sequences: {X_seq.shape}, Labels: {y_raw.shape}")

    # ── 3. Scale features (flatten → scale → reshape) ──
    n_samples, seq_len, n_features = X_seq.shape
    X_flat = X_seq.reshape(-1, n_features)

    scaler = StandardScaler()
    X_scaled_flat = scaler.fit_transform(X_flat)
    X_scaled = X_scaled_flat.reshape(n_samples, seq_len, n_features)

    # ── 4. Encode labels ──
    le = LabelEncoder()
    y_int = le.fit_transform(y_raw)
    y = to_categorical(y_int, num_classes=3)
    print(f"[INFO] Classes: {le.classes_}")

    # ── 5. Train/test split ──
    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, random_state=42
    )

    # ── 6. Build & train model ──
    model = build_behaviour_model(
        sequence_length=SEQUENCE_LENGTH,
        n_features=n_features,
        num_classes=3,
    )
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

    model_path = os.path.join(save_dir, "behaviour_model.h5")
    model.save(model_path)
    print(f"[✓] Model saved: {model_path}")

    scaler_path = os.path.join(save_dir, "behaviour_scaler.pkl")
    with open(scaler_path, "wb") as f:
        pickle.dump(scaler, f)
    print(f"[✓] Scaler saved: {scaler_path}")

    le_path = os.path.join(save_dir, "behaviour_label_encoder.pkl")
    with open(le_path, "wb") as f:
        pickle.dump(le, f)
    print(f"[✓] Label encoder saved: {le_path}")


if __name__ == "__main__":
    main()
