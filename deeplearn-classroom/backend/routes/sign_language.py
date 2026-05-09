"""
sign_language.py — /sign-data Routes
--------------------------------------
Provides endpoints to:
  POST /sign-data            — save generated sign sequences with a recording
  GET  /sign-data/<rec_id>   — fetch sign sequences for a recording
  POST /process-signs        — process speech text → sign sequence (AI pipeline)
"""

import json
import os
import time
from flask import Blueprint, request, jsonify

sign_language_bp = Blueprint("sign_language", __name__)

# Directory where sign-data JSON files are persisted alongside recordings
SIGN_DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'recordings')


def _sign_data_path(recording_id: str) -> str:
    """Return the filesystem path for a recording's sign data file."""
    return os.path.join(SIGN_DATA_DIR, f"signs_{recording_id}.json")


# ---------------------------------------------------------------------------
# POST /sign-data
# ---------------------------------------------------------------------------
@sign_language_bp.route("/sign-data", methods=["POST"])
def save_sign_data():
    """
    Save AI-generated sign sequences for a recording session.

    Request JSON:
    {
      "recording_id": "abc123",
      "signs": [
        { "word": "HELLO", "gesture": "wave", "startTime": 0.5, "endTime": 1.2 },
        ...
      ],
      "metadata": {
        "totalSigns": 42,
        "captionSegments": 8,
        "generatedAt": 1715000000
      }
    }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    recording_id = data.get("recording_id")
    signs = data.get("signs")

    if not recording_id or not isinstance(signs, list):
        return jsonify({"error": "recording_id and signs[] are required"}), 400

    payload = {
        "recording_id": recording_id,
        "signs": signs,
        "metadata": data.get("metadata", {}),
        "saved_at": time.time(),
    }

    try:
        os.makedirs(SIGN_DATA_DIR, exist_ok=True)
        path = _sign_data_path(recording_id)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        return jsonify({
            "status": "saved",
            "recording_id": recording_id,
            "total_signs": len(signs),
            "path": path,
        }), 201

    except Exception as e:
        return jsonify({"error": f"Failed to save sign data: {str(e)}"}), 500


# ---------------------------------------------------------------------------
# GET /sign-data/<recording_id>
# ---------------------------------------------------------------------------
@sign_language_bp.route("/sign-data/<recording_id>", methods=["GET"])
def get_sign_data(recording_id):
    """
    Retrieve pre-generated sign sequences for a recording.
    Returns 404 if no sign data exists yet.
    """
    path = _sign_data_path(recording_id)

    if not os.path.exists(path):
        return jsonify({"error": "No sign data found for this recording"}), 404

    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        return jsonify(payload), 200
    except Exception as e:
        return jsonify({"error": f"Failed to read sign data: {str(e)}"}), 500


# ---------------------------------------------------------------------------
# POST /process-signs
# ---------------------------------------------------------------------------
@sign_language_bp.route("/process-signs", methods=["POST"])
def process_signs():
    """
    Convert a spoken text transcript into a sign language sequence.
    This is the AI speech → sign pipeline entry point.

    Request JSON:
    {
      "captions": [
        { "text": "Hello students", "start": 0.0, "end": 2.5 },
        ...
      ]
    }

    Response JSON:
    {
      "signs": [
        { "word": "HELLO", "gesture": "wave", "startTime": 0.0, "endTime": 1.25 },
        { "word": "STUDENTS", "gesture": "talk", "startTime": 1.25, "endTime": 2.5 },
        ...
      ],
      "total": 2
    }
    """
    data = request.get_json(silent=True)
    if not data or "captions" not in data:
        return jsonify({"error": "captions[] is required"}), 400

    captions = data["captions"]

    # NLP: stop-word list matching gesture categories
    STOP_WORDS = {
        'a','an','the','is','are','am','be','to','in','on','at','it','of','and',
        'or','but','if','as','by','for','with','this','that','these','those',
        'was','were','has','have','had','will','would','could','should','may',
        'might','shall','can','do','does','did','its','his','her','our','their',
        'we','they','i','you','he','she','us','them','my','your',
    }

    GESTURE_MAP = {
        'hello':'wave','hi':'wave','welcome':'wave','goodbye':'wave',
        'yes':'yes','correct':'yes','right':'yes','good':'yes','great':'yes',
        'no':'no','wrong':'no','not':'no','never':'no','error':'no',
        'one':'count','two':'count','three':'count','four':'count','five':'count',
        'first':'count','second':'count','third':'count','many':'count',
        'because':'explain','means':'explain','explain':'explain','show':'explain',
        'what':'question','which':'question','how':'question','why':'question',
        'who':'question','where':'question','when':'question',
        'think':'think','understand':'think','know':'think','learn':'think',
        'look':'point','see':'point','focus':'point','here':'point',
        'calculate':'math','compute':'math','solve':'math','algorithm':'math',
        'move':'action','go':'action','start':'action','begin':'action',
        'important':'alert','key':'alert','critical':'alert','warning':'alert',
    }

    signs = []
    for cap in captions:
        text  = cap.get("text", "")
        start = cap.get("start", cap.get("start_time", 0))
        end   = cap.get("end",   cap.get("end_time",   start + 3))

        tokens = [w.lower().strip('.,!?;:') for w in text.split() if w]
        content_tokens = [t for t in tokens if t and t not in STOP_WORDS]

        if not content_tokens:
            continue

        dur_per_word = (end - start) / len(content_tokens)
        for i, word in enumerate(content_tokens):
            gesture = GESTURE_MAP.get(word, "talk")
            signs.append({
                "word":      word.upper(),
                "gesture":   gesture,
                "startTime": round(start + i * dur_per_word, 3),
                "endTime":   round(start + (i + 1) * dur_per_word, 3),
            })

    return jsonify({"signs": signs, "total": len(signs)}), 200
