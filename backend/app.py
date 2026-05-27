import os
import json
import logging
import threading
import tempfile
import requests
import numpy as np
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

import firebase_admin
from firebase_admin import credentials, firestore as admin_firestore
from flask import Flask, request, jsonify
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ─── Register static ffmpeg so pydub can convert m4a/aac from phones ─────────
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
    from pydub import AudioSegment as _AudioSegment
    logger.info("static-ffmpeg + pydub ready")
except Exception as _e:
    logger.warning("static-ffmpeg/pydub setup: %s", _e)

app = Flask(__name__)
CORS(app)

# Allow audio uploads up to 25 MB (phone recordings can be large)
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024

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
    return jsonify({"status": "ok", "service": "PawTalk Backend", "model": "ONNX-Classifier", "version": "4.0"}), 200

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

# ─── ONNX Classifier ─────────────────────────────────────────────────────────
#
# Uses a trained MLP (pawtalk_classifier.onnx) to classify:
#   - Species: cat, dog, bird
#   - Emotion: happy_playful, content_calm, anxious_stressed,
#              attention_seeking, alert_warning, communicating
#
# Feature extraction: 40 MFCCs + delta + delta2 + ZCR + RMS + centroid +
#                     rolloff + chroma  (272-dim vector)
# ─────────────────────────────────────────────────────────────────────────────

AUDIO_SR  = 16000
N_MFCC    = 40
N_MELS    = 128
HOP       = 512
N_FFT     = 2048
MAX_SAMP  = 3 * AUDIO_SR

SPECIES  = ["cat", "dog"]
EMOTIONS = [
    "happy_playful",
    "content_calm",
    "anxious_stressed",
    "attention_seeking",
    "alert_warning",
    "communicating",
]

EMOTION_META = {
    "happy_playful":    {"label": "Happy & Playful",     "emoji": "😄", "color": "#4caf50"},
    "content_calm":     {"label": "Content & Calm",      "emoji": "😌", "color": "#4caf50"},
    "anxious_stressed": {"label": "Anxious or Stressed", "emoji": "😰", "color": "#f44336"},
    "attention_seeking":{"label": "Wants Attention",     "emoji": "🐾", "color": "#e91e63"},
    "alert_warning":    {"label": "Alert or Warning",    "emoji": "🚨", "color": "#ff9800"},
    "communicating":    {"label": "Communicating",       "emoji": "💬", "color": "#9c27b0"},
}

SPECIES_META = {
    "cat":  {"emoji": "🐱", "color": "#e64980", "label": "Cat Detected"},
    "dog":  {"emoji": "🐶", "color": "#ff9800", "label": "Dog Detected"},
}

# ─── Load ONNX model + scaler at startup ─────────────────────────────────────
_onnx_session  = None
_scaler_mean   = None
_scaler_scale  = None

def _load_onnx():
    global _onnx_session, _scaler_mean, _scaler_scale
    model_path  = Path(__file__).parent / "pawtalk_classifier.onnx"
    scaler_path = Path(__file__).parent / "scaler_params.json"
    try:
        import onnxruntime as ort
        _onnx_session = ort.InferenceSession(str(model_path))
        with open(scaler_path) as f:
            sc = json.load(f)
        _scaler_mean  = np.array(sc["mean"],  dtype=np.float32)
        _scaler_scale = np.array(sc["scale"], dtype=np.float32)
        logger.info("ONNX model loaded: %s", model_path)
    except Exception as e:
        logger.error("Failed to load ONNX model: %s", e)

_load_onnx()


def load_audio_mono_16k(file_path: str) -> np.ndarray:
    """Load any audio file as mono float32 at 16 kHz."""
    ext       = Path(file_path).suffix.lower()
    wav_path  = file_path
    converted = False

    if ext not in (".wav",):
        try:
            from pydub import AudioSegment
            logger.info("Converting %s -> wav", ext)
            seg      = AudioSegment.from_file(file_path)
            wav_path = file_path + "_c.wav"
            seg.export(wav_path, format="wav")
            converted = True
        except Exception as e:
            logger.warning("pydub conversion failed (%s) -- trying soundfile directly", e)
            wav_path = file_path

    try:
        import soundfile as sf
        data, sr = sf.read(wav_path, dtype="float32", always_2d=True)
        audio    = data.mean(axis=1)

        if sr != AUDIO_SR:
            from scipy.signal import resample_poly
            from math import gcd
            g     = gcd(AUDIO_SR, sr)
            audio = resample_poly(audio, AUDIO_SR // g, sr // g).astype(np.float32)

        peak = np.abs(audio).max()
        if peak > 1e-6:
            audio = audio / peak

        logger.info("Audio: %.2fs  %d samples @ %d Hz", len(audio) / AUDIO_SR, len(audio), AUDIO_SR)
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


def _extract_features(audio: np.ndarray) -> np.ndarray:
    """Extract 272-dim feature vector matching training pipeline."""
    try:
        import librosa
    except ImportError:
        raise RuntimeError("librosa not installed")

    audio = audio.astype(np.float32)
    if len(audio) < MAX_SAMP:
        audio = np.pad(audio, (0, MAX_SAMP - len(audio)))
    else:
        audio = audio[:MAX_SAMP]

    # Pre-emphasis
    audio = np.append(audio[0], audio[1:] - 0.97 * audio[:-1]).astype(np.float32)

    mfcc   = librosa.feature.mfcc(y=audio, sr=AUDIO_SR, n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP, n_mels=N_MELS)
    delta  = librosa.feature.delta(mfcc)
    delta2 = librosa.feature.delta(mfcc, order=2)

    zcr      = librosa.feature.zero_crossing_rate(audio, hop_length=HOP)
    rms      = librosa.feature.rms(y=audio, hop_length=HOP)
    centroid = librosa.feature.spectral_centroid(y=audio, sr=AUDIO_SR, hop_length=HOP)
    rolloff  = librosa.feature.spectral_rolloff(y=audio, sr=AUDIO_SR, hop_length=HOP)
    chroma   = librosa.feature.chroma_stft(y=audio, sr=AUDIO_SR, hop_length=HOP)

    return np.concatenate([
        mfcc.mean(1),   mfcc.std(1),
        delta.mean(1),  delta.std(1),
        delta2.mean(1), delta2.std(1),
        zcr.mean(1),    zcr.std(1),
        rms.mean(1),    rms.std(1),
        centroid.mean(1), centroid.std(1),
        rolloff.mean(1),  rolloff.std(1),
        chroma.mean(1),   chroma.std(1),
    ]).astype(np.float32)


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


def classify(audio: np.ndarray) -> dict:
    """Classify pet sound using ONNX model."""
    # Silence check
    rms = float(np.sqrt(np.mean(audio ** 2)))
    if rms < 0.008 or np.abs(audio).max() < 0.015:
        return {
            "species": "cat", "confidence": 50.0,
            "cat_prob": 33.3, "dog_prob": 33.3,
            "isUncertain": False, "isVeryUnclear": True, "isMock": False,
            "behavior": "Unclear",
            "behaviorDescription": "Audio too quiet or ambient. Record again closer to your pet.",
            "behaviorEmoji": "🔇", "behaviorColor": "#9e9e9e", "behaviorConfidence": 0.0,
        }

    if _onnx_session is None:
        logger.error("ONNX model not loaded — falling back to mock")
        return None

    try:
        feat = _extract_features(audio)
        feat_scaled = ((feat - _scaler_mean) / _scaler_scale).reshape(1, -1)

        sp_logits, em_logits = _onnx_session.run(
            None, {_onnx_session.get_inputs()[0].name: feat_scaled}
        )

        sp_probs = _softmax(sp_logits[0])
        em_probs = _softmax(em_logits[0])

        sp_idx   = int(sp_probs.argmax())
        em_idx   = int(em_probs.argmax())
        species  = SPECIES[sp_idx]
        emotion  = EMOTIONS[em_idx]

        sp_conf  = round(float(sp_probs[sp_idx]) * 100, 1)
        em_conf  = round(float(em_probs[em_idx]) * 100, 1)

        sp_meta  = SPECIES_META[species]
        em_meta  = EMOTION_META[emotion]

        # Per-species probabilities
        cat_prob  = round(float(sp_probs[0]) * 100, 1)
        dog_prob  = round(float(sp_probs[1]) * 100, 1)

        is_uncertain  = sp_conf < 60.0
        is_very_unclear = sp_conf < 40.0

        logger.info(
            "ONNX -> species=%s (%.1f%%)  emotion=%s (%.1f%%)",
            species, sp_conf, emotion, em_conf
        )

        return {
            "species":             species,
            "confidence":          sp_conf,
            "cat_prob":            cat_prob,
            "dog_prob":            dog_prob,
            "isUncertain":         bool(is_uncertain),
            "isVeryUnclear":       bool(is_very_unclear),
            "isMock":              False,
            "label":               sp_meta["label"],
            "emoji":               sp_meta["emoji"],
            "color":               sp_meta["color"],
            "behavior":            em_meta["label"],
            "behaviorDescription": _behavior_description(species, emotion),
            "behaviorEmoji":       em_meta["emoji"],
            "behaviorColor":       em_meta["color"],
            "behaviorConfidence":  em_conf,
        }

    except Exception as e:
        logger.error("ONNX inference error: %s", e, exc_info=True)
        return None


def _behavior_description(species: str, emotion: str) -> str:
    """Return a natural language description for the detected emotion."""
    desc = {
        ("cat",  "happy_playful"):     "Your cat is in a playful, energetic mood!",
        ("cat",  "content_calm"):      "Your cat is relaxed and content — possibly purring.",
        ("cat",  "anxious_stressed"):  "Your cat sounds distressed. Check their environment.",
        ("cat",  "attention_seeking"): "Your cat is calling out and wants your attention.",
        ("cat",  "alert_warning"):     "Your cat is alert and watching something closely.",
        ("cat",  "communicating"):     "Your cat is vocalizing — they have something to say!",
        ("dog",  "happy_playful"):     "Your dog is excited and ready to play!",
        ("dog",  "content_calm"):      "Your dog is calm and relaxed.",
        ("dog",  "anxious_stressed"):  "Your dog sounds uneasy. Try to comfort them.",
        ("dog",  "attention_seeking"): "Your dog is whining and wants your company.",
        ("dog",  "alert_warning"):     "Your dog is barking — alerting you to something nearby.",
        ("dog",  "communicating"):     "Your dog is vocalizing and trying to communicate.",
        ("bird", "happy_playful"):     "Your bird is singing happily — in a great mood!",
        ("bird", "content_calm"):      "Your bird is calm and comfortable in their environment.",
        ("bird", "anxious_stressed"):  "Your bird sounds stressed. Check their surroundings.",
        ("bird", "attention_seeking"): "Your bird wants interaction and attention from you.",
        ("bird", "alert_warning"):     "Your bird is alarmed — something has caught their attention.",
        ("bird", "communicating"):     "Your bird is chattering and being vocal!",
    }
    return desc.get((species, emotion), f"Your {species} is {emotion.replace('_', ' ')}.")


# ─── Sound Analysis Endpoint ──────────────────────────────────────────────────

@app.route("/analyze", methods=["POST"])
def analyze_sound():
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

@app.errorhandler(413)
def request_too_large(e):
    return jsonify({"error": "Audio file too large. Please record a shorter clip (max 25MB)."}), 413

@app.errorhandler(500)
def internal_error(e):
    logger.error("Internal error: %s", e)
    return jsonify({"error": "Internal server error"}), 500

# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    logger.info("Starting PawTalk backend on port %d (ONNX classifier)", port)
    app.run(host="0.0.0.0", port=port, debug=False)
