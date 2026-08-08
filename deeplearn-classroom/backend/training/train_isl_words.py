"""
ISL Words Model — Training Pipeline
Trains a CNN classifier on the Indian Sign Language Words Dataset (Kaggle).
Dataset: kaushikyh/indian-sign-language-words-with-landmarks
  - 76 word classes, 3-22 video clips each (.MOV files)
  - Extracts representative frames from each video
  - Uses a CNN for frame-level classification, aggregated per-video
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
    "kaushikyh", "indian-sign-language-words-with-landmarks",
    "versions", "1", "ProcessedData_vivit"
)

IMG_SIZE = 128
BATCH_SIZE = 16
EPOCHS = 15
FRAMES_PER_VIDEO = 8  # Extract N frames per video


def extract_frames_from_video(video_path, num_frames=FRAMES_PER_VIDEO, img_size=IMG_SIZE):
    """Extract evenly-spaced frames from a video file.
    
    Args:
        video_path: Path to the video file
        num_frames: Number of frames to extract
        img_size: Target frame size (square)
    
    Returns:
        List of numpy arrays (img_size, img_size, 3) or empty list on failure
    """
    import cv2

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames <= 0:
        cap.release()
        return []

    # Evenly space frame indices
    if total_frames <= num_frames:
        frame_indices = list(range(total_frames))
    else:
        frame_indices = np.linspace(0, total_frames - 1, num_frames, dtype=int).tolist()

    frames = []
    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret and frame is not None:
            frame = cv2.resize(frame, (img_size, img_size))
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(frame.astype(np.float32) / 255.0)

    cap.release()

    # Pad if we got fewer frames than requested
    while len(frames) < num_frames:
        if frames:
            frames.append(frames[-1].copy())
        else:
            frames.append(np.zeros((img_size, img_size, 3), dtype=np.float32))

    return frames[:num_frames]


def load_dataset(dataset_root, img_size=IMG_SIZE, num_frames=FRAMES_PER_VIDEO):
    """Load ISL word videos from folder structure.
    
    Returns:
        X: numpy array of shape (N, num_frames, img_size, img_size, 3)
        y: numpy array of integer labels (N,)
        class_names: sorted list of word labels
    """
    class_names = sorted([
        d for d in os.listdir(dataset_root)
        if os.path.isdir(os.path.join(dataset_root, d))
    ])

    videos = []
    labels = []

    for idx, class_name in enumerate(class_names):
        class_dir = os.path.join(dataset_root, class_name)
        files = sorted([
            f for f in os.listdir(class_dir)
            if f.lower().endswith(('.mov', '.mp4', '.avi'))
        ])

        for fname in files:
            fpath = os.path.join(class_dir, fname)
            frames = extract_frames_from_video(fpath, num_frames, img_size)
            if len(frames) == num_frames:
                videos.append(np.array(frames))
                labels.append(idx)
            else:
                print(f"[WARN] Skipping {fpath}: got {len(frames)} frames")

        if (idx + 1) % 10 == 0:
            print(f"[INFO] Processed {idx + 1}/{len(class_names)} classes...")

    X = np.array(videos)
    y = np.array(labels, dtype=np.int32)

    print(f"[INFO] Loaded {len(X)} videos across {len(class_names)} classes")
    return X, y, class_names


def build_isl_words_model(num_frames=FRAMES_PER_VIDEO, img_size=IMG_SIZE, num_classes=76):
    """Build a TimeDistributed CNN + LSTM model for ISL word recognition.
    
    Architecture:
        TimeDistributed(Conv2D layers) → TimeDistributed(Flatten)
        → LSTM(128) → Dense(64) → Dense(num_classes, softmax)
    """
    from tensorflow import keras
    from tensorflow.keras import layers

    model = keras.Sequential([
        layers.Input(shape=(num_frames, img_size, img_size, 3), name="isl_video_input"),
        
        # Frame-level feature extraction
        layers.TimeDistributed(layers.Conv2D(32, (3, 3), activation='relu', padding='same'), name="td_conv1"),
        layers.TimeDistributed(layers.MaxPooling2D((2, 2))),
        layers.TimeDistributed(layers.Conv2D(64, (3, 3), activation='relu', padding='same'), name="td_conv2"),
        layers.TimeDistributed(layers.MaxPooling2D((2, 2))),
        layers.TimeDistributed(layers.Conv2D(128, (3, 3), activation='relu', padding='same'), name="td_conv3"),
        layers.TimeDistributed(layers.GlobalAveragePooling2D()),
        
        # Temporal modeling
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


def main():
    from tensorflow.keras.callbacks import EarlyStopping

    print(f"[INFO] Dataset root: {DATASET_ROOT}")
    if not os.path.isdir(DATASET_ROOT):
        print(f"[ERROR] Dataset not found at {DATASET_ROOT}")
        print("[ERROR] Please download: kagglehub.dataset_download('kaushikyh/indian-sign-language-words-with-landmarks')")
        sys.exit(1)

    # Load dataset
    print("[INFO] Loading ISL Words dataset (extracting video frames)...")
    X, y, class_names = load_dataset(DATASET_ROOT, IMG_SIZE, FRAMES_PER_VIDEO)

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
    model = build_isl_words_model(FRAMES_PER_VIDEO, IMG_SIZE, len(class_names))
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

    model_path = os.path.join(save_dir, "isl_words_model.h5")
    model.save(model_path)
    print(f"[OK] ISL words model saved: {model_path}")

    # Save label mapping
    labels_path = os.path.join(save_dir, "isl_word_labels.json")
    label_map = {str(i): name for i, name in enumerate(class_names)}
    with open(labels_path, "w") as f:
        json.dump(label_map, f, indent=2)
    print(f"[OK] ISL word labels saved: {labels_path}")

    # Save training metrics
    metrics_path = os.path.join(save_dir, "isl_words_metrics.json")
    metrics = {
        "val_accuracy": float(val_acc),
        "val_loss": float(val_loss),
        "epochs_trained": len(history.history['loss']),
        "num_classes": len(class_names),
        "class_names": class_names,
        "img_size": IMG_SIZE,
        "frames_per_video": FRAMES_PER_VIDEO,
        "total_samples": len(X),
        "train_samples": len(X_train),
        "val_samples": len(X_val),
    }
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"[OK] Training metrics saved: {metrics_path}")


if __name__ == "__main__":
    main()
