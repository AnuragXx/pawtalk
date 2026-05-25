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
    return jsonify({"status": "ok", "service": "PawTalk Backend", "model": "DSP-Classifier", "version": "2.0"}), 200

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

# ─── Pure-numpy DSP Audio Classifier ─────────────────────────────────────────
#
# Classifies cat vs dog and detects behavior using acoustic features:
#   - Spectral centroid, rolloff, pitch (autocorrelation)
#   - Zero-crossing rate, RMS energy, burstiness
#
# No TFLite / TensorFlow needed — runs in <10 MB RAM on Railway free tier.
# ─────────────────────────────────────────────────────────────────────────────

AUDIO_SR = 16000


def load_audio_mono_16k(file_path: str) -> np.ndarray:
    """Load any audio file as mono float32 at 16 kHz."""
    ext       = Path(file_path).suffix.lower()
    wav_path  = file_path
    converted = False

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


def extract_features(audio: np.ndarray, sr: int = AUDIO_SR) -> dict:
    """Extract acoustic features from mono float32 audio."""
    if len(audio) == 0:
        return None

    rms  = float(np.sqrt(np.mean(audio ** 2)))
    peak = float(np.abs(audio).max())
    zcr  = float(np.mean(np.abs(np.diff(np.sign(audio)))) / 2)

    frame_size = min(2048, len(audio))
    hop        = frame_size // 2
    frames     = [audio[s:s + frame_size] for s in range(0, len(audio) - frame_size, hop)]
    if not frames:
        frames = [np.pad(audio, (0, max(0, frame_size - len(audio))))]

    centroids, rolloffs, pitches, energies = [], [], [], []

    for frame in frames[:20]:
        windowed = frame * np.hanning(len(frame))
        spectrum = np.abs(np.fft.rfft(windowed))
        freqs    = np.fft.rfftfreq(len(frame), 1.0 / sr)
        spec_sum = spectrum.sum()

        if spec_sum > 1e-10:
            centroids.append(float(np.sum(freqs * spectrum) / spec_sum))
            cumsum      = np.cumsum(spectrum)
            ridx        = np.searchsorted(cumsum, 0.85 * cumsum[-1])
            rolloffs.append(float(freqs[min(ridx, len(freqs) - 1)]))

        # Pitch via autocorrelation
        corr    = np.correlate(frame, frame, mode='full')[len(frame) - 1:]
        min_lag = max(1, int(sr / 1200))
        max_lag = int(sr / 80)
        if max_lag < len(corr):
            lag = min_lag + int(np.argmax(corr[min_lag:max_lag]))
            pitches.append(float(sr / lag))

        energies.append(float(np.sqrt(np.mean(frame ** 2))))

    mean_centroid  = float(np.mean(centroids)) if centroids else 0.0
    mean_pitch     = float(np.mean(pitches))   if pitches   else 0.0
    burstiness     = float(np.std(energies) / (np.mean(energies) + 1e-9)) if energies else 0.0

    logger.info(
        "Features: rms=%.4f zcr=%.4f centroid=%.0f pitch=%.0f burst=%.2f",
        rms, zcr, mean_centroid, mean_pitch, burstiness
    )
    return {"rms": rms, "peak": peak, "zcr": zcr,
            "centroid": mean_centroid, "pitch": mean_pitch, "burstiness": burstiness}


def classify_species(feat: dict):
    """Classify cat vs dog. Returns (species, confidence, cat_pct, dog_pct, is_very_unclear, is_uncertain)."""
    if feat["rms"] < 0.01 or feat["peak"] < 0.02:
        return "cat", 50.0, 50.0, 50.0, True, False

    cat_score = dog_score = 0.0
    p, c, b, z = feat["pitch"], feat["centroid"], feat["burstiness"], feat["zcr"]

    # Pitch
    if 300 <= p <= 900:   cat_score += 3.0
    elif 80 <= p < 300:   dog_score += 3.0
    elif 900 < p <= 1500: cat_score += 1.5
    elif 0 < p < 80:      dog_score += 1.5

    # Spectral centroid
    if 800 <= c <= 3000:  cat_score += 2.0
    elif 300 <= c < 800:  dog_score += 2.0
    elif c > 3000:        cat_score += 1.0
    elif 0 < c < 300:     dog_score += 1.0

    # Burstiness
    if b > 0.8:   dog_score += 2.0
    elif b < 0.4: cat_score += 1.5

    # ZCR
    if z > 0.15:  dog_score += 1.0
    elif z < 0.08: cat_score += 1.0

    total = cat_score + dog_score
    if total < 1.0:
        return "cat", 50.0, 50.0, 50.0, False, True

    cat_pct = round((cat_score / total) * 100, 1)
    dog_pct = round((dog_score / total) * 100, 1)

    if cat_score >= dog_score:
        species, confidence = "cat", min(cat_pct, 99.0)
    else:
        species, confidence = "dog", min(dog_pct, 99.0)

    logger.info("DSP → %s %.1f%%  cat=%.2f  dog=%.2f", species, confidence, cat_score, dog_score)
    return species, confidence, cat_pct, dog_pct, feat["rms"] < 0.02, confidence < 60


def detect_behavior_dsp(feat: dict, species: str) -> dict:
    """Detect pet behavior from acoustic features."""
    p, e, b, z = feat["pitch"], feat["rms"], feat["burstiness"], feat["zcr"]

    if species == "cat":
        if e < 0.05 and p < 400 and b < 0.3:
            return {"behavior": "Content", "behaviorDescription": "Your cat seems calm and comfortable.",
                    "behaviorEmoji": "😻", "behaviorColor": "#4caf50", "behaviorConfidence": 75.0}
        if p > 700 and e > 0.15:
            return {"behavior": "Anxious or Stressed", "behaviorDescription": "Your cat sounds distressed. Check their environment.",
                    "behaviorEmoji": "😿", "behaviorColor": "#f44336", "behaviorConfidence": 72.0}
        if p > 500 and e > 0.08 and b < 0.6:
            return {"behavior": "Excited and Playful", "behaviorDescription": "Your cat is energetic and in a playful mood.",
                    "behaviorEmoji": "😸", "behaviorColor": "#4caf50", "behaviorConfidence": 70.0}
        if 300 <= p <= 700 and e > 0.05:
            return {"behavior": "Wants Attention", "behaviorDescription": "Your cat is calling out and wants to be noticed.",
                    "behaviorEmoji": "🐾", "behaviorColor": "#e91e63", "behaviorConfidence": 68.0}
        return {"behavior": "Alert", "behaviorDescription": "Your cat is paying close attention to something.",
                "behaviorEmoji": "👀", "behaviorColor": "#ff9800", "behaviorConfidence": 60.0}
    else:
        if e < 0.04 and b < 0.3:
            return {"behavior": "Content", "behaviorDescription": "Your dog is relaxed and at ease.",
                    "behaviorEmoji": "😊", "behaviorColor": "#4caf50", "behaviorConfidence": 75.0}
        if b > 0.8 and e > 0.12:
            return {"behavior": "Alert or Warning", "behaviorDescription": "Your dog is alerting you to something nearby.",
                    "behaviorEmoji": "🚨", "behaviorColor": "#ff9800", "behaviorConfidence": 78.0}
        if b > 0.6 and e > 0.08:
            return {"behavior": "Excited and Playful", "behaviorDescription": "Your dog is full of energy and ready to play!",
                    "behaviorEmoji": "🐕", "behaviorColor": "#4caf50", "behaviorConfidence": 72.0}
        if b < 0.4 and z > 0.12 and e < 0.1:
            return {"behavior": "Anxious or Stressed", "behaviorDescription": "Your dog sounds uneasy. Try to comfort them.",
                    "behaviorEmoji": "😰", "behaviorColor": "#f44336", "behaviorConfidence": 70.0}
        if b < 0.5 and e > 0.04:
            return {"behavior": "Wants Attention", "behaviorDescription": "Your dog is whimpering and seeking your company.",
                    "behaviorEmoji": "🐾", "behaviorColor": "#e91e63", "behaviorConfidence": 65.0}
        return {"behavior": "Alert or Warning", "behaviorDescription": "Your dog is alerting you to something nearby.",
                "behaviorEmoji": "🚨", "behaviorColor": "#ff9800", "behaviorConfidence": 60.0}


def classify(audio: np.ndarray) -> dict:
    """Classify pet sound using pure numpy DSP."""
    feat = extract_features(audio)
    if feat is None:
        return None

    species, confidence, cat_pct, dog_pct, is_very_unclear, is_uncertain = classify_species(feat)

    if not is_very_unclear:
        behavior_result = detect_behavior_dsp(feat, species)
    else:
        behavior_result = {
            "behavior": "Unclear",
            "behaviorDescription": "Audio too quiet or ambient. Record again closer to your pet.",
            "behaviorEmoji": "🔇", "behaviorColor": "#9e9e9e", "behaviorConfidence": 0.0,
        }

    result = {
        "species": species, "confidence": confidence,
        "cat_prob": cat_pct, "dog_prob": dog_pct,
        "isUncertain": bool(is_uncertain), "isVeryUnclear": bool(is_very_unclear),
        "isMock": False,
    }
    result.update(behavior_result)
    return result


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

@app.errorhandler(500)
def internal_error(e):
    logger.error("Internal error: %s", e)
    return jsonify({"error": "Internal server error"}), 500

# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    logger.info("Starting PawTalk backend on port %d (DSP classifier)", port)
    app.run(host="0.0.0.0", port=port, debug=False)
