"""
ISL Alphabet Model — Training Pipeline
Trains a CNN classifier on the Indian Sign Language Alphabet Dataset (Kaggle).
Dataset: rushilverma07/indian-sign-language-alphabet-dataset
  - 26 classes (a–z), 1200 images each, 384×384 grayscale JPG
  - Resized to 128×128 for training
"""

import os
import sys
import json
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Dataset path
DATASET_ROOT = os.path.join(
    os.path.expanduser("~"),
    ".cache", "kagglehub", "datasets",
    "rushilverma07", "indian-sign-language-alphabet-dataset",
    "versions", "1", "dataset - Gesture Speech"
)

# Only valid alphabet classes (a-z), exclude the '{' artifact folder
VALID_CLASSES = sorted([chr(c) for c in range(ord('a'), ord('z') + 1)])

IMG_SIZE = 128
BATCH_SIZE = 32
EPOCHS = 10


def load_dataset(dataset_root, img_size=IMG_SIZE, max_per_class=None):
    """Load ISL alphabet images from folder structure.
    
    Args:
        dataset_root: Path to dataset root containing class folders
        img_size: Target image size (square)
        max_per_class: Max images per class (None = all)
    
    Returns:
        X: numpy array of images (N, img_size, img_size, 1)
        y: numpy array of integer labels (N,)
        class_names: list of class name strings
    """
    from PIL import Image

    images = []
    labels = []
    class_names = []

    for idx, class_name in enumerate(VALID_CLASSES):
        class_dir = os.path.join(dataset_root, class_name)
        if not os.path.isdir(class_dir):
            print(f"[WARN] Missing class folder: {class_dir}")
            continue

        class_names.append(class_name)
        files = sorted([f for f in os.listdir(class_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
        
        if max_per_class:
            files = files[:max_per_class]

        for fname in files:
            fpath = os.path.join(class_dir, fname)
            try:
                img = Image.open(fpath).convert('L')  # Ensure grayscale
                img = img.resize((img_size, img_size), Image.BILINEAR)
                arr = np.array(img, dtype=np.float32) / 255.0
                images.append(arr)
                labels.append(idx)
            except Exception as e:
                print(f"[WARN] Failed to load {fpath}: {e}")

    X = np.array(images).reshape(-1, img_size, img_size, 1)
    y = np.array(labels, dtype=np.int32)

    print(f"[INFO] Loaded {len(X)} images across {len(class_names)} classes")
    return X, y, class_names


def build_isl_alphabet_model(img_size=IMG_SIZE, num_classes=26):
    """Build a CNN for ISL alphabet classification.
    
    Architecture:
        Conv2D(32) → MaxPool → Conv2D(64) → MaxPool → Conv2D(128) → MaxPool
        → Flatten → Dense(256) → Dropout → Dense(26, softmax)
    """
    from tensorflow import keras
    from tensorflow.keras import layers

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


def main():
    from tensorflow.keras.callbacks import EarlyStopping

    print(f"[INFO] Dataset root: {DATASET_ROOT}")
    if not os.path.isdir(DATASET_ROOT):
        print(f"[ERROR] Dataset not found at {DATASET_ROOT}")
        print("[ERROR] Please download: kagglehub.dataset_download('rushilverma07/indian-sign-language-alphabet-dataset')")
        sys.exit(1)

    # Load dataset
    print("[INFO] Loading ISL Alphabet dataset...")
    X, y, class_names = load_dataset(DATASET_ROOT, IMG_SIZE)

    print(f"[INFO] Dataset shape: X={X.shape}, y={y.shape}")
    print(f"[INFO] Classes ({len(class_names)}): {class_names}")

    # Shuffle and split
    indices = np.arange(len(X))
    np.random.seed(42)
    np.random.shuffle(indices)
    X, y = X[indices], y[indices]

    split = int(0.8 * len(X))
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]

    print(f"[INFO] Train: {len(X_train)}, Val: {len(X_val)}")

    # Build and train model
    model = build_isl_alphabet_model(IMG_SIZE, len(class_names))
    model.summary()

    early_stop = EarlyStopping(
        monitor='val_accuracy',
        patience=3,
        restore_best_weights=True,
        verbose=1
    )

    history = model.fit(
        X_train, y_train,
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        validation_data=(X_val, y_val),
        callbacks=[early_stop],
        verbose=1,
    )

    # Evaluate
    val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)
    print(f"\n[RESULT] Validation Accuracy: {val_acc:.4f}")
    print(f"[RESULT] Validation Loss: {val_loss:.4f}")

    # Save model
    save_dir = os.path.join(os.path.dirname(__file__), "..", "saved_models")
    os.makedirs(save_dir, exist_ok=True)

    model_path = os.path.join(save_dir, "isl_alphabet_model.h5")
    model.save(model_path)
    print(f"[OK] ISL alphabet model saved: {model_path}")

    # Save label mapping
    labels_path = os.path.join(save_dir, "isl_alphabet_labels.json")
    label_map = {str(i): name.upper() for i, name in enumerate(class_names)}
    with open(labels_path, "w") as f:
        json.dump(label_map, f, indent=2)
    print(f"[OK] ISL alphabet labels saved: {labels_path}")

    # Save training metrics
    metrics_path = os.path.join(save_dir, "isl_alphabet_metrics.json")
    metrics = {
        "val_accuracy": float(val_acc),
        "val_loss": float(val_loss),
        "epochs_trained": len(history.history['loss']),
        "num_classes": len(class_names),
        "class_names": class_names,
        "img_size": IMG_SIZE,
        "total_samples": len(X),
        "train_samples": len(X_train),
        "val_samples": len(X_val),
    }
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"[OK] Training metrics saved: {metrics_path}")


if __name__ == "__main__":
    main()
