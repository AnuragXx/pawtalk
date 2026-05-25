"""Quick verification of the retrained model."""
import torch
import torch.nn.functional as F
import numpy as np
import librosa
from pathlib import Path
from model import PetSoundCNN

SR = 22050
N_MELS = 128
FIXED_T = 87

model_path = Path(__file__).parent / "cat_dog_classifier.pth"
print(f"Model size: {model_path.stat().st_size:,} bytes")

model = PetSoundCNN()
state = torch.load(str(model_path), map_location="cpu")
model.load_state_dict(state)
model.eval()


def audio_to_mel(y):
    mel = librosa.feature.melspectrogram(y=y, sr=SR, n_mels=N_MELS)
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


def make_cat_meow(duration=2.0, seed=None):
    rng = np.random.default_rng(seed)
    n = int(SR * duration)
    t = np.linspace(0, duration, n)
    f0 = rng.uniform(700, 1100)
    vibrato_rate = rng.uniform(4, 7)
    vibrato_depth = rng.uniform(20, 50)
    freq = f0 + vibrato_depth * np.sin(2 * np.pi * vibrato_rate * t)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    y = 0.6 * np.sin(phase) + 0.3 * np.sin(2 * phase) + 0.1 * np.sin(3 * phase)
    attack = int(0.20 * n)
    sustain = int(0.50 * n)
    release = n - attack - sustain
    env = np.concatenate([np.linspace(0, 1, attack), np.ones(sustain), np.linspace(1, 0, release)])
    y = y * env + rng.normal(0, 0.02, n)
    return (y / (np.abs(y).max() + 1e-8)).astype(np.float32)


def make_dog_bark(duration=2.0, seed=None):
    rng = np.random.default_rng(seed)
    n = int(SR * duration)
    y = np.zeros(n, dtype=np.float32)
    n_barks = rng.integers(1, 4)
    bark_positions = np.sort(rng.uniform(0.05, 0.85, n_barks))
    for pos in bark_positions:
        f0 = rng.uniform(150, 400)
        bark_dur = rng.uniform(0.08, 0.20)
        start = int(pos * duration * SR)
        end = min(n, start + int(bark_dur * SR))
        length = end - start
        if length <= 0:
            continue
        tb = np.linspace(0, bark_dur, length)
        phase = 2 * np.pi * f0 * tb
        bark = (0.5 * np.sin(phase) + 0.3 * np.sin(2 * phase) +
                0.15 * np.sin(3 * phase) + 0.05 * rng.normal(0, 1, length))
        env = np.exp(-tb / (bark_dur * 0.4))
        y[start:end] += (bark * env).astype(np.float32)
    y += rng.normal(0, 0.03, n).astype(np.float32)
    return (y / (np.abs(y).max() + 1e-8)).astype(np.float32)


print("\n=== Testing retrained model ===")
cat_correct = 0
dog_correct = 0
N = 30

print("\nCat samples:")
for i in range(N):
    y = make_cat_meow(seed=5000 + i)
    t = torch.tensor(audio_to_mel(y)).unsqueeze(0).unsqueeze(0)
    with torch.no_grad():
        p = F.softmax(model(t), dim=1)[0]
    pred = "CAT" if p[0] > p[1] else "DOG"
    if p[0] > p[1]:
        cat_correct += 1
    if i < 5:
        print(f"  Sample {i}: cat={p[0]*100:.1f}%  dog={p[1]*100:.1f}%  -> {pred}")

print("\nDog samples:")
for i in range(N):
    y = make_dog_bark(seed=5000 + i)
    t = torch.tensor(audio_to_mel(y)).unsqueeze(0).unsqueeze(0)
    with torch.no_grad():
        p = F.softmax(model(t), dim=1)[0]
    pred = "CAT" if p[0] > p[1] else "DOG"
    if p[1] > p[0]:
        dog_correct += 1
    if i < 5:
        print(f"  Sample {i}: cat={p[0]*100:.1f}%  dog={p[1]*100:.1f}%  -> {pred}")

print()
print(f"Cat accuracy: {cat_correct}/{N} ({cat_correct/N*100:.0f}%)")
print(f"Dog accuracy: {dog_correct}/{N} ({dog_correct/N*100:.0f}%)")

# Silence test
x = torch.zeros(1, 1, 128, 87)
with torch.no_grad():
    p = F.softmax(model(x), dim=1)[0]
print(f"\nSilence: cat={p[0]*100:.1f}%  dog={p[1]*100:.1f}%")

if cat_correct >= 25 and dog_correct >= 25:
    print("\n✅ Model is working correctly! Restart Flask: python app.py")
else:
    print("\n⚠️  Accuracy lower than expected. Run generate_and_retrain.py again.")
