import os
import sys
import numpy as np
from tensorflow.keras.utils import to_categorical

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models.lip_reading_model import build_lip_reading_model

def main():
    print("[INFO] Generating dummy data for Lip Reading model...")
    # Generate 100 samples of shape (64, 64, 1)
    X = np.random.rand(100, 64, 64, 1)
    # Generate labels (5 classes)
    y_int = np.random.randint(0, 5, size=100)
    y = to_categorical(y_int, num_classes=5)

    model = build_lip_reading_model()
    model.summary()

    history = model.fit(
        X, y,
        epochs=5,
        batch_size=8,
        validation_split=0.2,
        verbose=1,
    )

    save_dir = os.path.join(os.path.dirname(__file__), "..", "saved_models")
    os.makedirs(save_dir, exist_ok=True)
    model_path = os.path.join(save_dir, "lip_reading_model.h5")
    model.save(model_path)
    print(f"[✓] Lip reading model saved: {model_path}")

if __name__ == "__main__":
    main()
