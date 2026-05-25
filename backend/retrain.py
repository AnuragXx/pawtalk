"""
Retrain cat_dog_classifier.pth with a balanced dataset.

HOW TO USE:
1. Put your audio files in:
     backend/data/cat/   ← cat sounds (.wav, .mp3, .m4a)
     backend/data/dog/   ← dog sounds (.wav, .mp3, .m4a)
   (at least 20-30 files per class, more is better)

2. Run:  python retrain.py

3. It will save a new cat_dog_classifier.pth when done.

TIPS:
- Use equal numbers of cat and dog files (balanced dataset).
- Each clip should be 1-4 seconds of clear sound.
- Download free samples from freesound.org if you don't have enough.
"""

import os
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import numpy as np
import librosa
from pathlib import Path
from model import PetSoundCNN

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR   = Path(__file__).parent / "data"
MODEL_PATH = Path(__file__).parent / "cat_dog_classifier.pth"
EPOCHS     = 30
BATCH_SIZE = 8
LR         = 1e-3
SR         = 22050
N_MELS     = 128
FIXED_T    = 87   # fixed time frames (~2 sec at hop_length=512, sr=22050)

CLASSES = ["cat", "dog"]   # index 0 = cat, index 1 = dog


# ── Dataset ───────────────────────────────────────────────────────────────────
class PetSoundDataset(Dataset):
    def __init__(self, data_dir: Path):
        self.samples = []
        for label_idx, cls in enumerate(CLASSES):
            cls_dir = data_dir / cls
            if not cls_dir.exists():
                print(f"⚠️  Missing folder: {cls_dir}")
                continue
            for f in cls_dir.iterdir():
                if f.suffix.lower() in (".wav", ".mp3", ".m4a", ".ogg", ".flac"):
                    self.samples.append((str(f), label_idx))
        print(f"Dataset: {len(self.samples)} files total")
        cat_n = sum(1 for _, l in self.samples if l == 0)
        dog_n = sum(1 for _, l in self.samples if l == 1)
        print(f"  cat: {cat_n}  dog: {dog_n}")
        if cat_n == 0 or dog_n == 0:
            raise ValueError("Need at least 1 file per class. Check data/cat/ and data/dog/")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        try:
            y, _ = librosa.load(path, sr=SR, mono=True)
        except Exception as e:
            print(f"  Skipping {path}: {e}")
            y = np.zeros(SR * 2, dtype=np.float32)

        # Pad or trim to fixed length
        target_len = SR * 2  # 2 seconds
        if len(y) < target_len:
            y = np.pad(y, (0, target_len - len(y)))
        else:
            y = y[:target_len]

        mel    = librosa.feature.melspectrogram(y=y, sr=SR, n_mels=N_MELS)
        mel_db = librosa.power_to_db(mel, ref=np.max)

        # Normalise to [0, 1]
        mel_min, mel_max = mel_db.min(), mel_db.max()
        if mel_max - mel_min > 1e-6:
            mel_db = (mel_db - mel_min) / (mel_max - mel_min)
        else:
            mel_db = np.zeros_like(mel_db)

        # Trim/pad time axis to FIXED_T
        T = mel_db.shape[1]
        if T < FIXED_T:
            mel_db = np.pad(mel_db, ((0, 0), (0, FIXED_T - T)))
        else:
            mel_db = mel_db[:, :FIXED_T]

        tensor = torch.tensor(mel_db, dtype=torch.float32).unsqueeze(0)  # (1, 128, T)
        return tensor, label


# ── Training ──────────────────────────────────────────────────────────────────
def train():
    dataset = PetSoundDataset(DATA_DIR)
    if len(dataset) < 4:
        print("Not enough data. Add more files to data/cat/ and data/dog/")
        return

    # Class weights to handle imbalance
    cat_n = sum(1 for _, l in dataset.samples if l == 0)
    dog_n = sum(1 for _, l in dataset.samples if l == 1)
    total = cat_n + dog_n
    weights = torch.tensor([total / (2 * cat_n), total / (2 * dog_n)], dtype=torch.float32)
    print(f"Class weights: cat={weights[0]:.2f}  dog={weights[1]:.2f}")

    # 80/20 train/val split
    val_size  = max(1, int(0.2 * len(dataset)))
    train_size = len(dataset) - val_size
    train_ds, val_ds = torch.utils.data.random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False)

    model     = PetSoundCNN()
    criterion = nn.CrossEntropyLoss(weight=weights)
    optimizer = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=10, gamma=0.5)

    best_val_acc = 0.0

    for epoch in range(1, EPOCHS + 1):
        # ── Train ──
        model.train()
        train_loss, train_correct, train_total = 0.0, 0, 0
        for X, y in train_loader:
            optimizer.zero_grad()
            logits = model(X)
            loss   = criterion(logits, y)
            loss.backward()
            optimizer.step()
            train_loss    += loss.item() * len(y)
            train_correct += (logits.argmax(1) == y).sum().item()
            train_total   += len(y)

        # ── Validate ──
        model.eval()
        val_correct, val_total = 0, 0
        with torch.no_grad():
            for X, y in val_loader:
                logits = model(X)
                val_correct += (logits.argmax(1) == y).sum().item()
                val_total   += len(y)

        train_acc = train_correct / train_total * 100
        val_acc   = val_correct   / val_total   * 100
        avg_loss  = train_loss    / train_total

        print(f"Epoch {epoch:3d}/{EPOCHS}  loss={avg_loss:.4f}  "
              f"train_acc={train_acc:.1f}%  val_acc={val_acc:.1f}%")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), MODEL_PATH)
            print(f"  ✅ Saved best model (val_acc={val_acc:.1f}%)")

        scheduler.step()

    print(f"\nDone! Best val accuracy: {best_val_acc:.1f}%")
    print(f"Model saved to: {MODEL_PATH}")


if __name__ == "__main__":
    train()
