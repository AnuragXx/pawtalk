"""
Full accuracy evaluation of YAMNet on the 440-file real pet dataset.

Ground truth derived from probe_dataset.py:
  CAT codes: CAN01, CLE01, DAK01, IND01, LEO01, MAG01, MAT01, MIN01, REG01, SPI01, TIG01
  DOG codes: ANI01, BAC01, BLE01, BRA01, BRI01, JJX01, MEG01, NIG01, NUL01, WHO01

Usage: python eval_dataset.py
"""
import os, warnings, time
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
warnings.filterwarnings("ignore")

import csv, numpy as np, soundfile as sf
from pathlib import Path
from scipy.signal import resample_poly
from math import gcd
import tensorflow as tf

DATASET = Path(r"C:\Users\RajG\Downloads\dataset-20260428T083143Z-3-001\dataset")
YAMNET  = Path(__file__).parent / "yamnet.tflite"
CSV     = Path(__file__).parent / "yamnet_class_map.csv"

# Ground truth from probe
CAT_CODES = {"CAN01","CLE01","DAK01","IND01","LEO01","MAG01","MAT01","MIN01","REG01","SPI01","TIG01"}
DOG_CODES = {"ANI01","BAC01","BLE01","BRA01","BRI01","JJX01","MEG01","NIG01","NUL01","WHO01"}

CAT_IDS      = {76, 78, 80, 104}
DOG_IDS      = {69, 70, 75, 117}
YAMNET_SR    = 16000
YAMNET_FRAME = 15600

with open(CSV) as f:
    LABELS = [r["display_name"] for r in csv.DictReader(f)]

interp = tf.lite.Interpreter(model_path=str(YAMNET))
interp.allocate_tensors()
inp_idx = interp.get_input_details()[0]["index"]
out_idx = interp.get_output_details()[0]["index"]

def load_wav(path):
    data, sr = sf.read(str(path), dtype="float32", always_2d=True)
    audio = data.mean(axis=1)
    if sr != YAMNET_SR:
        g = gcd(YAMNET_SR, sr)
        audio = resample_poly(audio, YAMNET_SR // g, sr // g).astype(np.float32)
    peak = np.abs(audio).max()
    if peak > 1e-6:
        audio /= peak
    return audio.astype(np.float32)

def predict(audio):
    if len(audio) < YAMNET_FRAME:
        audio = np.pad(audio, (0, YAMNET_FRAME - len(audio)))
    hop = YAMNET_FRAME // 2
    all_scores = []
    start = 0
    while start + YAMNET_FRAME <= len(audio) and len(all_scores) < 4:
        chunk = audio[start:start + YAMNET_FRAME]
        interp.set_tensor(inp_idx, chunk)
        interp.invoke()
        all_scores.append(interp.get_tensor(out_idx)[0].copy())
        start += hop
    scores  = np.mean(all_scores, axis=0)
    cat_p   = sum(scores[i] for i in CAT_IDS if i < len(scores))
    dog_p   = sum(scores[i] for i in DOG_IDS if i < len(scores))
    pet_p   = cat_p + dog_p
    unclear = (pet_p < 0.06)
    species = "cat" if cat_p >= dog_p else "dog"
    return species, unclear, round(cat_p * 100, 1), round(dog_p * 100, 1)

# Run evaluation
total = correct = unclear_count = 0
cat_total = cat_correct = 0
dog_total = dog_correct = 0
errors = []

t0 = time.time()
for wav in sorted(DATASET.glob("*.wav")):
    code = wav.name.split("_")[1]
    if code in CAT_CODES:
        truth = "cat"
    elif code in DOG_CODES:
        truth = "dog"
    else:
        continue

    try:
        audio = load_wav(wav)
        pred, unclear, cat_p, dog_p = predict(audio)
    except Exception as e:
        errors.append((wav.name, str(e)))
        continue

    total += 1
    if unclear:
        unclear_count += 1
    if pred == truth:
        correct += 1
        if truth == "cat": cat_correct += 1
        else:              dog_correct += 1
    else:
        errors.append((wav.name, f"truth={truth} pred={pred} cat={cat_p}% dog={dog_p}%"))

    if truth == "cat": cat_total += 1
    else:              dog_total += 1

elapsed = time.time() - t0

print(f"\n{'='*55}")
print(f"  YAMNet Accuracy on Real Pet Dataset ({total} files)")
print(f"{'='*55}")
print(f"  Overall  : {correct}/{total}  ({correct/total*100:.1f}%)")
print(f"  Cat      : {cat_correct}/{cat_total}  ({cat_correct/cat_total*100:.1f}%)")
print(f"  Dog      : {dog_correct}/{dog_total}  ({dog_correct/dog_total*100:.1f}%)")
print(f"  Unclear  : {unclear_count}/{total}  ({unclear_count/total*100:.1f}%)")
print(f"  Time     : {elapsed:.1f}s  ({elapsed/total*1000:.0f}ms/file)")

if errors:
    print(f"\n  Misclassified / errors ({len(errors)}):")
    for name, msg in errors[:15]:
        print(f"    {name}: {msg}")
    if len(errors) > 15:
        print(f"    ... and {len(errors)-15} more")

print(f"\n{'='*55}")
