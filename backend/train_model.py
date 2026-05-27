"""
PawTalk ONNX Model Trainer  v5.0  â€” Real Audio (ESC-50)
========================================================
Downloads the ESC-50 dataset (real environmental sounds) and trains
an MLP classifier on MFCC features.

Species: cat, dog  (bird removed â€” ESC-50 has limited bird data)
Emotions: kept from v4 but trained on species only; emotion head
          uses the same synthetic approach as before since ESC-50
          doesn't have emotion labels.

Run: python backend/train_model.py
"""

import os, sys, json, zipfile, urllib.request
import numpy as np
from pathlib import Path

# â”€â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SR        = 16000
DURATION  = 3.0
N_SAMPLES = int(SR * DURATION)
N_MFCC    = 40
N_MELS    = 128
HOP       = 512
N_FFT     = 2048
EPOCHS    = 250
BATCH     = 32
LR        = 3e-4
AUGMENT   = 16  # doubled augmentation for higher confidence

SPECIES  = ["cat", "dog", "bird"]
EMOTIONS = [
    "happy_playful",
    "content_calm",
    "anxious_stressed",
    "attention_seeking",
    "alert_warning",
    "communicating",
]

OUT_MODEL  = Path(__file__).parent / "pawtalk_classifier.onnx"
OUT_SCALER = Path(__file__).parent / "scaler_params.json"
DATA_DIR   = Path(__file__).parent / "real_data"

# ESC-50 class IDs: cat=5, dog=0
ESC50_CAT = 5
ESC50_DOG = 0

# â”€â”€â”€ Feature extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

# â”€â”€â”€ Download ESC-50 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def download_esc50():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    cat_dir = DATA_DIR / "cat"
    dog_dir = DATA_DIR / "dog"
    cat_dir.mkdir(exist_ok=True)
    dog_dir.mkdir(exist_ok=True)

    existing_cat = list(cat_dir.glob("*.wav"))
    existing_dog = list(dog_dir.glob("*.wav"))

    if len(existing_cat) >= 20 and len(existing_dog) >= 20:
        print(f"âœ… Already have {len(existing_cat)} cat + {len(existing_dog)} dog files")
        return existing_cat, existing_dog

    zip_path = DATA_DIR / "ESC-50.zip"
    if not zip_path.exists():
        print("ðŸ“¥ Downloading ESC-50 dataset (~600 MB)...")
        url = "https://github.com/karoldvl/ESC-50/archive/master.zip"
        try:
            urllib.request.urlretrieve(url, str(zip_path))
            print(f"   Downloaded: {zip_path.stat().st_size / 1e6:.1f} MB")
        except Exception as e:
            print(f"âŒ Download failed: {e}")
            return [], []

    print("ðŸ“¦ Extracting cat and dog audio files...")
    extracted = 0
    try:
        with zipfile.ZipFile(str(zip_path), "r") as z:
            for member in z.namelist():
                if not member.endswith(".wav"):
                    continue
                fname = Path(member).name
                parts = fname.replace(".wav", "").split("-")
                if len(parts) < 4:
                    continue
                try:
                    target = int(parts[3])
                except ValueError:
                    continue
                if target == ESC50_CAT:
                    dest = cat_dir / fname
                    if not dest.exists():
                        with z.open(member) as src, open(str(dest), "wb") as dst:
                            dst.write(src.read())
                        extracted += 1
                elif target == ESC50_DOG:
                    dest = dog_dir / fname
                    if not dest.exists():
                        with z.open(member) as src, open(str(dest), "wb") as dst:
                            dst.write(src.read())
                        extracted += 1
        print(f"   Extracted {extracted} files")
    except Exception as e:
        print(f"âŒ Extraction failed: {e}")
        return [], []

    cat_files = list(cat_dir.glob("*.wav"))
    dog_files = list(dog_dir.glob("*.wav"))
    print(f"   Cat: {len(cat_files)} files  |  Dog: {len(dog_files)} files")
    return cat_files, dog_files

# â”€â”€â”€ Load audio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def load_audio(path) -> np.ndarray:
    import librosa
    try:
        y, sr = librosa.load(str(path), sr=SR, mono=True, duration=DURATION)
        if len(y) < SR * 0.3:
            return None
        peak = np.abs(y).max()
        if peak > 1e-6:
            y = y / peak
        return y.astype(np.float32)
    except Exception as e:
        print(f"   Skip {Path(path).name}: {e}")
        return None

# â”€â”€â”€ Augmentation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def augment_audio(y: np.ndarray, n: int = AUGMENT) -> list:
    import librosa
    results = [y]
    rng = np.random.default_rng()

    for i in range(n - 1):
        aug = y.copy()

        # Random noise
        if rng.random() > 0.2:
            aug = aug + rng.normal(0, rng.uniform(0.003, 0.04), len(aug)).astype(np.float32)

        # Random gain
        aug = aug * rng.uniform(0.5, 1.5)

        # Time stretch
        if rng.random() > 0.4:
            try:
                rate = rng.uniform(0.80, 1.20)
                aug = librosa.effects.time_stretch(aug, rate=rate)
            except Exception:
                pass

        # Pitch shift
        if rng.random() > 0.4:
            try:
                steps = rng.uniform(-4, 4)
                aug = librosa.effects.pitch_shift(aug, sr=SR, n_steps=steps)
            except Exception:
                pass

        # Random time shift
        if rng.random() > 0.5:
            shift = int(rng.uniform(-SR * 0.5, SR * 0.5))
            aug = np.roll(aug, shift)

        # Random frequency masking via bandpass
        if rng.random() > 0.6:
            try:
                from scipy.signal import butter, filtfilt
                lo = rng.uniform(100, 500)
                hi = rng.uniform(2000, 7000)
                b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], btype='band')
                aug = filtfilt(b, a, aug).astype(np.float32)
            except Exception:
                pass

        # Pad/trim
        if len(aug) < N_SAMPLES:
            aug = np.pad(aug, (0, N_SAMPLES - len(aug)))
        else:
            aug = aug[:N_SAMPLES]

        peak = np.abs(aug).max()
        if peak > 1e-6:
            aug = aug / peak

        results.append(aug.astype(np.float32))

    return results

# â”€â”€â”€ Synthetic bird data (ESC-50 doesn't have enough bird clips) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _t():
    return np.linspace(0, DURATION, N_SAMPLES, dtype=np.float32)

def bird_song(base_freq=2000, n_notes=8):
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

def burst_tone(freq, harmonics=3, noise=0.05, burst_rate=3.0):
    t = _t()
    s = np.zeros(N_SAMPLES, dtype=np.float32)
    for h in range(1, harmonics + 1):
        s += (0.7 / h) * np.sin(2 * np.pi * freq * h * t).astype(np.float32)
    s += np.random.normal(0, noise, N_SAMPLES).astype(np.float32)
    env = np.zeros(N_SAMPLES, dtype=np.float32)
    period = int(SR / burst_rate)
    on_len = int(period * 0.4)
    for i in range(0, N_SAMPLES, period):
        env[i:i + on_len] = 1.0
    return (s * env) / (np.abs(s * env).max() + 1e-8)

BIRD_CONFIGS = [
    lambda: bird_song(np.random.uniform(2000, 4000), 10),
    lambda: burst_tone(np.random.uniform(1800, 3500), 5, 0.02, 6),
    lambda: bird_song(np.random.uniform(1500, 3000), 7),
    lambda: burst_tone(np.random.uniform(1200, 2800), 4, 0.03, 4),
    lambda: burst_tone(np.random.uniform(2500, 5000), 2, 0.06, 8),
    lambda: bird_song(np.random.uniform(800, 2000), 5),
]

# â”€â”€â”€ Build dataset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def build_dataset(cat_files, dog_files):
    print("\nðŸ”§ Building dataset from real audio + augmentation...")
    X, ys, ye = [], [], []

    # â”€â”€ Real cat audio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    print(f"   Loading {len(cat_files)} cat files...")
    cat_loaded = 0
    for f in cat_files:
        audio = load_audio(f)
        if audio is None:
            continue
        for aug in augment_audio(audio):
            feat = extract_features(aug)
            X.append(feat)
            ys.append(SPECIES.index("cat"))
            ye.append(EMOTIONS.index("communicating"))  # default emotion
        cat_loaded += 1
    print(f"   Cat: {cat_loaded} files â†’ {cat_loaded * AUGMENT} samples")

    # â”€â”€ Real dog audio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    print(f"   Loading {len(dog_files)} dog files...")
    dog_loaded = 0
    for f in dog_files:
        audio = load_audio(f)
        if audio is None:
            continue
        for aug in augment_audio(audio):
            feat = extract_features(aug)
            X.append(feat)
            ys.append(SPECIES.index("dog"))
            ye.append(EMOTIONS.index("alert_warning"))  # default emotion
        dog_loaded += 1
    print(f"   Dog: {dog_loaded} files â†’ {dog_loaded * AUGMENT} samples")

    # â”€â”€ Synthetic bird audio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    print("   Generating synthetic bird samples...")
    bird_count = 0
    np.random.seed(42)
    for _ in range(200):
        gen = BIRD_CONFIGS[np.random.randint(len(BIRD_CONFIGS))]
        audio = gen()
        feat = extract_features(audio)
        X.append(feat)
        ys.append(SPECIES.index("bird"))
        ye.append(EMOTIONS.index("happy_playful"))
        bird_count += 1
    print(f"   Bird: {bird_count} synthetic samples")

    return np.array(X, np.float32), np.array(ys), np.array(ye)

# â”€â”€â”€ Training â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def train(X, ys, ye):
    import torch, torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split

    print(f"\nðŸ§  Training on {len(X)} samples  |  features={X.shape[1]}")
    print(f"   Species distribution:")
    for i, s in enumerate(SPECIES):
        n = (ys == i).sum()
        print(f"     {s}: {n} samples")

    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X).astype(np.float32)

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
                nn.Linear(dim, 1024), nn.BatchNorm1d(1024), nn.GELU(), nn.Dropout(0.3),
                nn.Linear(1024, 512), nn.BatchNorm1d(512), nn.GELU(), nn.Dropout(0.25),
                nn.Linear(512, 256), nn.BatchNorm1d(256), nn.GELU(), nn.Dropout(0.2),
                nn.Linear(256, 128), nn.BatchNorm1d(128), nn.GELU(), nn.Dropout(0.15),
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
            loss = loss_fn(sp, sb) + 0.5 * loss_fn(em, eb)
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

    print(f"\nâœ… Best avg accuracy: {best_acc:.1f}%")
    model.load_state_dict(best_state)

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
    print(f"âœ… Exported: {OUT_MODEL}  ({kb:.0f} KB)")
    return best_acc

# â”€â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def main():
    print("=" * 60)
    print("  PawTalk ONNX Trainer v5.0 â€” Real Audio (ESC-50)")
    print("=" * 60)

    try:
        import librosa, torch, sklearn, onnx
        print("âœ… All dependencies ready\n")
    except ImportError as e:
        print(f"âŒ Missing: {e}")
        sys.exit(1)

    np.random.seed(42)

    # 1. Download real audio
    cat_files, dog_files = download_esc50()

    if len(cat_files) < 5 or len(dog_files) < 5:
        print("âŒ Not enough real audio files. Check your internet connection.")
        sys.exit(1)

    # 2. Build dataset
    X, ys, ye = build_dataset(cat_files, dog_files)

    # 3. Train + export
    acc = train(X, ys, ye)

    print("\nðŸŽ‰ Done!")
    print(f"   {OUT_MODEL}")
    print(f"   {OUT_SCALER}")
    print(f"   Final accuracy: {acc:.1f}%")
    print("\nâš ï¸  Remember to commit and push the new .onnx and .onnx.data files!")


if __name__ == "__main__":
    main()

