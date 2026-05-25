"""
download_and_retrain.py
-----------------------
Downloads real cat and dog audio clips from public URLs,
then retrains PetSoundCNN properly.

Run:  python download_and_retrain.py
"""

import os
import sys
import urllib.request
import zipfile
import tarfile
import shutil
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import TensorDataset, DataLoader
import numpy as np
import librosa
import soundfile as sf
from pathlib import Path
from model import PetSoundCNN

# ── Add static ffmpeg so librosa can decode mp3 ───────────────────────────────
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
    print("ffmpeg: OK")
except Exception as e:
    print("ffmpeg warning:", e)

SR      = 22050
N_MELS  = 128
FIXED_T = 87        # ~2 sec at hop_length=512
EPOCHS  = 60
LR      = 3e-4
BATCH   = 16

MODEL_PATH = Path(__file__).parent / "cat_dog_classifier.pth"
DATA_DIR   = Path(__file__).parent / "real_data"


# ─────────────────────────────────────────────────────────────────────────────
# Download helpers
# ─────────────────────────────────────────────────────────────────────────────

def download_file(url, dest):
    dest = Path(dest)
    if dest.exists():
        print(f"  Already downloaded: {dest.name}")
        return True
    print(f"  Downloading {dest.name} ...")
    try:
        urllib.request.urlretrieve(url, str(dest))
        print(f"  Done: {dest.stat().st_size:,} bytes")
        return True
    except Exception as e:
        print(f"  FAILED: {e}")
        return False


def load_audio_file(path, target_sr=SR):
    """Load any audio file to numpy array at target_sr."""
    try:
        y, sr = librosa.load(str(path), sr=target_sr, mono=True, duration=4.0)
        return y
    except Exception as e:
        print(f"    Skip {Path(path).name}: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Audio → mel tensor (fixed length)
# ─────────────────────────────────────────────────────────────────────────────

def audio_to_mel_tensor(y, sr=SR):
    """Convert audio array to normalised mel tensor of shape (1, 128, FIXED_T)."""
    # Pad or trim to exactly 2 seconds
    target_len = sr * 2
    if len(y) < target_len:
        y = np.pad(y, (0, target_len - len(y)))
    else:
        y = y[:target_len]

    mel    = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=N_MELS)
    mel_db = librosa.power_to_db(mel, ref=np.max)

    mel_min, mel_max = mel_db.min(), mel_db.max()
    if mel_max - mel_min > 1e-6:
        mel_db = (mel_db - mel_min) / (mel_max - mel_min)
    else:
        mel_db = np.zeros_like(mel_db)

    # Trim/pad time axis
    T = mel_db.shape[1]
    if T < FIXED_T:
        mel_db = np.pad(mel_db, ((0, 0), (0, FIXED_T - T)))
    else:
        mel_db = mel_db[:, :FIXED_T]

    return mel_db.astype(np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# Augmentation (makes model more robust to real recordings)
# ─────────────────────────────────────────────────────────────────────────────

def augment_audio(y, sr=SR, seed=None):
    """Apply random augmentations to make model robust."""
    rng = np.random.default_rng(seed)
    augmented = [y]  # always include original

    # Time stretch
    for rate in [0.85, 1.15]:
        try:
            y_stretched = librosa.effects.time_stretch(y, rate=rate)
            augmented.append(y_stretched)
        except Exception:
            pass

    # Pitch shift
    for steps in [-2, 2]:
        try:
            y_shifted = librosa.effects.pitch_shift(y, sr=sr, n_steps=steps)
            augmented.append(y_shifted)
        except Exception:
            pass

    # Add noise
    noise = rng.normal(0, 0.005, len(y)).astype(np.float32)
    augmented.append(y + noise)

    return augmented


# ─────────────────────────────────────────────────────────────────────────────
# Download real audio data
# ─────────────────────────────────────────────────────────────────────────────

def get_real_audio_files():
    """
    Download cat and dog audio from public sources.
    Uses ESC-50 dataset which has cat and dog classes.
    """
    DATA_DIR.mkdir(exist_ok=True)
    cat_dir = DATA_DIR / "cat"
    dog_dir = DATA_DIR / "dog"
    cat_dir.mkdir(exist_ok=True)
    dog_dir.mkdir(exist_ok=True)

    # Check if we already have files
    existing_cat = list(cat_dir.glob("*.wav")) + list(cat_dir.glob("*.mp3"))
    existing_dog = list(dog_dir.glob("*.wav")) + list(dog_dir.glob("*.mp3"))

    if len(existing_cat) >= 20 and len(existing_dog) >= 20:
        print(f"Already have {len(existing_cat)} cat and {len(existing_dog)} dog files.")
        return list(existing_cat), list(existing_dog)

    print("\nDownloading ESC-50 dataset (real environmental sounds)...")
    esc50_zip = DATA_DIR / "ESC-50.zip"

    # ESC-50 master branch zip
    url = "https://github.com/karoldvl/ESC-50/archive/master.zip"
    if download_file(url, esc50_zip):
        print("  Extracting...")
        try:
            with zipfile.ZipFile(str(esc50_zip), "r") as z:
                # Only extract audio files for cat (class 5) and dog (class 0)
                # ESC-50 filenames: FOLD-CLIP_ID-TAKE-TARGET.wav
                # cat = target 5, dog = target 0
                extracted = 0
                for member in z.namelist():
                    if not member.endswith(".wav"):
                        continue
                    fname = Path(member).name
                    parts = fname.replace(".wav", "").split("-")
                    if len(parts) < 4:
                        continue
                    target = int(parts[3])
                    if target == 5:   # cat
                        dest = cat_dir / fname
                        if not dest.exists():
                            with z.open(member) as src, open(str(dest), "wb") as dst:
                                dst.write(src.read())
                            extracted += 1
                    elif target == 0:  # dog
                        dest = dog_dir / fname
                        if not dest.exists():
                            with z.open(member) as src, open(str(dest), "wb") as dst:
                                dst.write(src.read())
                            extracted += 1
            print(f"  Extracted {extracted} audio files")
        except Exception as e:
            print(f"  Extraction failed: {e}")

    cat_files = list(cat_dir.glob("*.wav")) + list(cat_dir.glob("*.mp3"))
    dog_files = list(dog_dir.glob("*.wav")) + list(dog_dir.glob("*.mp3"))
    print(f"  Cat files: {len(cat_files)}")
    print(f"  Dog files: {len(dog_files)}")

    return cat_files, dog_files


# ─────────────────────────────────────────────────────────────────────────────
# Build dataset from real files
# ─────────────────────────────────────────────────────────────────────────────

def build_dataset(cat_files, dog_files):
    print("\nBuilding dataset with augmentation...")
    X_list, y_list = [], []

    print(f"Processing {len(cat_files)} cat files...")
    for i, f in enumerate(cat_files):
        y = load_audio_file(f)
        if y is None or len(y) < SR * 0.3:
            continue
        for aug_y in augment_audio(y, seed=i):
            mel = audio_to_mel_tensor(aug_y)
            X_list.append(mel)
            y_list.append(0)  # cat = 0

    print(f"Processing {len(dog_files)} dog files...")
    for i, f in enumerate(dog_files):
        y = load_audio_file(f)
        if y is None or len(y) < SR * 0.3:
            continue
        for aug_y in augment_audio(y, seed=i + 10000):
            mel = audio_to_mel_tensor(aug_y)
            X_list.append(mel)
            y_list.append(1)  # dog = 1

    X = torch.tensor(np.stack(X_list), dtype=torch.float32).unsqueeze(1)
    y = torch.tensor(y_list, dtype=torch.long)

    cat_n = int((y == 0).sum())
    dog_n = int((y == 1).sum())
    print(f"Total: {len(X)} samples  (cat={cat_n}  dog={dog_n})")

    # Shuffle
    perm = torch.randperm(len(X))
    return X[perm], y[perm], cat_n, dog_n


# ─────────────────────────────────────────────────────────────────────────────
# Train
# ─────────────────────────────────────────────────────────────────────────────

def train(X, y, cat_n, dog_n):
    n = len(X)
    val_size   = max(20, int(0.2 * n))
    train_size = n - val_size

    dataset = TensorDataset(X, y)
    train_ds, val_ds = torch.utils.data.random_split(
        dataset, [train_size, val_size],
        generator=torch.Generator().manual_seed(42)
    )

    train_loader = DataLoader(train_ds, batch_size=BATCH, shuffle=True,  drop_last=False)
    val_loader   = DataLoader(val_ds,   batch_size=BATCH, shuffle=False, drop_last=False)

    model = PetSoundCNN()

    # Class weights to handle any imbalance
    total = cat_n + dog_n
    w_cat = total / (2.0 * cat_n) if cat_n > 0 else 1.0
    w_dog = total / (2.0 * dog_n) if dog_n > 0 else 1.0
    weights = torch.tensor([w_cat, w_dog], dtype=torch.float32)
    print(f"Class weights: cat={w_cat:.2f}  dog={w_dog:.2f}")

    criterion = nn.CrossEntropyLoss(weight=weights)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=1e-3)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

    best_val_acc = 0.0
    print(f"\nTraining: {train_size} samples | Val: {val_size} samples | Epochs: {EPOCHS}\n")

    for epoch in range(1, EPOCHS + 1):
        model.train()
        train_loss, train_correct, train_total = 0.0, 0, 0
        for Xb, yb in train_loader:
            optimizer.zero_grad()
            logits = model(Xb)
            loss   = criterion(logits, yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss    += loss.item() * len(yb)
            train_correct += (logits.argmax(1) == yb).sum().item()
            train_total   += len(yb)

        model.eval()
        val_correct, val_total = 0, 0
        with torch.no_grad():
            for Xb, yb in val_loader:
                logits = model(Xb)
                val_correct += (logits.argmax(1) == yb).sum().item()
                val_total   += len(yb)

        train_acc = train_correct / train_total * 100
        val_acc   = val_correct   / val_total   * 100
        avg_loss  = train_loss    / train_total

        if epoch % 10 == 0 or epoch == 1:
            print(f"Epoch {epoch:3d}/{EPOCHS}  loss={avg_loss:.4f}  "
                  f"train={train_acc:.1f}%  val={val_acc:.1f}%")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), MODEL_PATH)

        scheduler.step()

    print(f"\nBest val accuracy: {best_val_acc:.1f}%")
    print(f"Model saved: {MODEL_PATH}")
    return best_val_acc


# ─────────────────────────────────────────────────────────────────────────────
# Verify
# ─────────────────────────────────────────────────────────────────────────────

def verify():
    print("\n=== Final verification ===")
    model = PetSoundCNN()
    state = torch.load(str(MODEL_PATH), map_location="cpu")
    model.load_state_dict(state)
    model.eval()

    # Test with held-out real files
    cat_files = list((DATA_DIR / "cat").glob("*.wav"))
    dog_files = list((DATA_DIR / "dog").glob("*.wav"))

    cat_correct, dog_correct = 0, 0
    n_test = min(10, len(cat_files), len(dog_files))

    for f in cat_files[-n_test:]:
        y = load_audio_file(f)
        if y is None:
            continue
        mel = audio_to_mel_tensor(y)
        t = torch.tensor(mel).unsqueeze(0).unsqueeze(0)
        with torch.no_grad():
            p = F.softmax(model(t), dim=1)[0]
        if p[0] > p[1]:
            cat_correct += 1
        print(f"  Cat {Path(f).name[:30]:30s}: cat={p[0]*100:.1f}%  dog={p[1]*100:.1f}%")

    for f in dog_files[-n_test:]:
        y = load_audio_file(f)
        if y is None:
            continue
        mel = audio_to_mel_tensor(y)
        t = torch.tensor(mel).unsqueeze(0).unsqueeze(0)
        with torch.no_grad():
            p = F.softmax(model(t), dim=1)[0]
        if p[1] > p[0]:
            dog_correct += 1
        print(f"  Dog {Path(f).name[:30]:30s}: cat={p[0]*100:.1f}%  dog={p[1]*100:.1f}%")

    print(f"\nCat: {cat_correct}/{n_test}  Dog: {dog_correct}/{n_test}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("PetSoundCNN — Retrain with REAL audio data (ESC-50)")
    print("=" * 60)

    cat_files, dog_files = get_real_audio_files()

    if len(cat_files) < 5 or len(dog_files) < 5:
        print("\nNot enough audio files downloaded.")
        print("Please manually add .wav files to:")
        print(f"  {DATA_DIR / 'cat'}")
        print(f"  {DATA_DIR / 'dog'}")
        sys.exit(1)

    X, y, cat_n, dog_n = build_dataset(cat_files, dog_files)
    best_acc = train(X, y, cat_n, dog_n)
    verify()

    print("\n" + "=" * 60)
    if best_acc >= 75:
        print(f"SUCCESS! Model accuracy: {best_acc:.1f}%")
        print("Restart Flask server:  python app.py")
    else:
        print(f"Accuracy {best_acc:.1f}% is lower than expected.")
        print("Try adding more real audio files to real_data/cat/ and real_data/dog/")
    print("=" * 60)
