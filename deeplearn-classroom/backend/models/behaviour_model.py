"""
Behaviour Classification Model — LSTM
Classifies student behaviour: Active / Passive / Distracted
Input: sequence of shape (10, 4) — [click_freq, response_speed, chat_count, idle_time]
"""

from tensorflow import keras
from tensorflow.keras import layers


def build_behaviour_model(sequence_length=10, n_features=4, num_classes=3):
    """
    LSTM model for temporal behaviour classification.
    Architecture: LSTM(64) → Dense(32, relu) → Dense(3, softmax)
    """
    model = keras.Sequential([
        layers.Input(shape=(sequence_length, n_features), name="behaviour_input"),
        layers.LSTM(64, name="lstm_1"),
        layers.Dense(32, activation="relu", name="dense_1"),
        layers.Dense(num_classes, activation="softmax", name="output"),
    ], name="behaviour_classification_model")

    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    return model


if __name__ == "__main__":
    model = build_behaviour_model()
    model.summary()
