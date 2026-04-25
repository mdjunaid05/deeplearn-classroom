"""
Model Evaluation Script
Loads all 3 trained models, runs predictions on test data, prints metrics,
and saves confusion matrix plots.
"""

import os
import sys
import pickle
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, confusion_matrix, ConfusionMatrixDisplay,
)
from tensorflow import keras
from tensorflow.keras.utils import to_categorical

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SAVE_DIR = os.path.join(os.path.dirname(__file__), "..", "saved_models")
DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "student_activity.csv")


def load_artifact(name):
    """Load a .h5 model and its .pkl scaler."""
    model = keras.models.load_model(os.path.join(SAVE_DIR, f"{name}.h5"))
    with open(os.path.join(SAVE_DIR, f"{name.replace('_model', '_scaler')}.pkl"), "rb") as f:
        scaler = pickle.load(f)
    with open(os.path.join(SAVE_DIR, f"{name.replace('_model', '_label_encoder')}.pkl"), "rb") as f:
        le = pickle.load(f)
    return model, scaler, le


def print_metrics(y_true, y_pred, class_names, model_name):
    """Print accuracy, precision, recall, F1 and save confusion matrix."""
    acc = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, average="weighted", zero_division=0)
    rec = recall_score(y_true, y_pred, average="weighted", zero_division=0)
    f1 = f1_score(y_true, y_pred, average="weighted", zero_division=0)

    print(f"\n{'='*50}")
    print(f"  {model_name}")
    print(f"{'='*50}")
    print(f"  Accuracy:  {acc:.4f}")
    print(f"  Precision: {prec:.4f}")
    print(f"  Recall:    {rec:.4f}")
    print(f"  F1-Score:  {f1:.4f}")

    # Confusion matrix
    cm = confusion_matrix(y_true, y_pred)
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=class_names)
    fig, ax = plt.subplots(figsize=(6, 5))
    disp.plot(ax=ax, cmap="Blues", values_format="d")
    ax.set_title(f"{model_name} — Confusion Matrix")
    plt.tight_layout()

    plot_path = os.path.join(SAVE_DIR, f"{model_name.lower().replace(' ', '_')}_confusion.png")
    fig.savefig(plot_path, dpi=150)
    plt.close(fig)
    print(f"  Confusion matrix saved: {plot_path}")


def evaluate_adaptive(df):
    model, scaler, le = load_artifact("adaptive_model")
    feature_cols = ["quiz_score", "time_taken", "attempt_count",
                    "completion_rate", "prev_score"]
    X = scaler.transform(df[feature_cols].values)
    y_true = le.transform(df["difficulty_label"].values)

    _, X_test, _, y_test = train_test_split(
        X, y_true, test_size=0.2, random_state=42, stratify=y_true
    )

    y_pred = np.argmax(model.predict(X_test, verbose=0), axis=1)
    print_metrics(y_test, y_pred, le.classes_, "Adaptive Model")


def evaluate_behaviour(df):
    model, scaler, le = load_artifact("behaviour_model")

    from train_behaviour import create_sequences, SEQUENCE_LENGTH, FEATURE_COLS
    X_seq, y_raw = create_sequences(df, seq_len=SEQUENCE_LENGTH)
    n_samples, seq_len, n_features = X_seq.shape
    X_flat = X_seq.reshape(-1, n_features)
    X_scaled = scaler.transform(X_flat).reshape(n_samples, seq_len, n_features)
    y_true = le.transform(y_raw)

    _, X_test, _, y_test = train_test_split(
        X_scaled, y_true, test_size=0.2, random_state=42
    )

    y_pred = np.argmax(model.predict(X_test, verbose=0), axis=1)
    print_metrics(y_test, y_pred, le.classes_, "Behaviour Model")


def evaluate_engagement(df):
    model, scaler, le = load_artifact("engagement_model")
    feature_cols = ["response_speed", "participation_count", "completion_rate",
                    "idle_time", "session_time", "quiz_score"]
    X = scaler.transform(df[feature_cols].values)
    y_true = le.transform(df["engagement_label"].values)

    _, X_test, _, y_test = train_test_split(
        X, y_true, test_size=0.2, random_state=42, stratify=y_true
    )

    y_pred = np.argmax(model.predict(X_test, verbose=0), axis=1)
    print_metrics(y_test, y_pred, le.classes_, "Engagement Model")


def main():
    df = pd.read_csv(DATA_PATH)
    print(f"[INFO] Loaded dataset: {df.shape}")

    evaluate_adaptive(df)
    evaluate_behaviour(df)
    evaluate_engagement(df)

    print(f"\n{'='*50}")
    print("  All evaluations complete.")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
