"""
Train Behaviour Classification Model
Loads student_activity.csv, creates sequences, trains classifier, saves model + scaler.
"""

import os
import sys
import pickle
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.neural_network import MLPClassifier

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SEQUENCE_LENGTH = 10
FEATURE_COLS = ["clicks", "response_speed", "chat_count", "idle_time"]


def create_sequences(df, seq_len=10):
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
            padded = np.zeros((seq_len, len(FEATURE_COLS)))
            padded[seq_len - len(features):] = features
            sequences.append(padded)
            labels.append(behaviour[-1])

    return np.array(sequences), np.array(labels)


def main():
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "student_activity.csv")
    df = pd.read_csv(data_path)
    print(f"[INFO] Loaded dataset: {df.shape}")

    X_seq, y_raw = create_sequences(df, seq_len=SEQUENCE_LENGTH)
    # Extract mean and variance across the sequence window
    X = np.hstack([np.mean(X_seq, axis=1), np.std(X_seq, axis=1)])

    le = LabelEncoder()
    y = le.fit_transform(y_raw)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, random_state=42, stratify=y
    )

    model = MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=50, random_state=42)
    model.fit(X_train, y_train)

    train_acc = model.score(X_train, y_train)
    test_acc = model.score(X_test, y_test)
    print(f"[OK] Train Acc: {train_acc*100:.2f}%, Test Acc: {test_acc*100:.2f}%")

    save_dir = os.path.join(os.path.dirname(__file__), "..", "saved_models")
    os.makedirs(save_dir, exist_ok=True)

    model_path = os.path.join(save_dir, "behaviour_model.pkl")
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    print(f"[v] Model saved: {model_path}")

    scaler_path = os.path.join(save_dir, "behaviour_scaler.pkl")
    with open(scaler_path, "wb") as f:
        pickle.dump(scaler, f)
    print(f"[v] Scaler saved: {scaler_path}")


if __name__ == "__main__":
    main()
