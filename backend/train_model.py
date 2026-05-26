"""
PawTalk ONNX Model Trainer
==========================
Trains a small MLP that classifies:
  - Species: cat, dog, bird
  - Emotion: happy_playful, content_calm, anxious_stressed,
             attention_seeking, alert_warning, communicating

Uses acoustically accurate synthetic audio generation + augmentation.
No external dataset download needed.

Output: backend/pawtalk_classifier.onnx  (~300 KB)
        backend/scaler_params.json

Run: python backend/train_model.py
"""

import os, sys, json
import numpy as np
from pathlib import Path

# ─── Config ───────────────────────────────────────────────────────────────────
SR         = 16000
DURATION   = 3.0
N_SAMPLES  = int(SR * DURATION)
N_MFCC     = 40
N_MELS     = 128
HOP        = 512
N_FFT      = 2048
EPOCHS     = 120
BATCH      = 64
LR         = 1e-3
AUGMENT    = 6       # augmentation multiplier

SPECIES  = ["cat", "dog", "bird"]
EMOTIONS = [
    "happy_playful",
    "content_calm",
    "anxious_stressed",
    "attention_seeking",
    "alert_warning",
    "communicating",
]

OUT_MODEL  = Path("backend/pawtalk_classifier.onnx")
OUT_SCALER = Path("backend/scaler_params.json")

# ─── Audio synthesis helpers ──────────────────────────────────────────────────

def _t():
    return np.linspace(0, DURATION, N_SAMPLES, dtype=np.float32)

def tone(freq, harmonics=4, noise=0.04, amp=0.8):
    """Harmonic tone — cat/bird like."""
    t = _t()
    s = np.zeros(N_SAMPLES, dtype=np.float32)
    for h in range(1, harmonics + 1):
        s += (amp / h) * np.sin(2 * np.pi * freq * h * t).astype(np.float32)
    s += np.random.normal(0, noise, N_SAMPLES).astype(np.float32)
    return s / (np.abs(s).max() + 1e-8)

def burst_tone(freq, harmonics=3, noise=0.05, burst_rate=3.0):
    """Repeated tonal bursts — meow / chirp."""
    t = _t()
    s = np.zeros(N_SAMPLES, dtype=np.float32)
    for h in range(1, harmonics + 1):
        s += (0.7 / h) * np.sin(2 * np.pi * freq * h * t).astype(np.float32)
    s += np.random.normal(0, noise, N_SAMPLES).astype(np.float32)
    # Burst envelope
    env = np.zeros(N_SAMPLES, dtype=np.float32)
    period = int(SR / burst_rate)
    on_len = int(period * 0.4)
    for i in range(0, N_SAMPLES, period):
        env[i:i + on_len] = 1.0
    return (s * env) / (np.abs(s * env).max() + 1e-8)

def noise_burst(freq_center, bw=400, burst_rate=2.5, amp=0.9):
    """Noisy bursts — dog bark."""
    from scipy.signal import butter, filtfilt
    s = np.random.normal(0, amp, N_SAMPLES).astype(np.float32)
    lo = max(20, freq_center - bw)
    hi = min(SR // 2 - 1, freq_center + bw)
    b, a = butter(4, [lo / (SR / 2), hi / (SR / 2)], btype='band')
    s = filtfilt(b, a, s).astype(np.float32)
    env = np.zeros(N_SAMPLES, dtype=np.float32)
    period = int(SR / burst_rate)
    on_len = int(period * 0.35)
    for i in range(0, N_SAMPLES, period):
        env[i:i + on_len] = np.random.uniform(0.6, 1.0)
    return (s * env) / (np.abs(s * env).max() + 1e-8)

def purr(freq=30, noise=0.02):
    """Cat purr — very low freq, smooth."""
    t = _t()
    s = np.zeros(N_SAMPLES, dtype=np.float32)
    for h in range(1, 8):
        s += (0.5 / h) * np.sin(2 * np.pi * freq * h * t).astype(np.float32)
    s += np.random.normal(0, noise, N_SAMPLES).astype(np.float32)
    return s / (np.abs(s).max() + 1e-8)

def whimper(freq=350, noise=0.12):
    """Dog whimper — mid freq, continuous, noisy."""
    t = _t()
    s = np.sin(2 * np.pi * freq * t).astype(np.float32)
    s += np.random.normal(0, noise, N_SAMPLES).astype(np.float32)
    # Slight tremolo
    tremolo = (1 + 0.3 * np.sin(2 * np.pi * 5 * t)).astype(np.float32)
    s = s * tremolo
    return s / (np.abs(s).max() + 1e-8)

def bird_song(base_freq=2000, n_notes=8):
    """Bird song — rapid high-freq tonal bursts."""
    t = _t()
    s = np.zeros(N_SAMPLES, dtype=np.float32)
    note_len = N_SAMPLES // n_notes
    for i in range(n_notes):
        f = base_freq * np.random.uniform(0.8, 1.4)
        start = i * note_len
        end   = start + int(note_len * 0.6)
        seg_t = np.linspace(0, (end - start) / SR, end - start)
        seg   = np.sin(2 * np.pi * f * seg_t).astype(np.float32)
        s[start:end] += seg
    s += np.random.normal(0, 0.02, N_SAMPLES).astype(np.float32)
    return s / (np.abs(s).max() + 1e-8)

# ─── Synthetic dataset definition ─────────────────────────────────────────────
# (species, emotion, generator_lambda, count)
CONFIGS = [
    # ── Cats ──────────────────────────────────────────────────────────────────
    ("cat", "communicating",     lambda: tone(np.random.uniform(400, 800), 4, 0.03),           80),
    ("cat", "communicating",     lambda: burst_tone(np.random.uniform(350, 750), 3, 0.04, 1.5),60),
    ("cat", "happy_playful",     lambda: burst_tone(np.random.uniform(600, 1100), 3, 0.04, 3), 70),
    ("cat", "happy_playful",     lambda: tone(np.random.uniform(700, 1200), 3, 0.05),          50),
    ("cat", "content_calm",      lambda: purr(np.random.uniform(20, 45), 0.01),                80),
    ("cat", "content_calm",      lambda: tone(np.random.uniform(200, 400), 6, 0.01),           50),
    ("cat", "anxious_stressed",  lambda: tone(np.random.uniform(900, 1500), 2, 0.10),          70),
    ("cat", "anxious_stressed",  lambda: burst_tone(np.random.uniform(800, 1400), 2, 0.09, 4), 50),
    ("cat", "attention_seeking", lambda: burst_tone(np.random.uniform(400, 750), 4, 0.05, 2),  70),
    ("cat", "attention_seeking", lambda: tone(np.random.uniform(350, 700), 4, 0.06),           50),
    ("cat", "alert_warning",     lambda: tone(np.random.uniform(200, 500), 3, 0.07),           60),
    ("cat", "alert_warning",     lambda: burst_tone(np.random.uniform(300, 600), 3, 0.06, 2),  40),

    # ── Dogs ──────────────────────────────────────────────────────────────────
    ("dog", "alert_warning",     lambda: noise_burst(np.random.uniform(200, 500), 400, 2.5),   90),
    ("dog", "alert_warning",     lambda: noise_burst(np.random.uniform(150, 400), 350, 3.0),   60),
    ("dog", "happy_playful",     lambda: noise_burst(np.random.uniform(300, 600), 300, 4.0),   80),
    ("dog", "happy_playful",     lambda: noise_burst(np.random.uniform(250, 550), 350, 3.5),   50),
    ("dog", "anxious_stressed",  lambda: whimper(np.random.uniform(300, 600), 0.15),           70),
    ("dog", "anxious_stressed",  lambda: tone(np.random.uniform(250, 500), 2, 0.18),           50),
    ("dog", "attention_seeking", lambda: whimper(np.random.uniform(200, 450), 0.12),           70),
    ("dog", "attention_seeking", lambda: tone(np.random.uniform(180, 380), 2, 0.14),           50),
    ("dog", "content_calm",      lambda: tone(np.random.uniform(80, 200), 3, 0.02),            60),
    ("dog", "content_calm",      lambda: noise_burst(np.random.uniform(100, 250), 150, 0.5),   40),
    ("dog", "communicating",     lambda: noise_burst(np.random.uniform(150, 350), 250, 1.5),   60),
    ("dog", "communicating",     lambda: noise_burst(np.random.uniform(200, 400), 300, 2.0),   40),

    # ── Birds ─────────────────────────────────────────────────────────────────
    ("bird", "happy_playful",    lambda: bird_song(np.random.uniform(2000, 4000), 10),         80),
    ("bird", "happy_playful",    lambda: burst_tone(np.random.uniform(1800, 3500), 5, 0.02, 6),60),
    ("bird", "communicating",    lambda: bird_song(np.random.uniform(1500, 3000), 7),          70),
    ("bird", "communicating",    lambda: burst_tone(np.random.uniform(1200, 2800), 4, 0.03, 4),60),
    ("bird", "alert_warning",    lambda: burst_tone(np.random.uniform(2500, 5000), 2, 0.06, 8),70),
    ("bird", "alert_warning",    lambda: tone(np.random.uniform(2000, 4500), 2, 0.07),         50),
    ("bird", "content_calm",     lambda: bird_song(np.random.uniform(800, 2000), 5),           60),
    ("bird", "content_calm",     lambda: tone(np.random.uniform(1000, 2500), 6, 0.01),         50),
    ("bird", "anxious_stressed", lambda: burst_tone(np.random.uniform(3000, 6000), 2, 0.09, 9),60),
    ("bird", "anxious_stressed", lambda: tone(np.random.uniform(2500, 5500), 2, 0.10),         40),
    ("bird", "attention_seeking",lambda: burst_tone(np.random.uniform(1500, 3000), 3, 0.04, 5),60),
    ("bird", "attention_seeking",lambda: bird_song(np.random.uniform(1200, 2500), 6),          40),
]

# ─── Feature extraction ───────────────────────────────────────────────────────

def extract_features(audio: np.ndarray) -> np.ndarray:
    import librosa
    audio = audio.astype(np.float32)
    if len(audio) < N_SAMPLES:
        audio = np.pad(audio, (0, N_SAMPLES - len(audio)))
    else:
        audio = audio[:N_SAMPLES]

    # Pre-emphasis
    audio = np.append(audio[0], audio[1:] - 0.97 * audio[:-1]).astype(np.float32)

    mfcc   = librosa.feature.mfcc(y=audio, sr=SR, n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP, n_mels=N_MELS)
    delta  = librosa.feature.delta(mfcc)
    delta2 = librosa.feature.delta(mfcc, order=2)

    zcr      = librosa.feature.zero_crossing_rate(audio, hop_length=HOP)
    rms      = librosa.feature.rms(y=audio, hop_length=HOP)
    centroid = librosa.feature.spectral_centroid(y=audio, sr=SR, hop_length=HOP)
    rolloff  = librosa.feature.spectral_rolloff(y=audio, sr=SR, hop_length=HOP)
    chroma   = librosa.feature.chroma_stft(y=audio, sr=SR, hop_length=HOP)

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

# ─── Dataset generation ───────────────────────────────────────────────────────

def build_dataset():
    print("🔧 Generating synthetic audio samples...")
    X, ys, ye = [], [], []
    total = sum(c for *_, c in CONFIGS)
    done  = 0

    for species, emotion, gen_fn, count in CONFIGS:
        si = SPECIES.index(species)
        ei = EMOTIONS.index(emotion)
        for _ in range(count):
            try:
                audio = gen_fn()
                feat  = extract_features(audio)
                X.append(feat)
                ys.append(si)
                ye.append(ei)
            except Exception as e:
                pass
            done += 1
            if done % 100 == 0:
                print(f"   {done}/{total} samples generated...", end="\r")

    print(f"   {done}/{total} samples generated.   ")
    return np.array(X, np.float32), np.array(ys), np.array(ye)


def augment(X, ys, ye, factor=AUGMENT):
    """Augment with noise + scale perturbation."""
    Xa, ysa, yea = [X], [ys], [ye]
    for _ in range(factor - 1):
        noise = np.random.normal(0, 0.025, X.shape).astype(np.float32)
        scale = np.random.uniform(0.88, 1.12, (len(X), 1)).astype(np.float32)
        Xa.append((X * scale + noise).astype(np.float32))
        ysa.append(ys); yea.append(ye)
    return np.vstack(Xa), np.concatenate(ysa), np.concatenate(yea)

# ─── Training ─────────────────────────────────────────────────────────────────

def train(X, ys, ye):
    import torch, torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split

    print(f"\n🧠 Training on {len(X)} samples  |  features={X.shape[1]}")

    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X).astype(np.float32)

    # Save scaler
    with open(OUT_SCALER, "w") as f:
        json.dump({"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()}, f)
    print(f"   Saved {OUT_SCALER}")

    X_tr, X_val, ys_tr, ys_val, ye_tr, ye_val = train_test_split(
        X_scaled, ys, ye, test_size=0.15, random_state=42, stratify=ys
    )

    def T(a, long=False):
        return torch.tensor(a, dtype=torch.long if long else torch.float32)

    tr_dl = DataLoader(TensorDataset(T(X_tr), T(ys_tr, True), T(ye_tr, True)),
                       batch_size=BATCH, shuffle=True, drop_last=True)
    va_dl = DataLoader(TensorDataset(T(X_val), T(ys_val, True), T(ye_val, True)),
                       batch_size=BATCH)

    dim = X.shape[1]

    class Net(nn.Module):
        def __init__(self):
            super().__init__()
            self.shared = nn.Sequential(
                nn.Linear(dim, 512), nn.BatchNorm1d(512), nn.GELU(), nn.Dropout(0.3),
                nn.Linear(512, 256), nn.BatchNorm1d(256), nn.GELU(), nn.Dropout(0.25),
                nn.Linear(256, 128), nn.BatchNorm1d(128), nn.GELU(), nn.Dropout(0.2),
                nn.Linear(128, 64),  nn.GELU(),
            )
            self.sp_head = nn.Linear(64, len(SPECIES))
            self.em_head = nn.Linear(64, len(EMOTIONS))

        def forward(self, x):
            h = self.shared(x)
            return self.sp_head(h), self.em_head(h)

    model   = Net()
    opt     = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=1e-4)
    sched   = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=LR, epochs=EPOCHS,
                                                   steps_per_epoch=len(tr_dl))
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)

    best_acc, best_state = 0.0, None

    for epoch in range(1, EPOCHS + 1):
        model.train()
        for xb, sb, eb in tr_dl:
            opt.zero_grad()
            sp, em = model(xb)
            loss = loss_fn(sp, sb) + 0.8 * loss_fn(em, eb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()

        model.eval()
        sp_c = em_c = tot = 0
        with torch.no_grad():
            for xb, sb, eb in va_dl:
                sp, em = model(xb)
                sp_c += (sp.argmax(1) == sb).sum().item()
                em_c += (em.argmax(1) == eb).sum().item()
                tot  += len(sb)

        sp_acc = sp_c / tot * 100
        em_acc = em_c / tot * 100
        avg    = (sp_acc + em_acc) / 2

        if avg > best_acc:
            best_acc  = avg
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

        if epoch % 20 == 0 or epoch == 1:
            print(f"   Epoch {epoch:3d}/{EPOCHS}  species={sp_acc:.1f}%  emotion={em_acc:.1f}%  avg={avg:.1f}%")

    print(f"\n✅ Best avg accuracy: {best_acc:.1f}%")
    model.load_state_dict(best_state)

    # Export ONNX (use opset 12 for max compatibility without onnxscript)
    model.eval()
    dummy = torch.zeros(1, dim)
    torch.onnx.export(
        model, dummy, str(OUT_MODEL),
        input_names=["features"],
        output_names=["species_logits", "emotion_logits"],
        dynamic_axes={"features": {0: "batch"}},
        opset_version=12,
    )
    kb = OUT_MODEL.stat().st_size / 1024
    print(f"✅ Exported: {OUT_MODEL}  ({kb:.0f} KB)")
    return best_acc


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  PawTalk ONNX Model Trainer  (cat / dog / bird + emotions)")
    print("=" * 60)

    try:
        import librosa, torch, sklearn, onnx
        print("✅ All dependencies ready\n")
    except ImportError as e:
        print(f"❌ Missing: {e}")
        sys.exit(1)

    np.random.seed(42)

    # 1. Generate
    X, ys, ye = build_dataset()

    # 2. Augment
    print(f"\n🔀 Augmenting {len(X)} → ", end="")
    X, ys, ye = augment(X, ys, ye)
    print(f"{len(X)} samples")

    # 3. Print distribution
    print("\n📊 Class distribution:")
    for i, s in enumerate(SPECIES):
        n = (ys == i).sum()
        print(f"   {s:6s}: {n:5d} samples")

    # 4. Train + export
    acc = train(X, ys, ye)

    print("\n🎉 Done!")
    print(f"   {OUT_MODEL}")
    print(f"   {OUT_SCALER}")
    print(f"   Final accuracy: {acc:.1f}%")


if __name__ == "__main__":
    main()
