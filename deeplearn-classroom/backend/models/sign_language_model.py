"""
Sign Language Recognition Model — ISL (Indian Sign Language)
Provides model builders for ISL alphabet and word recognition.

ISL Alphabet Model:
  Input: (128, 128, 1) grayscale hand gesture image
  Output: 26 classes (a-z)

ISL Words Model:
  Input: (8, 128, 128, 3) video frames
  Output: 76 word classes
"""

from tensorflow import keras
from tensorflow.keras import layers


def build_isl_alphabet_model(img_size=128, num_classes=26):
    """
    CNN for ISL alphabet (static hand gesture) classification.
    Architecture: Conv2D(32) → Conv2D(64) → Conv2D(128) → Dense(256) → Dense(26, softmax)
    """
    model = keras.Sequential([
        layers.Input(shape=(img_size, img_size, 1), name="isl_input"),

        layers.Conv2D(32, (3, 3), activation='relu', padding='same', name="conv1"),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2, 2)),

        layers.Conv2D(64, (3, 3), activation='relu', padding='same', name="conv2"),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2, 2)),

        layers.Conv2D(128, (3, 3), activation='relu', padding='same', name="conv3"),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2, 2)),

        layers.Flatten(),
        layers.Dense(256, activation='relu', name="fc1"),
        layers.Dropout(0.4),
        layers.Dense(num_classes, activation='softmax', name="output"),
    ], name="isl_alphabet_model")

    model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy'],
    )

    return model


def build_isl_words_model(num_frames=8, img_size=128, num_classes=76):
    """
    TimeDistributed CNN + LSTM for ISL word (dynamic gesture) recognition.
    Architecture: TD(Conv2D layers) → LSTM(128) → Dense(64) → Dense(76, softmax)
    """
    model = keras.Sequential([
        layers.Input(shape=(num_frames, img_size, img_size, 3), name="isl_video_input"),

        layers.TimeDistributed(layers.Conv2D(32, (3, 3), activation='relu', padding='same'), name="td_conv1"),
        layers.TimeDistributed(layers.MaxPooling2D((2, 2))),
        layers.TimeDistributed(layers.Conv2D(64, (3, 3), activation='relu', padding='same'), name="td_conv2"),
        layers.TimeDistributed(layers.MaxPooling2D((2, 2))),
        layers.TimeDistributed(layers.Conv2D(128, (3, 3), activation='relu', padding='same'), name="td_conv3"),
        layers.TimeDistributed(layers.GlobalAveragePooling2D()),

        layers.LSTM(128, return_sequences=False, name="lstm"),
        layers.Dropout(0.4),
        layers.Dense(64, activation='relu', name="fc"),
        layers.Dense(num_classes, activation='softmax', name="output"),
    ], name="isl_words_model")

    model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy'],
    )

    return model


if __name__ == "__main__":
    print("=== ISL Alphabet Model ===")
    m1 = build_isl_alphabet_model()
    m1.summary()

    print("\n=== ISL Words Model ===")
    m2 = build_isl_words_model()
    m2.summary()
