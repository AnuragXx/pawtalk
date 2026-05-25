# PawTalk Backend

Flask API for PawTalk — handles sound analysis (YAMNet), checklist management, and push notifications.

## Setup

### 1. Install dependencies
```
pip install flask flask-cors firebase-admin requests python-dotenv static-ffmpeg pydub soundfile scipy transformers huggingface_hub tensorflow-cpu
```

### 2. Download YAMNet model (run once)
```
python -c "
import urllib.request
urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite', 'yamnet.tflite')
urllib.request.urlretrieve('https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv', 'yamnet_class_map.csv')
print('Done')
"
```

### 3. Firebase Service Account
- Go to Firebase Console → Project Settings → Service Accounts
- Click "Generate new private key"
- Save the downloaded JSON as `backend/serviceAccountKey.json`

### 4. Run
```
python app.py
```

### 5. Test
```
python test_analyze.py
# With a real audio file:
python test_analyze.py path/to/cat.wav
```

## Sound Analysis Model

**YAMNet** — Google's AudioSet neural network (4 MB TFLite, ~80ms per request on CPU)

- Trained on 521 real-world audio classes from AudioSet
- Cat classes: Cat (76), Meow (78), Caterwaul (80), Roaring cats (104)
- Dog classes: Dog (69), Bark (70), Whimper (75), Canidae (117)
- Automatically detects unclear/silent audio and returns `isVeryUnclear: true`
- No retraining needed — works on real pet recordings out of the box

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | / | Health check |
| POST | /analyze | Analyze pet sound (multipart field: `audio`) |
| POST | /checklist/add | Add a task |
| GET | /checklist/\<userId\> | Get all tasks for user |
| PUT | /checklist/update/\<taskId\> | Update a task |
| DELETE | /checklist/delete/\<taskId\>?userId=X | Delete a task |
| POST | /registerPushToken | Store Expo push token |
| POST | /sendNotification | Send push notification via Expo |

### /analyze response
```json
{
  "species": "cat",
  "confidence": 87.3,
  "cat_prob": 12.4,
  "dog_prob": 1.1,
  "isUncertain": false,
  "isVeryUnclear": false,
  "isMock": false
}
```

- `isVeryUnclear: true` → silence, ambient noise, or no pet sound detected — app shows "Record Again"
- `isUncertain: true` → borderline confidence — app shows a warning but still shows result
- `isMock: true` → YAMNet not available, random result returned so app still works

## Notes
- The chatbot uses Groq API directly from the app — no backend needed for it
- Push notifications use Expo Push API (no FCM credentials needed)
- Local notifications are scheduled directly from the app via expo-notifications
