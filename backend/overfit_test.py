"""Test how badly the model overfits to synthetic data."""
import torch
import torch.nn.functional as F
import numpy as np
import librosa
from model import PetSoundCNN

model = PetSoundCNN()
state = torch.load("cat_dog_classifier.pth", map_location="cpu")
model.load_state_dict(state)
model.eval()

SR = 22050
FIXED_T = 87


def audio_to_mel(y):
    mel = librosa.feature.melspectrogram(y=y, sr=SR, n_mels=128)
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


def predict(y):
    t = torch.tensor(audio_to_mel(y)).unsqueeze(0).unsqueeze(0)
    with torch.no_grad():
        p = F.softmax(model(t), dim=1)[0]
    cat_p = p[0].item() * 100
    dog_p = p[1].item() * 100
    label = "CAT" if cat_p > dog_p else "DOG"
    return cat_p, dog_p, label


t2 = np.linspace(0, 2.0, SR * 2)

print("=== Test 1: Cat sound with increasing background noise ===")
cat_clean = np.sin(2 * np.pi * 900 * t2).astype(np.float32)
for noise in [0.0, 0.1, 0.3, 0.5, 1.0]:
    y = cat_clean + np.random.default_rng(0).normal(0, noise, SR * 2).astype(np.float32)
    y = y / (np.abs(y).max() + 1e-8)
    c, d, lbl = predict(y)
    print(f"  noise={noise:.1f}: cat={c:.1f}%  dog={d:.1f}%  -> {lbl}")

print()
print("=== Test 2: Dog sound with increasing background noise ===")
dog_clean = np.sin(2 * np.pi * 200 * t2).astype(np.float32)
for noise in [0.0, 0.1, 0.3, 0.5, 1.0]:
    y = dog_clean + np.random.default_rng(0).normal(0, noise, SR * 2).astype(np.float32)
    y = y / (np.abs(y).max() + 1e-8)
    c, d, lbl = predict(y)
    print(f"  noise={noise:.1f}: cat={c:.1f}%  dog={d:.1f}%  -> {lbl}")

print()
print("=== Test 3: Different recording durations ===")
for dur in [0.5, 1.0, 2.0, 3.0, 5.0]:
    n = int(SR * dur)
    tb = np.linspace(0, dur, n)
    y = np.sin(2 * np.pi * 900 * tb).astype(np.float32)
    y = y / (np.abs(y).max() + 1e-8)
    c, d, lbl = predict(y)
    print(f"  cat {dur:.1f}s: cat={c:.1f}%  dog={d:.1f}%  -> {lbl}")

print()
print("=== Test 4: Frequency variations (real cats: 500-1500Hz) ===")
for freq in [500, 700, 900, 1100, 1300, 1500]:
    y = np.sin(2 * np.pi * freq * t2).astype(np.float32)
    c, d, lbl = predict(y)
    print(f"  {freq}Hz (cat range): cat={c:.1f}%  dog={d:.1f}%  -> {lbl}")

print()
print("=== Test 5: Frequency variations (real dogs: 100-600Hz) ===")
for freq in [100, 200, 300, 400, 500, 600]:
    y = np.sin(2 * np.pi * freq * t2).astype(np.float32)
    c, d, lbl = predict(y)
    print(f"  {freq}Hz (dog range): cat={c:.1f}%  dog={d:.1f}%  -> {lbl}")

print()
print("=== Test 6: Silence and ambient noise ===")
y_silence = np.zeros(SR * 2, dtype=np.float32)
c, d, lbl = predict(y_silence)
print(f"  Silence: cat={c:.1f}%  dog={d:.1f}%  -> {lbl}")

y_ambient = np.random.default_rng(42).normal(0, 0.05, SR * 2).astype(np.float32)
c, d, lbl = predict(y_ambient)
print(f"  Ambient noise: cat={c:.1f}%  dog={d:.1f}%  -> {lbl}")
