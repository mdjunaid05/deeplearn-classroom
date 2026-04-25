"""
Model Loader — loads saved .h5 models and .pkl scalers for inference.
"""

import os
import pickle
import numpy as np
from tensorflow import keras


BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "saved_models")

_model_cache = {}
_scaler_cache = {}


def _resolve_path(filename):
    return os.path.join(BASE_DIR, filename)


def load_model(model_name):
    """
    Load a Keras .h5 model by name (without extension).
    Caches the model after first load.
    """
    if model_name in _model_cache:
        return _model_cache[model_name]

    path = _resolve_path(f"{model_name}.h5")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Model file not found: {path}. "
            f"Run the training script first."
        )

    model = keras.models.load_model(path)
    _model_cache[model_name] = model
    return model


def load_scaler(scaler_name):
    """
    Load a scikit-learn scaler .pkl file by name (without extension).
    Caches the scaler after first load.
    """
    if scaler_name in _scaler_cache:
        return _scaler_cache[scaler_name]

    path = _resolve_path(f"{scaler_name}.pkl")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Scaler file not found: {path}. "
            f"Run the training script first."
        )

    with open(path, "rb") as f:
        scaler = pickle.load(f)

    _scaler_cache[scaler_name] = scaler
    return scaler


def predict_difficulty(features):
    """
    Predict difficulty level from raw features.
    features: dict with keys quiz_score, time_taken, attempt_count,
              completion_rate, prev_score
    Returns: dict with label and confidence scores.
    """
    model = load_model("adaptive_model")
    scaler = load_scaler("adaptive_scaler")

    feature_order = ["quiz_score", "time_taken", "attempt_count",
                     "completion_rate", "prev_score"]
    X = np.array([[features[k] for k in feature_order]])
    X_scaled = scaler.transform(X)

    probs = model.predict(X_scaled, verbose=0)[0]
    labels = ["Easy", "Medium", "Hard"]
    predicted_idx = int(np.argmax(probs))

    return {
        "predicted_label": labels[predicted_idx],
        "confidence": float(probs[predicted_idx]),
        "probabilities": {l: float(p) for l, p in zip(labels, probs)},
    }


def predict_engagement(features):
    """
    Predict engagement level from raw features.
    features: dict with keys response_freq, participation_count,
              activity_completion, idle_time, session_time, quiz_score
    Returns: dict with label and confidence scores.
    """
    model = load_model("engagement_model")
    scaler = load_scaler("engagement_scaler")

    feature_order = ["response_freq", "participation_count",
                     "activity_completion", "idle_time",
                     "session_time", "quiz_score"]
    X = np.array([[features[k] for k in feature_order]])
    X_scaled = scaler.transform(X)

    probs = model.predict(X_scaled, verbose=0)[0]
    labels = ["High", "Medium", "Low"]
    predicted_idx = int(np.argmax(probs))

    return {
        "predicted_label": labels[predicted_idx],
        "confidence": float(probs[predicted_idx]),
        "probabilities": {l: float(p) for l, p in zip(labels, probs)},
    }


def predict_behaviour(sequence):
    """
    Predict behaviour from a sequence of interaction data.
    sequence: list of 10 dicts, each with keys
              click_freq, response_speed, chat_count, idle_time
    Returns: dict with label and confidence scores.
    """
    model = load_model("behaviour_model")
    scaler = load_scaler("behaviour_scaler")

    feature_order = ["click_freq", "response_speed", "chat_count", "idle_time"]
    raw = np.array([[step[k] for k in feature_order] for step in sequence])

    # Flatten → scale → reshape back to (1, 10, 4)
    raw_flat = raw.reshape(-1, 4)
    scaled_flat = scaler.transform(raw_flat)
    X = scaled_flat.reshape(1, 10, 4)

    probs = model.predict(X, verbose=0)[0]
    labels = ["Active", "Passive", "Distracted"]
    predicted_idx = int(np.argmax(probs))

    return {
        "predicted_label": labels[predicted_idx],
        "confidence": float(probs[predicted_idx]),
        "probabilities": {l: float(p) for l, p in zip(labels, probs)},
    }

def predict_sign_language(sequence):
    """
    Predict sign language gesture from sequence of hand landmarks.
    sequence: array of shape (30, 63)
    Returns: dict with label and confidence score.
    """
    model = load_model("sign_language_model")
    
    # Pre-scale or reshape if needed, assuming sequence is (30, 63)
    X = np.array(sequence).reshape(1, 30, 63)
    
    probs = model.predict(X, verbose=0)[0]
    labels = ["Hello", "Yes", "No", "Help", "Understand", "Repeat", "Stop", "Good", "Bad", "Question"]
    predicted_idx = int(np.argmax(probs))
    
    return {
        "predicted_label": labels[predicted_idx],
        "confidence": float(probs[predicted_idx]),
    }

def predict_lip_reading(image_array):
    """
    Predict lip state from image array.
    image_array: array of shape (64, 64, 1)
    Returns: dict with label and confidence score.
    """
    model = load_model("lip_reading_model")
    
    X = np.array(image_array).reshape(1, 64, 64, 1)
    
    probs = model.predict(X, verbose=0)[0]
    labels = ["Speaking", "Silent", "Mouthing", "Laughing", "Neutral"]
    predicted_idx = int(np.argmax(probs))
    
    return {
        "predicted_label": labels[predicted_idx],
        "confidence": float(probs[predicted_idx]),
    }
