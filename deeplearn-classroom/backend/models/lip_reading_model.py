"""
Lip Reading Model — CNN
Predicts lip state from grayscale lip crops.
Input: (64, 64, 1)
Output: 5 classes [Speaking, Silent, Mouthing, Laughing, Neutral]
"""

from tensorflow import keras
from tensorflow.keras import layers

def build_lip_reading_model(input_shape=(64, 64, 1), num_classes=5):
    """
    CNN for lip state recognition.
    Architecture: Conv2D(32)→Pool → Conv2D(64)→Pool → Dense(128) → Dense(5, softmax)
    """
    model = keras.Sequential([
        layers.Input(shape=input_shape, name="lip_input"),
        layers.Conv2D(32, (3, 3), activation="relu", name="conv2d_1"),
        layers.MaxPooling2D((2, 2), name="pool_1"),
        layers.Conv2D(64, (3, 3), activation="relu", name="conv2d_2"),
        layers.MaxPooling2D((2, 2), name="pool_2"),
        layers.Flatten(name="flatten"),
        layers.Dense(128, activation="relu", name="dense_1"),
        layers.Dense(num_classes, activation="softmax", name="output"),
    ], name="lip_reading_model")

    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    return model

if __name__ == "__main__":
    model = build_lip_reading_model()
    model.summary()
