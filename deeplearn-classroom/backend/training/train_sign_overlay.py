import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models.sign_overlay_model import build_sign_overlay_model

def main():
    print("[INFO] Generating dummy data for Sign Overlay model...")
    # 100 samples, 20 words each
    X = np.random.randint(0, 1000, size=(100, 20))
    # output: 20 timesteps, 63 features (landmarks)
    y = np.random.rand(100, 20, 63)

    model = build_sign_overlay_model()
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
    model_path = os.path.join(save_dir, "sign_overlay_model.h5")
    model.save(model_path)
    print(f"[✓] Sign overlay model saved: {model_path}")

if __name__ == "__main__":
    main()
