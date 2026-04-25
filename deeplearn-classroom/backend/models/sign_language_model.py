"""
Sign Language Recognition Model — CNN + LSTM
Predicts ASL gestures from MediaPipe hand landmarks.
Input: (30, 63) sequence of landmarks
Output: 10 classes
"""

from tensorflow import keras
from tensorflow.keras import layers

def build_sign_language_model(sequence_length=30, features=63, num_classes=10):
    """
    TimeDistributed CNN + LSTM for sign language recognition.
    Architecture: TimeDistributed(Dense(128)) → LSTM(64) → LSTM(32) → Dense(10, softmax)
    """
    model = keras.Sequential([
        layers.Input(shape=(sequence_length, features), name="sign_input"),
        layers.TimeDistributed(layers.Dense(128, activation="relu"), name="td_dense"),
        layers.LSTM(64, return_sequences=True, name="lstm_1"),
        layers.LSTM(32, name="lstm_2"),
        layers.Dense(num_classes, activation="softmax", name="output"),
    ], name="sign_language_model")

    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    return model

if __name__ == "__main__":
    model = build_sign_language_model()
    model.summary()
