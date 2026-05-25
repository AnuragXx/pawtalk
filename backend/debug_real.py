"""
Debug what the model actually receives from real phone recordings.
The key issue: app.py does NOT trim to FIXED_T=87, but training did.
"""
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

print("=== What app.py sends to the model (no length trimming) ===\n")

# Simulate cat meow at different recording lengths
for dur in [1.0, 2.0, 3.0, 5.0, 10.0]:
    n = int(SR * dur)
    t = np.linspace(0, dur, n)
    y = (0.5 * np.sin(2 * np.pi * 900 * t)).astype(np.float32)  # cat-like 900Hz

    # Exactly what app.py does (no FIXED_T trimming)
    mel = librosa.feature.melspectrogram(y=y, sr=SR, n_mels=128)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    mel_min, mel_max = mel_db.min(), mel_db.max()
    if mel_max - mel_min > 1e-6:
        mel_db = (mel_db - mel_min) / (mel_max - mel_min)
    T = mel_db.shape[1]

    tensor = torch.tensor(mel_db, dtype=torch.float32).unsqueeze(0).unsqueeze(0)
    with torch.no_grad():
        p = F.softmax(model(tensor), dim=1)[0]
    pred = "CAT" if p[0] > p[1] else "DOG"
    print(f"Cat 900Hz  dur={dur:.0f}s  T={T:4d}  cat={p[0]*100:.1f}%  dog={p[1]*100:.1f}%  -> {pred}")

print()

# Simulate dog bark at different recording lengths
for dur in [1.0, 2.0, 3.0, 5.0, 10.0]:
    n = int(SR * dur)
    t = np.linspace(0, dur, n)
    y = (0.5 * np.sin(2 * np.pi * 200 * t)).astype(np.float32)  # dog-like 200Hz

    mel = librosa.feature.melspectrogram(y=y, sr=SR, n_mels=128)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    mel_min, mel_max = mel_db.min(), mel_db.max()
    if mel_max - mel_min > 1e-6:
        mel_db = (mel_db - mel_min) / (mel_max - mel_min)
    T = mel_db.shape[1]

    tensor = torch.tensor(mel_db, dtype=torch.float32).unsqueeze(0).unsqueeze(0)
    with torch.no_grad():
        p = F.softmax(model(tensor), dim=1)[0]
    pred = "CAT" if p[0] > p[1] else "DOG"
    print(f"Dog 200Hz  dur={dur:.0f}s  T={T:4d}  cat={p[0]*100:.1f}%  dog={p[1]*100:.1f}%  -> {pred}")

print()
print("=== Training used FIXED_T=87 but app.py sends variable T ===")
print("=== This mismatch is likely the root cause ===")
