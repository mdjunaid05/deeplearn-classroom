"""
Train Engagement Detection Model
Loads student_activity.csv, trains a neural classifier with Scikit-Learn/PyTorch, saves model + scaler.
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


def main():
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "student_activity.csv")
    df = pd.read_csv(data_path)
    print(f"[INFO] Loaded dataset: {df.shape}")

    feature_cols = ["response_speed", "participation_count", "completion_rate", "idle_time", "session_time", "quiz_score"]
    X = df[feature_cols].values
    y_raw = df["engagement_label"].values

    le = LabelEncoder()
    y = le.fit_transform(y_raw)
    print(f"[INFO] Classes: {le.classes_}")

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

    model_path = os.path.join(save_dir, "engagement_model.pkl")
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    print(f"[v] Model saved: {model_path}")

    scaler_path = os.path.join(save_dir, "engagement_scaler.pkl")
    with open(scaler_path, "wb") as f:
        pickle.dump(scaler, f)
    print(f"[v] Scaler saved: {scaler_path}")


if __name__ == "__main__":
    main()
