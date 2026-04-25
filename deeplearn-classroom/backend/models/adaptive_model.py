"""
Adaptive Learning Model — Feedforward DNN
Predicts recommended difficulty level: Easy / Medium / Hard
Input features (5): quiz_score, time_taken, attempt_count, completion_rate, prev_score
"""

from tensorflow import keras
from tensorflow.keras import layers


def build_adaptive_model(input_dim=5, num_classes=3):
    """
    Feedforward DNN for adaptive difficulty prediction.
    Architecture: Dense(64, relu) → Dense(32, relu) → Dense(3, softmax)
    """
    model = keras.Sequential([
        layers.Input(shape=(input_dim,), name="adaptive_input"),
        layers.Dense(64, activation="relu", name="dense_1"),
        layers.Dense(32, activation="relu", name="dense_2"),
        layers.Dense(num_classes, activation="softmax", name="output"),
    ], name="adaptive_learning_model")

    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    return model


if __name__ == "__main__":
    model = build_adaptive_model()
    model.summary()
