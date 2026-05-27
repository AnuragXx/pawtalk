"""
PawTalk ONNX Model Trainer  v6.0  -- Cat vs Dog Only
=====================================================
Uses ESC-50 real audio (40 cat + 40 dog files).
Binary classifier: cat=0, dog=1.
Removes bird entirely for maximum cat/dog accuracy.

Run: python backend/train_model.py
"""

import os, sys, json, zipfile, urllib.request
import numpy as np
from pathlib import Path

# --- Config -------------------------------------------------------------------
SR        = 16000
DURATION  = 3.0
N_SAMPLES = int(SR * DURATION)
N_MFCC    = 40
N_MELS    = 128
HOP       = 512
N_FFT     = 2048
EPOCHS    = 300
BATCH     = 16      # smaller batch = more gradient updates per epoch
LR        = 2e-4
AUGMENT   = 20      # 20x augmentation = 800 samples per class

# Cat/dog only -- no bird
SPECIES  = ["cat", "dog"]
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

ESC50_CAT = 5
ESC50_DOG = 0

# --- Feature extraction -------------------------------------------------------

def extract_features(audio: np.ndarray) -> np.ndarray:
    import librosa
    audio = audio.astype(np.float32)
    if len(audio) < N_SAMPLES:
        audio = np.pad(audio, (0, N_SAMPLES - len(audio)))
    else:
        audio = audio[:N_SAMPLES]

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

# --- Download ESC-50 ----------------------------------------------------------

def download_esc50():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    cat_dir = DATA_DIR / "cat"
    dog_dir = DATA_DIR / "dog"
    cat_dir.mkdir(exist_ok=True)
    dog_dir.mkdir(exist_ok=True)

    existing_cat = list(cat_dir.glob("*.wav"))
    existing_dog = list(dog_dir.glob("*.wav"))

    if len(existing_cat) >= 20 and len(existing_dog) >= 20:
        print(f"[OK] Already have {len(existing_cat)} cat + {len(existing_dog)} dog files")
        return existing_cat, existing_dog

    zip_path = DATA_DIR / "ESC-50.zip"
    if not zip_path.exists():
        print("[DL] Downloading ESC-50 dataset...")
        url = "https://github.com/karoldvl/ESC-50/archive/master.zip"
        try:
            urllib.request.urlretrieve(url, str(zip_path))
            print(f"   Downloaded: {zip_path.stat().st_size / 1e6:.1f} MB")
        except Exception as e:
            print(f"[ERR] Download failed: {e}")
            return [], []

    print("[ZIP] Extracting cat and dog audio files...")
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
        print(f"[ERR] Extraction failed: {e}")
        return [], []

    cat_files = list(cat_dir.glob("*.wav"))
    dog_files = list(dog_dir.glob("*.wav"))
    print(f"   Cat: {len(cat_files)} files  |  Dog: {len(dog_files)} files")
    return cat_files, dog_files

# --- Load audio ---------------------------------------------------------------

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

# --- Heavy augmentation -------------------------------------------------------

def augment_audio(y: np.ndarray, n: int = AUGMENT) -> list:
    import librosa
    results = [y]
    rng = np.random.default_rng()

    for _ in range(n - 1):
        aug = y.copy()

        # Random noise
        if rng.random() > 0.2:
            aug = aug + rng.normal(0, rng.uniform(0.003, 0.05), len(aug)).astype(np.float32)

        # Random gain
        aug = aug * rng.uniform(0.4, 1.6)

        # Time stretch
        if rng.random() > 0.3:
            try:
                rate = rng.uniform(0.75, 1.25)
                aug = librosa.effects.time_stretch(aug, rate=rate)
            except Exception:
                pass

        # Pitch shift
        if rng.random() > 0.3:
            try:
                steps = rng.uniform(-5, 5)
                aug = librosa.effects.pitch_shift(aug, sr=SR, n_steps=steps)
            except Exception:
                pass

        # Random time shift
        if rng.random() > 0.4:
            shift = int(rng.uniform(-SR * 0.8, SR * 0.8))
            aug = np.roll(aug, shift)

        # Random reverse (some sounds are direction-invariant)
        if rng.random() > 0.8:
            aug = aug[::-1].copy()

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

# --- Build dataset ------------------------------------------------------------

def build_dataset(cat_files, dog_files):
    print("\n[BUILD] Building dataset from real audio + heavy augmentation...")
    X, ys, ye = [], [], []

    print(f"   Loading {len(cat_files)} cat files (x{AUGMENT} aug)...")
    cat_loaded = 0
    for f in cat_files:
        audio = load_audio(f)
        if audio is None:
            continue
        for aug in augment_audio(audio):
            feat = extract_features(aug)
            X.append(feat)
            ys.append(0)  # cat = 0
            ye.append(EMOTIONS.index("communicating"))
        cat_loaded += 1
    print(f"   Cat: {cat_loaded} files -> {cat_loaded * AUGMENT} samples")

    print(f"   Loading {len(dog_files)} dog files (x{AUGMENT} aug)...")
    dog_loaded = 0
    for f in dog_files:
        audio = load_audio(f)
        if audio is None:
            continue
        for aug in augment_audio(audio):
            feat = extract_features(aug)
            X.append(feat)
            ys.append(1)  # dog = 1
            ye.append(EMOTIONS.index("alert_warning"))
        dog_loaded += 1
    print(f"   Dog: {dog_loaded} files -> {dog_loaded * AUGMENT} samples")

    return np.array(X, np.float32), np.array(ys), np.array(ye)

# --- Training -----------------------------------------------------------------

def train(X, ys, ye):
    import torch, torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import StratifiedKFold

    print(f"\n[TRAIN] Training on {len(X)} samples  |  features={X.shape[1]}")
    print(f"   Cat: {(ys==0).sum()}  Dog: {(ys==1).sum()}")

    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X).astype(np.float32)

    with open(OUT_SCALER, "w") as f:
        json.dump({"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()}, f)
    print(f"   Saved {OUT_SCALER}")

    # Use 5-fold cross validation, train on all data, report avg val acc
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    fold_accs = []

    # Train final model on ALL data
    dim = X.shape[1]

    class Net(nn.Module):
        def __init__(self):
            super().__init__()
            self.shared = nn.Sequential(
                nn.Linear(dim, 1024), nn.BatchNorm1d(1024), nn.GELU(), nn.Dropout(0.35),
                nn.Linear(1024, 512),  nn.BatchNorm1d(512),  nn.GELU(), nn.Dropout(0.3),
                nn.Linear(512, 256),   nn.BatchNorm1d(256),  nn.GELU(), nn.Dropout(0.25),
                nn.Linear(256, 128),   nn.BatchNorm1d(128),  nn.GELU(), nn.Dropout(0.2),
                nn.Linear(128, 64),    nn.GELU(),
            )
            self.sp_head = nn.Linear(64, len(SPECIES))   # 2 outputs: cat, dog
            self.em_head = nn.Linear(64, len(EMOTIONS))

        def forward(self, x):
            h = self.shared(x)
            return self.sp_head(h), self.em_head(h)

    def T(a, long=False):
        return torch.tensor(a, dtype=torch.long if long else torch.float32)

    # Quick cross-val to estimate real accuracy
    print("\n   Running 5-fold cross-validation...")
    for fold, (tr_idx, va_idx) in enumerate(skf.split(X_scaled, ys)):
        X_tr, X_va = X_scaled[tr_idx], X_scaled[va_idx]
        ys_tr, ys_va = ys[tr_idx], ys[va_idx]
        ye_tr, ye_va = ye[tr_idx], ye[va_idx]

        tr_dl = DataLoader(TensorDataset(T(X_tr), T(ys_tr, True), T(ye_tr, True)),
                           batch_size=BATCH, shuffle=True, drop_last=True)
        va_dl = DataLoader(TensorDataset(T(X_va), T(ys_va, True), T(ye_va, True)),
                           batch_size=BATCH)

        m = Net()
        opt = torch.optim.AdamW(m.parameters(), lr=LR, weight_decay=1e-4)
        sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=LR, epochs=100,
                                                     steps_per_epoch=max(1, len(tr_dl)))
        loss_fn = nn.CrossEntropyLoss(label_smoothing=0.05)

        for _ in range(100):
            m.train()
            for xb, sb, eb in tr_dl:
                opt.zero_grad()
                sp, em = m(xb)
                loss = loss_fn(sp, sb) + 0.3 * loss_fn(em, eb)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0)
                opt.step()
                sched.step()

        m.eval()
        correct = tot = 0
        with torch.no_grad():
            for xb, sb, _ in va_dl:
                sp, _ = m(xb)
                correct += (sp.argmax(1) == sb).sum().item()
                tot += len(sb)
        acc = correct / tot * 100
        fold_accs.append(acc)
        print(f"   Fold {fold+1}: {acc:.1f}%")

    avg_cv = sum(fold_accs) / len(fold_accs)
    print(f"\n   Cross-val avg: {avg_cv:.1f}%")

    # Now train final model on ALL data with more epochs
    print(f"\n   Training final model on all {len(X_scaled)} samples ({EPOCHS} epochs)...")
    tr_dl = DataLoader(TensorDataset(T(X_scaled), T(ys, True), T(ye, True)),
                       batch_size=BATCH, shuffle=True, drop_last=True)

    model = Net()
    opt   = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=LR, epochs=EPOCHS,
                                                  steps_per_epoch=max(1, len(tr_dl)))
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.05)

    best_loss = float("inf")
    best_state = None

    for epoch in range(1, EPOCHS + 1):
        model.train()
        total_loss = 0
        for xb, sb, eb in tr_dl:
            opt.zero_grad()
            sp, em = model(xb)
            loss = loss_fn(sp, sb) + 0.3 * loss_fn(em, eb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            total_loss += loss.item()

        avg_loss = total_loss / len(tr_dl)
        if avg_loss < best_loss:
            best_loss = avg_loss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

        if epoch % 50 == 0 or epoch == 1:
            print(f"   Epoch {epoch:3d}/{EPOCHS}  loss={avg_loss:.4f}")

    model.load_state_dict(best_state)
    print(f"\n[OK] Best loss: {best_loss:.4f}")

    # Export ONNX
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
    print(f"[OK] Exported: {OUT_MODEL}  ({kb:.0f} KB)")
    return avg_cv

# --- Main ---------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  PawTalk ONNX Trainer v6.0 -- Cat vs Dog (Real Audio)")
    print("=" * 60)

    try:
        import librosa, torch, sklearn, onnx
        print("[OK] All dependencies ready\n")
    except ImportError as e:
        print(f"[ERR] Missing: {e}")
        sys.exit(1)

    np.random.seed(42)

    cat_files, dog_files = download_esc50()

    if len(cat_files) < 5 or len(dog_files) < 5:
        print("[ERR] Not enough audio files.")
        sys.exit(1)

    X, ys, ye = build_dataset(cat_files, dog_files)
    acc = train(X, ys, ye)

    print("\n[DONE]")
    print(f"   {OUT_MODEL}")
    print(f"   {OUT_SCALER}")
    print(f"   Cross-val accuracy: {acc:.1f}%")
    print("\n[WARN] Commit and push the new .onnx and scaler_params.json files!")


if __name__ == "__main__":
    main()
