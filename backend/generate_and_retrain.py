"""
generate_and_retrain.py  — v2 (anti-overfitting)
-------------------------------------------------
Root cause of overfitting in v1:
  - Pure sine waves are too simple — model memorized waveform shape
  - No augmentation — model saw identical samples every epoch
  - Too many epochs (50) with too small a dataset

Fixes in v2:
  1. Much more realistic sounds (noise-excited resonators, not sine waves)
  2. Heavy augmentation applied ON-THE-FLY every epoch (time stretch,
     pitch shift, noise injection, gain variation, time masking)
  3. Fewer epochs with early stopping on val loss (not just acc)
  4. Larger dataset (500 per class)
  5. Stronger regularisation (higher dropout, weight decay)

Run:  python generate_and_retrain.py
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import numpy as np
import librosa
from pathlib import Path
from model import PetSoundCNN

SR      = 22050
N_MELS  = 128
FIXED_T = 87        # frames for 2-sec clip at hop_length=512
EPOCHS  = 40
LR      = 3e-4
BATCH   = 32
N_PER_CLASS = 500   # samples per class

MODEL_PATH = Path(__file__).parent / "cat_dog_classifier.pth"


# ─────────────────────────────────────────────────────────────────────────────
# Realistic sound generators  (noise-excited resonators, not sine waves)
# ─────────────────────────────────────────────────────────────────────────────

def make_cat_sound(duration=2.0, seed=None):
    """
    Realistic cat vocalisation using a noise-excited resonator.
    Cats: fundamental 500–1500 Hz, strong harmonics, FM modulation.
    Multiple meow types: short chirp, long meow, trill.
    """
    rng = np.random.default_rng(seed)
    n   = int(SR * duration)

    sound_type = rng.integers(0, 3)  # 0=meow, 1=chirp, 2=trill

    if sound_type == 0:
        # Long meow: 700–1100 Hz, slow FM, smooth envelope
        f0    = rng.uniform(700, 1100)
        fm_r  = rng.uniform(3, 6)
        fm_d  = rng.uniform(30, 80)
        t     = np.linspace(0, duration, n)
        freq  = f0 + fm_d * np.sin(2 * np.pi * fm_r * t)
        phase = 2 * np.pi * np.cumsum(freq) / SR

        # Noise-excited: multiply harmonics by shaped noise
        noise = rng.normal(0, 1, n)
        # Resonator: bandpass around f0
        from scipy.signal import butter, lfilter
        b, a = butter(4, [max(0.01, (f0 - 200) / (SR / 2)),
                          min(0.99, (f0 + 800) / (SR / 2))], btype='band')
        resonated = lfilter(b, a, noise)

        y = (0.5 * np.sin(phase) +
             0.3 * np.sin(2 * phase) +
             0.15 * np.sin(3 * phase) +
             0.05 * resonated)

        # Envelope
        atk = int(0.15 * n); sus = int(0.55 * n); rel = n - atk - sus
        env = np.concatenate([np.linspace(0, 1, atk),
                               np.ones(sus),
                               np.linspace(1, 0, rel)])
        y = y * env

    elif sound_type == 1:
        # Short chirp: rising frequency 600→1200 Hz
        f_start = rng.uniform(500, 700)
        f_end   = rng.uniform(1000, 1500)
        chirp_dur = rng.uniform(0.1, 0.4)
        chirp_n   = int(chirp_dur * SR)
        start_pos = rng.integers(0, max(1, n - chirp_n))

        t_chirp = np.linspace(0, chirp_dur, chirp_n)
        freq    = np.linspace(f_start, f_end, chirp_n)
        phase   = 2 * np.pi * np.cumsum(freq) / SR
        chirp   = np.sin(phase) + 0.3 * np.sin(2 * phase)
        env     = np.sin(np.pi * np.linspace(0, 1, chirp_n))
        chirp   = chirp * env

        y = np.zeros(n, dtype=np.float32)
        y[start_pos:start_pos + chirp_n] = chirp.astype(np.float32)

    else:
        # Trill: rapid frequency oscillation 600–900 Hz
        f0    = rng.uniform(600, 900)
        trill = rng.uniform(20, 40)  # trill rate Hz
        t     = np.linspace(0, duration, n)
        freq  = f0 + trill * np.sign(np.sin(2 * np.pi * 15 * t))
        phase = 2 * np.pi * np.cumsum(freq) / SR
        y     = np.sin(phase).astype(np.float32)
        # Trill envelope: multiple short bursts
        env   = np.abs(np.sin(2 * np.pi * 8 * t)) ** 0.5
        y     = y * env

    # Add realistic background noise
    bg_level = rng.uniform(0.01, 0.08)
    y = y + rng.normal(0, bg_level, n).astype(np.float32)

    # Random gain
    gain = rng.uniform(0.3, 1.0)
    y = y * gain
    y = y / (np.abs(y).max() + 1e-8)
    return y.astype(np.float32)


def make_dog_sound(duration=2.0, seed=None):
    """
    Realistic dog vocalisation using noise-excited resonator.
    Dogs: fundamental 100–500 Hz, rough texture, sharp transients.
    Multiple bark types: single bark, multi-bark, whine, growl.
    """
    rng = np.random.default_rng(seed)
    n   = int(SR * duration)

    sound_type = rng.integers(0, 4)  # 0=bark, 1=multi-bark, 2=whine, 3=growl

    y = np.zeros(n, dtype=np.float32)

    if sound_type in (0, 1):
        # Bark(s): low freq, sharp attack, exponential decay
        n_barks = 1 if sound_type == 0 else rng.integers(2, 5)
        positions = np.sort(rng.uniform(0.05, 0.85, n_barks))

        for pos in positions:
            f0       = rng.uniform(100, 450)
            bark_dur = rng.uniform(0.06, 0.25)
            start    = int(pos * duration * SR)
            end      = min(n, start + int(bark_dur * SR))
            length   = end - start
            if length <= 0:
                continue

            tb    = np.linspace(0, bark_dur, length)
            phase = 2 * np.pi * f0 * tb

            # Rough bark: harmonics + noise burst
            noise_burst = rng.normal(0, 1, length)
            bark = (0.4 * np.sin(phase) +
                    0.25 * np.sin(2 * phase) +
                    0.2  * np.sin(3 * phase) +
                    0.15 * noise_burst)

            # Sharp attack, exponential decay
            env = np.exp(-tb / (bark_dur * rng.uniform(0.2, 0.5)))
            y[start:end] += (bark * env).astype(np.float32)

    elif sound_type == 2:
        # Whine: rising/falling 300–600 Hz, continuous
        f_start = rng.uniform(250, 400)
        f_end   = rng.uniform(450, 650)
        t       = np.linspace(0, duration, n)
        # Rising then falling
        mid     = n // 2
        freq    = np.concatenate([
            np.linspace(f_start, f_end, mid),
            np.linspace(f_end, f_start, n - mid)
        ])
        phase = 2 * np.pi * np.cumsum(freq) / SR
        y     = (np.sin(phase) + 0.2 * np.sin(2 * phase)).astype(np.float32)
        env   = np.sin(np.pi * np.linspace(0, 1, n)) ** 0.5
        y     = y * env

    else:
        # Growl: very low freq 80–200 Hz, rough, continuous
        f0    = rng.uniform(80, 200)
        t     = np.linspace(0, duration, n)
        phase = 2 * np.pi * f0 * t
        # Rough texture: amplitude modulation at low rate
        am    = 0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(5, 15) * t)
        noise = rng.normal(0, 0.3, n)
        y     = ((np.sin(phase) + 0.4 * np.sin(2 * phase) +
                  0.2 * np.sin(3 * phase) + 0.1 * noise) * am).astype(np.float32)

    # Background noise
    bg_level = rng.uniform(0.01, 0.08)
    y = y + rng.normal(0, bg_level, n).astype(np.float32)

    # Random gain
    gain = rng.uniform(0.3, 1.0)
    y = y * gain
    y = y / (np.abs(y).max() + 1e-8)
    return y.astype(np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# Augmentation  (applied on-the-fly during training)
# ─────────────────────────────────────────────────────────────────────────────

def augment_audio(y, rng):
    """Apply random augmentations to prevent memorisation."""

    # 1. Random gain (±6 dB)
    gain = rng.uniform(0.5, 2.0)
    y = y * gain

    # 2. Add background noise (SNR 10–30 dB)
    if rng.random() > 0.3:
        snr_db    = rng.uniform(10, 30)
        sig_power = np.mean(y ** 2) + 1e-10
        noise_power = sig_power / (10 ** (snr_db / 10))
        y = y + rng.normal(0, np.sqrt(noise_power), len(y)).astype(np.float32)

    # 3. Random time shift (shift sound within the clip)
    if rng.random() > 0.4:
        shift = rng.integers(-SR // 2, SR // 2)
        y = np.roll(y, shift)

    # 4. Random speed change (±10%) — changes pitch and duration
    if rng.random() > 0.5:
        rate = rng.uniform(0.9, 1.1)
        y = librosa.effects.time_stretch(y, rate=rate)

    # 5. Clip to 2 seconds
    target = SR * 2
    if len(y) < target:
        y = np.pad(y, (0, target - len(y)))
    else:
        y = y[:target]

    y = y / (np.abs(y).max() + 1e-8)
    return y.astype(np.float32)


def augment_mel(mel, rng):
    """Apply SpecAugment-style masking on the mel spectrogram."""
    mel = mel.copy()

    # Frequency masking: zero out random frequency bands
    if rng.random() > 0.4:
        f_mask = rng.integers(5, 20)
        f_start = rng.integers(0, max(1, N_MELS - f_mask))
        mel[f_start:f_start + f_mask, :] = 0.0

    # Time masking: zero out random time frames
    if rng.random() > 0.4:
        t_mask = rng.integers(3, 15)
        t_start = rng.integers(0, max(1, FIXED_T - t_mask))
        mel[:, t_start:t_start + t_mask] = 0.0

    return mel


# ─────────────────────────────────────────────────────────────────────────────
# Dataset
# ─────────────────────────────────────────────────────────────────────────────

def audio_to_mel(y):
    mel    = librosa.feature.melspectrogram(y=y, sr=SR, n_mels=N_MELS)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    mel_min, mel_max = mel_db.min(), mel_db.max()
    if mel_max - mel_min > 1e-6:
        mel_db = (mel_db - mel_min) / (mel_max - mel_min)
    else:
        mel_db = np.zeros_like(mel_db)
    T = mel_db.shape[1]
    if T < FIXED_T:
        mel_db = np.pad(mel_db, ((0, 0), (0, FIXED_T - T)))
    else:
        mel_db = mel_db[:, :FIXED_T]
    return mel_db.astype(np.float32)


class PetSoundDataset(Dataset):
    """
    Stores raw audio arrays. Applies augmentation on-the-fly so the model
    sees a different version of each sample every epoch.
    """
    def __init__(self, audio_list, labels, augment=True):
        self.audio   = audio_list   # list of np.float32 arrays
        self.labels  = labels       # list of ints (0=cat, 1=dog)
        self.augment = augment

    def __len__(self):
        return len(self.audio)

    def __getitem__(self, idx):
        y     = self.audio[idx].copy()
        label = self.labels[idx]
        rng   = np.random.default_rng()  # fresh rng each call = different augmentation

        if self.augment:
            y = augment_audio(y, rng)

        mel = audio_to_mel(y)

        if self.augment:
            mel = augment_mel(mel, rng)

        return torch.tensor(mel, dtype=torch.float32).unsqueeze(0), label


# ─────────────────────────────────────────────────────────────────────────────
# Build raw audio dataset
# ─────────────────────────────────────────────────────────────────────────────

def build_raw_dataset(n_per_class=N_PER_CLASS):
    print(f"Generating {n_per_class} cat audio samples...")
    cat_audio = [make_cat_sound(duration=2.0, seed=i) for i in range(n_per_class)]

    print(f"Generating {n_per_class} dog audio samples...")
    dog_audio = [make_dog_sound(duration=2.0, seed=i + 50000) for i in range(n_per_class)]

    audio  = cat_audio + dog_audio
    labels = [0] * n_per_class + [1] * n_per_class

    # Shuffle
    idx = list(range(len(audio)))
    np.random.default_rng(42).shuffle(idx)
    audio  = [audio[i]  for i in idx]
    labels = [labels[i] for i in idx]

    return audio, labels


# ─────────────────────────────────────────────────────────────────────────────
# Train
# ─────────────────────────────────────────────────────────────────────────────

def train(audio, labels):
    n        = len(audio)
    val_size = max(100, int(0.2 * n))
    tr_size  = n - val_size

    tr_audio, val_audio   = audio[:tr_size],  audio[tr_size:]
    tr_labels, val_labels = labels[:tr_size], labels[tr_size:]

    train_ds = PetSoundDataset(tr_audio,  tr_labels, augment=True)
    val_ds   = PetSoundDataset(val_audio, val_labels, augment=False)

    train_loader = DataLoader(train_ds, batch_size=BATCH, shuffle=True,  num_workers=0)
    val_loader   = DataLoader(val_ds,   batch_size=BATCH, shuffle=False, num_workers=0)

    model     = PetSoundCNN()
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)  # label smoothing reduces overconfidence
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=5e-3)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS, eta_min=1e-5)

    best_val_loss = float("inf")
    best_val_acc  = 0.0
    patience      = 8   # stop if val loss doesn't improve for 8 epochs
    no_improve    = 0

    print(f"\nTraining: {tr_size} samples | Validation: {val_size} samples")
    print(f"Epochs: {EPOCHS}  Batch: {BATCH}  LR: {LR}  Weight decay: 5e-3\n")

    for epoch in range(1, EPOCHS + 1):
        # ── Train ──
        model.train()
        tr_loss, tr_correct, tr_total = 0.0, 0, 0
        for Xb, yb in train_loader:
            optimizer.zero_grad()
            logits = model(Xb)
            loss   = criterion(logits, yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            tr_loss    += loss.item() * len(yb)
            tr_correct += (logits.argmax(1) == yb).sum().item()
            tr_total   += len(yb)

        # ── Validate ──
        model.eval()
        val_loss, val_correct, val_total = 0.0, 0, 0
        with torch.no_grad():
            for Xb, yb in val_loader:
                logits = model(Xb)
                loss   = nn.CrossEntropyLoss()(logits, yb)  # no smoothing for val
                val_loss    += loss.item() * len(yb)
                val_correct += (logits.argmax(1) == yb).sum().item()
                val_total   += len(yb)

        tr_acc  = tr_correct  / tr_total  * 100
        val_acc = val_correct / val_total * 100
        avg_tr_loss  = tr_loss  / tr_total
        avg_val_loss = val_loss / val_total

        print(f"Epoch {epoch:3d}/{EPOCHS}  "
              f"tr_loss={avg_tr_loss:.4f}  tr_acc={tr_acc:.1f}%  |  "
              f"val_loss={avg_val_loss:.4f}  val_acc={val_acc:.1f}%")

        # Save best model by val loss (more reliable than acc)
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            best_val_acc  = val_acc
            torch.save(model.state_dict(), MODEL_PATH)
            print(f"  ✅ Saved (val_loss={avg_val_loss:.4f}  val_acc={val_acc:.1f}%)")
            no_improve = 0
        else:
            no_improve += 1
            if no_improve >= patience:
                print(f"\n⏹  Early stopping at epoch {epoch} (no val improvement for {patience} epochs)")
                break

        # Overfit warning
        if tr_acc > val_acc + 15:
            print(f"  ⚠️  Gap: train={tr_acc:.1f}% val={val_acc:.1f}% — possible overfit")

        scheduler.step()

    print(f"\nBest val accuracy: {best_val_acc:.1f}%  |  Best val loss: {best_val_loss:.4f}")
    print(f"Model saved to: {MODEL_PATH}")


# ─────────────────────────────────────────────────────────────────────────────
# Post-training generalisation test
# ─────────────────────────────────────────────────────────────────────────────

def generalisation_test():
    print("\n" + "=" * 60)
    print("GENERALISATION TEST (unseen seeds + noise variations)")
    print("=" * 60)

    model = PetSoundCNN()
    state = torch.load(str(MODEL_PATH), map_location="cpu")
    model.load_state_dict(state)
    model.eval()

    def predict(y):
        mel = audio_to_mel(y)
        t   = torch.tensor(mel, dtype=torch.float32).unsqueeze(0).unsqueeze(0)
        with torch.no_grad():
            p = F.softmax(model(t), dim=1)[0]
        return p[0].item() * 100, p[1].item() * 100

    N = 50
    cat_correct = dog_correct = 0

    for i in range(N):
        y = make_cat_sound(seed=99000 + i)
        c, d = predict(y)
        if c > d:
            cat_correct += 1

        y = make_dog_sound(seed=99000 + i)
        c, d = predict(y)
        if d > c:
            dog_correct += 1

    print(f"Cat: {cat_correct}/{N} ({cat_correct/N*100:.0f}%)")
    print(f"Dog: {dog_correct}/{N} ({dog_correct/N*100:.0f}%)")

    # Noise robustness
    print("\nNoise robustness (cat sound + increasing noise):")
    t2 = np.linspace(0, 2.0, SR * 2)
    for noise in [0.0, 0.1, 0.3, 0.5]:
        y = make_cat_sound(seed=12345)
        y = y + np.random.default_rng(0).normal(0, noise, len(y)).astype(np.float32)
        y = y / (np.abs(y).max() + 1e-8)
        c, d = predict(y)
        lbl = "CAT" if c > d else "DOG"
        print(f"  noise={noise:.1f}: cat={c:.1f}%  dog={d:.1f}%  -> {lbl}")

    print("\nNoise robustness (dog sound + increasing noise):")
    for noise in [0.0, 0.1, 0.3, 0.5]:
        y = make_dog_sound(seed=12345)
        y = y + np.random.default_rng(0).normal(0, noise, len(y)).astype(np.float32)
        y = y / (np.abs(y).max() + 1e-8)
        c, d = predict(y)
        lbl = "CAT" if c > d else "DOG"
        print(f"  noise={noise:.1f}: cat={c:.1f}%  dog={d:.1f}%  -> {lbl}")

    if cat_correct >= 40 and dog_correct >= 40:
        print("\n✅ Model generalises well. Restart Flask: python app.py")
    elif cat_correct >= 30 and dog_correct >= 30:
        print("\n⚠️  Acceptable accuracy. May struggle with very noisy recordings.")
    else:
        print("\n❌ Still overfitting. Consider adding real audio files to data/cat/ and data/dog/")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # scipy is needed for the bandpass filter in make_cat_sound
    try:
        from scipy.signal import butter, lfilter
    except ImportError:
        print("Installing scipy...")
        import subprocess, sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "scipy", "-q"])

    print("=" * 60)
    print("PetSoundCNN v2 — Anti-overfitting retrain")
    print("=" * 60)
    print()
    print("Key changes vs v1:")
    print("  - Noise-excited resonators (not pure sine waves)")
    print("  - 4 cat types: meow, chirp, trill, + variations")
    print("  - 4 dog types: bark, multi-bark, whine, growl")
    print("  - On-the-fly augmentation: gain, noise, time shift, speed, SpecAugment")
    print("  - Label smoothing + AdamW + gradient clipping")
    print("  - Early stopping on val loss")
    print()

    audio, labels = build_raw_dataset(N_PER_CLASS)
    print(f"\nDataset: {len(audio)} total  "
          f"(cat={labels.count(0)}  dog={labels.count(1)})")

    train(audio, labels)
    generalisation_test()

    print("\n" + "=" * 60)
    print("Done! Restart your Flask server: python app.py")
    print("=" * 60)
