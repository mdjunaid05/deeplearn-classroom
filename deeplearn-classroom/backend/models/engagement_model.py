"""
Engagement Detection Model — Deep Neural Network
Predicts engagement level: High / Medium / Low
Input features (6): response_freq, participation_count, activity_completion,
                     idle_time, session_time, quiz_score
"""

from tensorflow import keras
from tensorflow.keras import layers


def build_engagement_model(input_dim=6, num_classes=3):
    """
    DNN with dropout for engagement detection.
    Architecture: Dense(128, relu) → Dropout(0.3) → Dense(64, relu) → Dense(3, softmax)
    """
    model = keras.Sequential([
        layers.Input(shape=(input_dim,), name="engagement_input"),
        layers.Dense(128, activation="relu", name="dense_1"),
        layers.Dropout(0.3, name="dropout_1"),
        layers.Dense(64, activation="relu", name="dense_2"),
        layers.Dense(num_classes, activation="softmax", name="output"),
    ], name="engagement_detection_model")

    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    return model


if __name__ == "__main__":
    model = build_engagement_model()
    model.summary()
