import os
import json
import logging
import threading
import tempfile
import requests
import numpy as np
from pathlib import Path
from dotenv import load_dotenv

# Suppress TF noise before any TF import
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("TF_ENABLE_DEPRECATION_WARNINGS", "0")

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

import firebase_admin
from firebase_admin import credentials, firestore as admin_firestore
from flask import Flask, request, jsonify
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Silence TF/absl loggers
logging.getLogger("tensorflow").setLevel(logging.ERROR)
logging.getLogger("absl").setLevel(logging.ERROR)

# ─── Register static ffmpeg so pydub can convert m4a/aac from phones ─────────
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
    from pydub import AudioSegment as _AudioSegment  # pre-load
    logger.info("static-ffmpeg + pydub ready")
except Exception as _e:
    logger.warning("static-ffmpeg/pydub setup: %s", _e)

app = Flask(__name__)
CORS(app)

# ─── Firebase Admin SDK ───────────────────────────────────────────────────────
db_admin = None

def init_firebase():
    global db_admin
    try:
        svc_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
        if svc_json:
            cred = credentials.Certificate(json.loads(svc_json))
            firebase_admin.initialize_app(cred)
            db_admin = admin_firestore.client()
            logger.info("Firebase Admin SDK initialized from env var.")
            return
        svc_path = Path(__file__).parent / "serviceAccountKey.json"
        if svc_path.exists():
            cred = credentials.Certificate(str(svc_path))
            firebase_admin.initialize_app(cred)
            db_admin = admin_firestore.client()
            logger.info("Firebase Admin SDK initialized from local file.")
            return
        logger.warning("No Firebase credentials found. Firestore admin routes disabled.")
    except Exception as e:
        logger.error("Firebase Admin init failed: %s", e)

init_firebase()

# ─── Request logging ──────────────────────────────────────────────────────────
@app.before_request
def log_request():
    logger.info("📥 %s %s from %s", request.method, request.path, request.remote_addr)

# ─── Health check ─────────────────────────────────────────────────────────────
@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "PawTalk Backend", "model": "YAMNet"}), 200

# ─── Checklist Routes ─────────────────────────────────────────────────────────

@app.route("/checklist/add", methods=["POST"])
def checklist_add():
    if not db_admin:
        return jsonify({"error": "Firebase Admin not initialized"}), 503
    try:
        data    = request.get_json(silent=True) or {}
        user_id = data.get("userId", "").strip()
        title   = data.get("title", "").strip()
        if not user_id or not title:
            return jsonify({"error": "userId and title are required"}), 400
        task = {
            "userId":    user_id,
            "title":     title,
            "category":  data.get("category", "general"),
            "time":      data.get("time", ""),
            "icon":      data.get("icon", "food"),
            "done":      False,
            "createdAt": admin_firestore.SERVER_TIMESTAMP,
        }
        ref = db_admin.collection("users").document(user_id).collection("tasks").add(task)
        return jsonify({"id": ref[1].id, "message": "Task added"}), 201
    except Exception as e:
        logger.error("checklist_add error: %s", e)
        return jsonify({"error": str(e)}), 500

@app.route("/checklist/<user_id>", methods=["GET"])
def checklist_get(user_id):
    if not db_admin:
        return jsonify({"error": "Firebase Admin not initialized"}), 503
    try:
        docs  = db_admin.collection("users").document(user_id).collection("tasks") \
                        .order_by("createdAt").stream()
        tasks = [{"id": d.id, **d.to_dict()} for d in docs]
        return jsonify({"tasks": tasks}), 200
    except Exception as e:
        logger.error("checklist_get error: %s", e)
        return jsonify({"error": str(e)}), 500

@app.route("/checklist/update/<task_id>", methods=["PUT"])
def checklist_update(task_id):
    if not db_admin:
        return jsonify({"error": "Firebase Admin not initialized"}), 503
    try:
        data    = request.get_json(silent=True) or {}
        user_id = data.get("userId", "").strip()
        if not user_id:
            return jsonify({"error": "userId is required"}), 400
        updates = {k: v for k, v in data.items() if k not in ("userId", "id")}
        db_admin.collection("users").document(user_id).collection("tasks") \
                .document(task_id).update(updates)
        return jsonify({"message": "Task updated"}), 200
    except Exception as e:
        logger.error("checklist_update error: %s", e)
        return jsonify({"error": str(e)}), 500

@app.route("/checklist/delete/<task_id>", methods=["DELETE"])
def checklist_delete(task_id):
    if not db_admin:
        return jsonify({"error": "Firebase Admin not initialized"}), 503
    try:
        user_id = request.args.get("userId", "").strip()
        if not user_id:
            return jsonify({"error": "userId query param required"}), 400
        db_admin.collection("users").document(user_id).collection("tasks") \
                .document(task_id).delete()
        return jsonify({"message": "Task deleted"}), 200
    except Exception as e:
        logger.error("checklist_delete error: %s", e)
        return jsonify({"error": str(e)}), 500

# ─── Push Notification Routes ─────────────────────────────────────────────────

@app.route("/registerPushToken", methods=["POST"])
def register_push_token():
    if not db_admin:
        return jsonify({"error": "Firebase Admin not initialized"}), 503
    try:
        data    = request.get_json(silent=True) or {}
        user_id = data.get("userId", "").strip()
        token   = data.get("expoPushToken", "").strip()
        if not user_id or not token:
            return jsonify({"error": "userId and expoPushToken required"}), 400
        db_admin.collection("users").document(user_id).set(
            {"expoPushToken": token}, merge=True
        )
        return jsonify({"message": "Token registered"}), 200
    except Exception as e:
        logger.error("registerPushToken error: %s", e)
        return jsonify({"error": str(e)}), 500

@app.route("/sendNotification", methods=["POST"])
def send_notification():
    try:
        data  = request.get_json(silent=True) or {}
        token = data.get("expoPushToken", "").strip()
        title = data.get("title", "PawTalk Reminder").strip()
        body  = data.get("body", "").strip()
        if not token:
            return jsonify({"error": "expoPushToken required"}), 400
        payload = {
            "to": token, "title": title, "body": body,
            "sound": "default", "data": data.get("data", {}),
        }
        resp = requests.post(
            "https://exp.host/--/api/v2/push/send",
            json=payload, headers={"Content-Type": "application/json"}, timeout=10,
        )
        return jsonify({"result": resp.json()}), 200
    except Exception as e:
        logger.error("sendNotification error: %s", e)
        return jsonify({"error": str(e)}), 500

# ─── YAMNet TFLite classifier ─────────────────────────────────────────────────
#
# Model : yamnet.tflite  (4 MB, Google AudioSet, 521 classes)
# Speed : ~20 ms per 0.975-second frame on CPU
# Input : float32 waveform, exactly 15600 samples at 16 kHz
# Output: (1, 521) class scores per frame
#
# Cat classes : 76=Cat, 78=Meow, 80=Caterwaul, 104=Roaring cats
# Dog classes : 69=Dog, 70=Bark, 75=Whimper(dog), 117=Canidae
# Silence     : 494=Silence
# ─────────────────────────────────────────────────────────────────────────────

YAMNET_SR    = 16000
YAMNET_FRAME = 15600          # exactly 0.975 s at 16 kHz — fixed by model
YAMNET_PATH  = Path(__file__).parent / "yamnet.tflite"

# Auto-download yamnet.tflite if missing (needed on Railway / cloud deploys)
YAMNET_URL = "https://storage.googleapis.com/download.tensorflow.org/models/tflite/task_library/audio_classification/android/lite-model_yamnet_classification_tflite_1.tflite"

def ensure_yamnet():
    if YAMNET_PATH.exists():
        return
    logger.info("yamnet.tflite not found — downloading from Google...")
    try:
        import urllib.request
        urllib.request.urlretrieve(YAMNET_URL, str(YAMNET_PATH))
        logger.info("yamnet.tflite downloaded (%.1f MB)", YAMNET_PATH.stat().st_size / 1e6)
    except Exception as e:
        logger.error("Failed to download yamnet.tflite: %s", e)

ensure_yamnet()

CAT_IDS      = {76, 78, 80, 104}   # Cat, Meow, Caterwaul, Roaring cats
DOG_IDS      = {69, 70, 75, 117}   # Dog, Bark, Whimper, Canidae
SILENCE_IDS  = {494, 0}            # Silence, Speech

# ─── Behavior Detection — AudioSet class mappings ────────────────────────────
#
# Each behavior is defined by a set of YAMNet class indices whose combined
# score drives the detection.  Scores are summed per group then the highest
# group wins (with a minimum threshold to avoid false positives on silence).
#
# AudioSet class reference: https://research.google.com/audioset/ontology/
#
# CAT behaviors
#   Excited / Playful  : 78=Meow (high-pitched), 80=Caterwaul, 76=Cat
#   Wants Attention    : 78=Meow, 76=Cat
#   Anxious / Stressed : 80=Caterwaul, 104=Roaring cats, 78=Meow
#   Content / Purring  : 76=Cat (low-energy sustained)
#   Alert              : 76=Cat, 78=Meow
#
# DOG behaviors
#   Excited / Playful  : 70=Bark, 69=Dog, 117=Canidae
#   Wants Attention    : 75=Whimper, 69=Dog
#   Anxious / Stressed : 75=Whimper, 69=Dog
#   Alert / Warning    : 70=Bark, 69=Dog
#   Content            : 69=Dog, 117=Canidae
#
# Because YAMNet is not trained on "behavior" labels we use acoustic proxies:
#   - High bark energy  → Excited or Alert (disambiguated by pitch proxy)
#   - Whimper dominant  → Anxious / Wants Attention
#   - Sustained low cat → Content / Purring
#   - Caterwaul         → Stressed
# ─────────────────────────────────────────────────────────────────────────────

# Behavior signal groups — (name, description, emoji, color_hex, class_ids, weight)
# weight > 1 boosts a class's contribution to this behavior
CAT_BEHAVIORS = [
    {
        "name": "Excited and Playful",
        "description": "Your cat is energetic and in a playful mood.",
        "emoji": "😸",
        "color": "#4caf50",
        "ids": {78: 1.5, 80: 1.2, 76: 1.0},   # Meow, Caterwaul, Cat
        "min_score": 0.08,
    },
    {
        "name": "Wants Attention",
        "description": "Your cat is calling out and wants to be noticed.",
        "emoji": "🐾",
        "color": "#e91e63",
        "ids": {78: 2.0, 76: 1.0},              # Meow dominant
        "min_score": 0.06,
    },
    {
        "name": "Anxious or Stressed",
        "description": "Your cat sounds distressed. Check their environment.",
        "emoji": "😿",
        "color": "#f44336",
        "ids": {80: 2.0, 104: 1.5, 78: 0.5},   # Caterwaul, Roaring cats
        "min_score": 0.05,
    },
    {
        "name": "Content",
        "description": "Your cat seems calm and comfortable.",
        "emoji": "😻",
        "color": "#4caf50",
        "ids": {76: 1.5, 117: 1.0},             # Cat, Canidae (low energy)
        "min_score": 0.04,
    },
    {
        "name": "Alert",
        "description": "Your cat is paying close attention to something.",
        "emoji": "👀",
        "color": "#ff9800",
        "ids": {76: 1.0, 78: 1.0},              # Cat + Meow balanced
        "min_score": 0.05,
    },
]

DOG_BEHAVIORS = [
    {
        "name": "Excited and Playful",
        "description": "Your dog is full of energy and ready to play!",
        "emoji": "🐕",
        "color": "#4caf50",
        "ids": {70: 1.5, 69: 1.0, 117: 1.0},   # Bark, Dog, Canidae
        "min_score": 0.08,
    },
    {
        "name": "Wants Attention",
        "description": "Your dog is whimpering and seeking your company.",
        "emoji": "🐾",
        "color": "#e91e63",
        "ids": {75: 2.0, 69: 1.0},              # Whimper dominant
        "min_score": 0.05,
    },
    {
        "name": "Anxious or Stressed",
        "description": "Your dog sounds uneasy. Try to comfort them.",
        "emoji": "😰",
        "color": "#f44336",
        "ids": {75: 2.5, 69: 0.5},              # Whimper very dominant
        "min_score": 0.05,
    },
    {
        "name": "Alert or Warning",
        "description": "Your dog is alerting you to something nearby.",
        "emoji": "🚨",
        "color": "#ff9800",
        "ids": {70: 2.0, 69: 1.0},              # Bark dominant
        "min_score": 0.07,
    },
    {
        "name": "Content",
        "description": "Your dog is relaxed and at ease.",
        "emoji": "😊",
        "color": "#4caf50",
        "ids": {69: 1.5, 117: 1.5},             # Dog + Canidae, no bark/whimper
        "min_score": 0.04,
    },
]


def detect_behavior(scores: np.ndarray, species: str) -> dict:
    """
    Given YAMNet mean scores (521,) and the detected species, return the most
    likely behavior label with description, emoji, and confidence score.

    Strategy:
      1. For each behavior group, compute a weighted sum of its class scores.
      2. Discard groups below their min_score threshold.
      3. Pick the group with the highest weighted sum.
      4. For dogs: if bark score >> whimper score → prefer Excited/Alert over Anxious.
      5. For cats: if caterwaul >> meow → prefer Anxious over Excited.
    """
    behaviors = CAT_BEHAVIORS if species == "cat" else DOG_BEHAVIORS

    group_scores = []
    for b in behaviors:
        weighted = sum(
            float(scores[idx]) * weight
            for idx, weight in b["ids"].items()
            if idx < len(scores)
        )
        group_scores.append(weighted)

    # Apply disambiguation rules
    if species == "dog":
        bark_score    = float(scores[70]) if 70 < len(scores) else 0.0
        whimper_score = float(scores[75]) if 75 < len(scores) else 0.0
        # If bark clearly dominates whimper, suppress Anxious (index 2) in favour of
        # Excited (index 0) or Alert (index 3)
        if bark_score > whimper_score * 2.5:
            group_scores[2] *= 0.3   # dampen Anxious
        # If whimper clearly dominates bark, suppress Excited (index 0)
        if whimper_score > bark_score * 2.0:
            group_scores[0] *= 0.3   # dampen Excited

    if species == "cat":
        caterwaul_score = float(scores[80]) if 80 < len(scores) else 0.0
        meow_score      = float(scores[78]) if 78 < len(scores) else 0.0
        # If caterwaul dominates, suppress Excited in favour of Anxious
        if caterwaul_score > meow_score * 1.5:
            group_scores[0] *= 0.4   # dampen Excited

    # Find best group above threshold
    best_idx   = -1
    best_score = -1.0
    for i, (b, s) in enumerate(zip(behaviors, group_scores)):
        if s >= b["min_score"] and s > best_score:
            best_score = s
            best_idx   = i

    if best_idx == -1:
        # All groups below threshold — return a neutral fallback
        return {
            "behavior":            "Observing",
            "behaviorDescription": "Not enough sound to determine behavior. Try a longer recording.",
            "behaviorEmoji":       "🔍",
            "behaviorColor":       "#9e9e9e",
            "behaviorConfidence":  0.0,
        }

    chosen = behaviors[best_idx]
    # Normalise confidence: best_score relative to sum of all group scores
    total = sum(s for s in group_scores if s > 0) or 1.0
    confidence = round(min((best_score / total) * 100, 99.0), 1)

    logger.info(
        "Behavior → %s (%.3f / %.3f = %.1f%%)  species=%s",
        chosen["name"], best_score, total, confidence, species,
    )

    return {
        "behavior":            chosen["name"],
        "behaviorDescription": chosen["description"],
        "behaviorEmoji":       chosen["emoji"],
        "behaviorColor":       chosen["color"],
        "behaviorConfidence":  confidence,
    }

# Calibration bias tuned on 440 real pet recordings (probe_dataset + tune_thresholds).
# Multiplying cat_prob by 0.8 before comparison balances cat/dog accuracy:
#   cat=83.1%  dog=65.9%  overall=75.7%
CAT_BIAS = 0.8

_interp      = None
_interp_lock = threading.Lock()


def get_interpreter():
    """Load TFLite interpreter once and cache it. Thread-safe."""
    global _interp
    with _interp_lock:
        if _interp is not None:
            return _interp
        if not YAMNET_PATH.exists():
            logger.error("yamnet.tflite not found at %s", YAMNET_PATH)
            return None
        try:
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                import tensorflow as tf
                interp = tf.lite.Interpreter(model_path=str(YAMNET_PATH))
                interp.allocate_tensors()
            _interp = interp
            logger.info("YAMNet TFLite loaded — input=%s",
                        interp.get_input_details()[0]["shape"])
            return _interp
        except Exception as e:
            logger.error("Failed to load YAMNet: %s", e)
            return None


def warm_up_yamnet():
    """Run one dummy inference at startup so the first real request is instant."""
    try:
        interp = get_interpreter()
        if interp is None:
            return
        inp_idx = interp.get_input_details()[0]["index"]
        out_idx = interp.get_output_details()[0]["index"]
        dummy   = np.zeros(YAMNET_FRAME, dtype=np.float32)
        interp.set_tensor(inp_idx, dummy)
        interp.invoke()
        interp.get_tensor(out_idx)
        logger.info("YAMNet warm-up complete — ready for requests")
    except Exception as e:
        logger.warning("YAMNet warm-up failed (non-fatal): %s", e)


def load_audio_mono_16k(file_path: str) -> np.ndarray:
    """
    Load any audio file as mono float32 at 16 kHz.
    Uses pydub for format conversion (m4a/mp3/ogg) then soundfile to read.
    Returns float32 numpy array normalised to [-1, 1], or None on failure.
    """
    ext       = Path(file_path).suffix.lower()
    wav_path  = file_path
    converted = False

    # Convert non-wav formats via pydub/ffmpeg
    if ext not in (".wav",):
        try:
            from pydub import AudioSegment
            logger.info("Converting %s → wav", ext)
            seg      = AudioSegment.from_file(file_path)
            wav_path = file_path + "_c.wav"
            seg.export(wav_path, format="wav")
            converted = True
        except Exception as e:
            logger.warning("pydub conversion failed (%s) — trying soundfile directly", e)
            wav_path = file_path

    try:
        import soundfile as sf
        data, sr = sf.read(wav_path, dtype="float32", always_2d=True)
        audio    = data.mean(axis=1)          # stereo → mono

        # Resample to 16 kHz
        if sr != YAMNET_SR:
            from scipy.signal import resample_poly
            from math import gcd
            g     = gcd(YAMNET_SR, sr)
            audio = resample_poly(audio, YAMNET_SR // g, sr // g).astype(np.float32)

        # Normalise amplitude
        peak = np.abs(audio).max()
        if peak > 1e-6:
            audio = audio / peak

        logger.info("Audio: %.2fs  %d samples @ %d Hz", len(audio) / YAMNET_SR, len(audio), YAMNET_SR)
        return audio.astype(np.float32)

    except Exception as e:
        logger.error("Audio load failed: %s", e)
        return None
    finally:
        if converted and wav_path != file_path:
            try:
                os.unlink(wav_path)
            except Exception:
                pass


def run_yamnet(audio: np.ndarray) -> np.ndarray:
    """
    Slide a YAMNET_FRAME window over the audio, run inference on each frame,
    return the mean scores across all frames. Shape: (521,).
    Uses a lock to prevent concurrent TFLite calls (interpreter is not thread-safe).
    """
    interp  = get_interpreter()
    if interp is None:
        return None

    inp_idx = interp.get_input_details()[0]["index"]
    out_idx = interp.get_output_details()[0]["index"]

    # Pad to at least one full frame
    if len(audio) < YAMNET_FRAME:
        audio = np.pad(audio, (0, YAMNET_FRAME - len(audio)))

    # Collect scores from up to 6 frames (covers ~6 seconds)
    hop        = YAMNET_FRAME // 2          # 50% overlap for better coverage
    all_scores = []
    start      = 0

    with _interp_lock:
        while start + YAMNET_FRAME <= len(audio) and len(all_scores) < 6:
            chunk = audio[start:start + YAMNET_FRAME].astype(np.float32)
            interp.set_tensor(inp_idx, chunk)
            interp.invoke()
            # Copy immediately — do NOT hold a reference outside the lock
            scores = interp.get_tensor(out_idx)[0].copy()
            all_scores.append(scores)
            start += hop

    return np.mean(all_scores, axis=0)   # (521,)


def classify(audio: np.ndarray) -> dict:
    """
    Run YAMNet and return a structured result dict including behavior detection.
    """
    scores = run_yamnet(audio)
    if scores is None:
        return None

    # Aggregate probabilities for cat and dog class groups
    cat_prob = float(sum(scores[i] for i in CAT_IDS if i < len(scores)))
    dog_prob = float(sum(scores[i] for i in DOG_IDS if i < len(scores)))
    pet_prob = cat_prob + dog_prob

    # Top-1 across all 521 classes (for logging / debugging)
    top_idx   = int(np.argmax(scores))
    top_score = float(scores[top_idx])

    # Silence / ambient detection
    silence_prob = float(sum(scores[i] for i in SILENCE_IDS if i < len(scores)))
    is_very_unclear = (pet_prob < 0.06) or (silence_prob > 0.25)
    is_uncertain    = (pet_prob < 0.18) and not is_very_unclear

    # Decide species — apply calibration bias
    if cat_prob * CAT_BIAS >= dog_prob:
        species    = "cat"
        confidence = round(cat_prob / max(pet_prob, 1e-9) * 100, 1)
    else:
        species    = "dog"
        confidence = round(dog_prob / max(pet_prob, 1e-9) * 100, 1)

    confidence = min(confidence, 99.0)

    logger.info(
        "YAMNet → %s %.1f%%  cat=%.1f%%  dog=%.1f%%  top=%d(%.1f%%)  unclear=%s",
        species, confidence, cat_prob * 100, dog_prob * 100,
        top_idx, top_score * 100, is_very_unclear,
    )

    # ── Behavior detection ────────────────────────────────────────────────────
    behavior_result = {}
    if not is_very_unclear:
        behavior_result = detect_behavior(scores, species)
    else:
        behavior_result = {
            "behavior":            "Unclear",
            "behaviorDescription": "Audio too quiet or ambient. Record again closer to your pet.",
            "behaviorEmoji":       "🔇",
            "behaviorColor":       "#9e9e9e",
            "behaviorConfidence":  0.0,
        }

    result = {
        "species":       species,
        "confidence":    confidence,
        "cat_prob":      round(min(cat_prob * 100, 100.0), 1),
        "dog_prob":      round(min(dog_prob * 100, 100.0), 1),
        "top_class_idx": top_idx,
        "top_score":     round(top_score * 100, 1),
        "isUncertain":   bool(is_uncertain),
        "isVeryUnclear": bool(is_very_unclear),
        "isMock":        False,
    }
    result.update(behavior_result)
    return result


# ─── Sound Analysis Endpoint ──────────────────────────────────────────────────

@app.route("/analyze", methods=["POST"])
def analyze_sound():
    """
    POST multipart/form-data  field: 'audio'
    Returns JSON: species, confidence, cat_prob, dog_prob,
                  isUncertain, isVeryUnclear, isMock
    """
    if "audio" not in request.files:
        return jsonify({"error": "No audio file. Send as multipart field 'audio'"}), 400

    audio_file = request.files["audio"]
    suffix     = Path(audio_file.filename or "audio.m4a").suffix or ".m4a"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        audio_file.save(tmp.name)
        tmp_path = tmp.name

    try:
        audio = load_audio_mono_16k(tmp_path)
        if audio is None:
            return jsonify({"error": "Could not decode audio file"}), 422

        result = classify(audio)
        if result is None:
            # YAMNet not available — return mock so app still works
            import random
            species = random.choice(["cat", "dog"])
            return jsonify({
                "species": species, "confidence": round(random.uniform(70, 90), 1),
                "cat_prob": 0, "dog_prob": 0,
                "isMock": True, "isUncertain": False, "isVeryUnclear": False,
            }), 200

        return jsonify(result), 200

    except Exception as e:
        logger.error("analyze_sound error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ─── Error handlers ───────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Route not found"}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405

@app.errorhandler(500)
def internal_error(e):
    logger.error("Internal error: %s", e)
    return jsonify({"error": "Internal server error"}), 500

# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Pre-load YAMNet in background — first request will be instant
    threading.Thread(target=warm_up_yamnet, daemon=True).start()
    port = int(os.getenv("PORT", 5000))
    logger.info("Starting PawTalk backend on port %d (YAMNet/TFLite)", port)
    app.run(host="0.0.0.0", port=port, debug=False)
