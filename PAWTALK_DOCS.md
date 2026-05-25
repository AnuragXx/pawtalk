# PawTalk — Complete Technical Documentation

> A full-stack mobile app that listens to your pet and tells you what they mean.

---

## Table of Contents

1. [What is PawTalk?](#1-what-is-pawtalk)
2. [Tech Stack Overview](#2-tech-stack-overview)
3. [Project Structure](#3-project-structure)
4. [Frontend — How It Works](#4-frontend--how-it-works)
5. [Backend — How It Works](#5-backend--how-it-works)
6. [Data Flow Diagrams](#6-data-flow-diagrams)
7. [Database Structure (Firestore)](#7-database-structure-firestore)
8. [External APIs and Services](#8-external-apis-and-services)
9. [Key Libraries Explained](#9-key-libraries-explained)
10. [Running the App](#10-running-the-app)

---

## 1. What is PawTalk?

PawTalk is a React Native mobile app that helps pet owners understand their cats and dogs.
It does four main things:

| Feature | What it does |
|---|---|
| **Sound Analysis** | Records your pet making a sound, sends it to an AI model, and tells you if it is a cat or dog sound with a confidence score |
| **Pet Checklist** | Daily task manager for feeding, walking, grooming, medicine, etc. with progress tracking |
| **Appointments** | Schedule vet visits and other appointments with alarm notifications |
| **PoofieAI Chatbot** | An AI assistant powered by Groq (llama-3.3-70b) that answers pet care questions |

---

## 2. Tech Stack Overview

### Frontend

| Layer | Technology | Version |
|---|---|---|
| Framework | React Native + Expo | RN 0.81.5, Expo 54 |
| Language | JavaScript (JSX) | ES2022 |
| Navigation | React Navigation | v7 |
| Auth | Firebase Auth | v10 |
| Database | Firebase Firestore | v10 |
| Audio Recording | expo-av | latest |
| Notifications | expo-notifications | latest |
| Icons | react-native-svg | latest |
| Fonts | Poppins (expo-font) | all weights |
| HTTP Client | fetch (built-in) | — |

### Backend

| Layer | Technology | Version |
|---|---|---|
| Framework | Flask | 3.x |
| Language | Python | 3.12 |
| AI Model | YAMNet TFLite | Google AudioSet |
| ML Runtime | TensorFlow Lite | 2.21 |
| Audio Processing | pydub + soundfile + scipy | latest |
| Format Conversion | static-ffmpeg | latest |
| Database | Firebase Admin SDK | latest |
| Chatbot | Groq API (llama-3.3-70b) | — |

---

## 3. Project Structure

```
PawTalk/
├── App.js                          # Root component, font loading, context providers
├── app.json                        # Expo config (name, icons, plugins, permissions)
├── package.json                    # npm dependencies
│
├── src/
│   ├── navigation/
│   │   ├── AppNavigator.js         # Root navigator — auth vs app stack
│   │   └── TabNavigator.js         # Bottom tab bar (4 tabs)
│   │
│   ├── context/
│   │   └── AuthContext.js          # Global auth state (user, login, logout)
│   │
│   ├── screens/
│   │   ├── SplashScreen.js         # 2.5s loading screen
│   │   ├── GetStartedScreen.js     # Landing page with Sign In / Sign Up
│   │   ├── OnboardingScreen.js     # 3-slide feature intro carousel
│   │   ├── SoundRecorderScreen.js  # Record + analyze pet sounds (main feature)
│   │   ├── ChecklistScreen.js      # Daily tasks + appointments
│   │   ├── HomeScreen.js           # Dashboard
│   │   ├── ChatbotScreen.js        # PoofieAI chat interface
│   │   ├── MyPetScreen.js          # Pet profile management
│   │   ├── SignInScreen.js         # Email/Google sign in
│   │   ├── SignUpScreen.js         # Email sign up
│   │   ├── PetProfileSetupScreen.js# New user pet setup
│   │   ├── TermsAgreementScreen.js # Terms of service
│   │   └── SoundHistoryScreen.js   # Past analysis results
│   │
│   ├── services/
│   │   ├── api.js                  # soundAPI (Flask) + chatAPI (Groq)
│   │   ├── firestore.js            # All Firestore read/write operations
│   │   └── notifications.js        # Alarm scheduling + push notifications
│   │
│   └── hooks/
│       ├── useGoogleAuth.js        # Google OAuth flow
│       └── useHideNavBar.js        # Hides Android nav bar on certain screens
│
└── backend/
    ├── app.py                      # Flask server — all API endpoints
    ├── model.py                    # Legacy PyTorch CNN (not used in production)
    ├── yamnet.tflite               # YAMNet model file (4 MB)
    ├── yamnet_class_map.csv        # 521 AudioSet class labels
    ├── .env                        # PORT, FIREBASE_SERVICE_ACCOUNT
    ├── serviceAccountKey.json      # Firebase Admin credentials (local dev)
    ├── test_analyze.py             # Test script for /analyze endpoint
    └── README.md                   # Backend setup instructions
```

---

## 4. Frontend — How It Works

### App Entry Point — `App.js`

This is the first file React Native runs. It does three things before showing any UI:

1. **Loads fonts** — Uses `expo-font` to load all Poppins weights (Regular, Medium, SemiBold, Bold).
   The app waits until fonts are ready before rendering anything, so you never see a flash of unstyled text.

2. **Wraps with context providers** — Three providers wrap the entire app:
   - `AuthProvider` — makes the logged-in user available everywhere
   - `UserProvider` — stores pet profile data
   - `AlarmProvider` — manages active alarms

3. **Sets up notifications** — Calls `setupNotificationChannel()` to create the Android alarm channel,
   and registers a listener so that when a notification arrives while the app is open,
   it triggers the alarm sound immediately.

```
App.js
  └── AuthProvider
        └── UserProvider
              └── AlarmProvider
                    └── NavigationContainer
                          └── AppNavigator
```

---

### Navigation — `AppNavigator.js` + `TabNavigator.js`

**AppNavigator** is the traffic controller. It reads the auth state and decides which screen to show:

```
User not logged in:
  Splash → GetStarted → SignIn / SignUp

New user (just signed up):
  Onboarding → TermsAgreement → PetProfileSetup → Home

Returning user:
  Home (TabNavigator)
```

It uses a React Navigation `Stack.Navigator`. The key logic is:

```js
if (!user)       → show AuthStack (Splash, GetStarted, SignIn, SignUp)
if (isNewUser)   → show AppStack starting at Onboarding
else             → show AppStack starting at Home (TabNavigator)
```

**TabNavigator** is the bottom bar with 4 tabs. Each tab has a custom SVG icon drawn inline:

| Tab | Screen | Icon |
|---|---|---|
| HomeTab | HomeScreen | House SVG |
| Analyze | SoundRecorderScreen | Microphone SVG |
| Checklist | ChecklistScreen | Checkmark SVG |
| MyPet | MyPetScreen | Person SVG |

Active tab colour is `#e64980` (pink), inactive is `#aaa`.

---

### Authentication — `AuthContext.js`

This is a React Context that holds the logged-in user and exposes auth functions to every screen.

**State it manages:**
- `user` — the current Firebase user object (null if not logged in)
- `isLoading` — true while checking if a user is already logged in
- `isNewUser` — true if the user has not completed onboarding yet
- `error` — any auth error message

**Functions it exposes:**

```js
signUpWithEmail(email, password)
// Creates a Firebase Auth account
// Creates a Firestore user document with isOnboarded: false
// Sets isNewUser = true

signInWithEmail(email, password)
// Signs in with Firebase Auth
// Reads the user document from Firestore to check isOnboarded

signInWithGoogle(idToken)
// Signs in with a Google ID token
// Creates user doc in Firestore if this is their first time

completeOnboarding()
// Sets isOnboarded: true in Firestore
// Sets isNewUser = false in local state

logout()
// Signs out of Firebase Auth
// Clears all local state
```

**How it works under the hood:**
Firebase Auth has a persistent session. When the app starts, `onAuthStateChanged` fires and tells us
if a user is already logged in. If yes, we fetch their Firestore document to get their profile data
and check `isOnboarded`. This all happens before the app renders, which is why there is a loading
spinner on startup.

---

### Screens

#### `SplashScreen.js`
Shows for 2.5 seconds when the app first opens. Has a pink gradient background, scattered paw print
decorations, and the PawTalk logo. After 2.5 seconds it automatically navigates to GetStartedScreen.

#### `GetStartedScreen.js`
The landing page. Shows the app logo, a tagline, and two buttons: Sign In and Sign Up.

#### `OnboardingScreen.js`
A 3-slide horizontal carousel shown only to new users. Uses a `FlatList` with `pagingEnabled` so
each slide snaps into place. The three slides explain:
1. What PawTalk does
2. How the sound analysis works
3. The checklist and chatbot features

A Skip button jumps to the last slide. The final button calls `completeOnboarding()` and navigates
to TermsAgreement.

---

#### `SoundRecorderScreen.js` — The Main Feature

This is the most complex screen. Here is exactly what happens step by step:

**Recording:**
1. User taps the pink microphone button
2. `expo-av` requests microphone permission if not already granted
3. `Audio.Recording` starts capturing audio at high quality with metering enabled
4. Every 80ms, the metering value (volume level in dB) is read and converted to a bar height
5. 40 bars animate in real time to show the waveform
6. A timer counts up in seconds
7. User taps the stop button (square icon)

**Analysis:**
1. Recording stops and the audio file URI is retrieved
2. `setIsAnalyzing(true)` shows a spinner
3. `soundAPI.analyze(uri, petType)` is called
4. The result comes back with: species, confidence, catProb, dogProb, isUncertain, isVeryUnclear
5. If `isVeryUnclear` is true → shows the red "Sound Unclear" card with a "Record Again" button
6. Otherwise → shows the result card with emoji, label, confidence badge, and probability bars

**Probability bars:**
The bars show cat% vs dog% normalised to always sum to 100%:
```js
const total = catProb + dogProb;
const catPct = Math.round((catProb / total) * 100);
const dogPct = 100 - catPct;
```

**State reset:**
Every time the user navigates away and comes back, `useFocusEffect` fires and resets all state
(result, timer, bars, recording flags) so the screen always looks clean.

**Upload mode:**
The Upload Audio button opens `expo-document-picker` to pick any audio file from the device.
The file is sent to the same `/analyze` endpoint.

---

#### `ChecklistScreen.js`

Manages two lists:

**Today's Tasks:**
- Add tasks with a title, time, and icon (food, walk, litter, vet, groom, play, medicine)
- Each task has a checkbox — tapping it toggles done/undone in Firestore
- A progress bar at the top shows X/Y tasks completed

**Upcoming Appointments:**
- Schedule appointments with a date/time picker
- When saved, `scheduleAlarm()` is called to set a notification
- When the alarm fires, the appointment is automatically deleted from Firestore
- Appointments are sorted by date

Both lists use real-time Firestore listeners so changes appear instantly without refreshing.

---

### Services

#### `src/services/api.js`

Two exported objects:

**`soundAPI.analyze(audioUri, petType)`**

Sends the recorded audio to the Flask backend:
```
1. Build a FormData object with the audio file
2. POST to http://192.168.0.103:5000/analyze
3. Parse the JSON response
4. Map species to emoji/color/label using SPECIES_CONFIG
5. Return a result object the screen can display directly
```

If the backend is unreachable, it returns a mock result so the app does not crash.
The mock is labelled with `isMock: true` and shows a "Demo" badge.

**`chatAPI.sendMessage(message, petType, petBreed, history)`**

Sends a message to the Groq API directly from the app (no backend needed):
```
1. Build a messages array with system prompt + conversation history + new message
2. POST to https://api.groq.com/openai/v1/chat/completions
3. Model: llama-3.3-70b-versatile, max 200 tokens
4. Return the reply text
```

System prompt: "You are PoofieAI, a friendly pet care assistant. Answer simply and briefly.
Do not give medical diagnosis. Keep answers to 3-4 lines maximum."

#### `src/services/firestore.js`

All database operations in one place. The database structure is:

```
users/{userId}
  ├── pets/{petId}
  ├── tasks/{taskId}
  ├── appointments/{appointmentId}
  └── soundHistory/{entryId}
```

Every collection has a `listen()` function that returns a real-time Firestore listener.
The screen calls `listen()` in a `useEffect`, stores the unsubscribe function,
and calls it in the cleanup to avoid memory leaks.

#### `src/services/notifications.js`

Handles two types of alerts:

**In-app alarms (app is open):**
Uses `setTimeout`. When the scheduled time arrives, it calls `triggerAlarm()` which plays
`alarm.mp3` using `expo-av` and shows an Alert dialog.

**Background notifications (app is closed/minimised):**
Uses `expo-notifications` to schedule a local notification. When the user taps it,
`addNotificationResponseListener` fires and triggers the alarm flow.

Both are scheduled at the same time for every appointment, so the alarm works regardless
of whether the app is open or not.

---

### Hooks

#### `src/hooks/useGoogleAuth.js`

Handles the Google OAuth flow using `expo-auth-session`. It:
1. Opens a browser popup with Google's OAuth page
2. User signs in with their Google account
3. Google redirects back to the app with an access token
4. The hook exchanges the access token for a Firebase credential
5. Signs in to Firebase with `signInWithCredential`
6. Creates a Firestore user document if this is a new user

Returns `{ promptAsync, isReady }` — the screen calls `promptAsync()` when the user taps
"Sign in with Google".

---

## 5. Backend — How It Works

### Flask Server — `backend/app.py`

A Python Flask REST API that runs on port 5000.

**All endpoints:**

| Method | Route | What it does |
|---|---|---|
| GET | / | Health check — returns server status and model name |
| POST | /analyze | Classify a pet sound (main AI endpoint) |
| POST | /checklist/add | Add a task to Firestore |
| GET | /checklist/{userId} | Get all tasks for a user |
| PUT | /checklist/update/{taskId} | Update a task |
| DELETE | /checklist/delete/{taskId} | Delete a task |
| POST | /registerPushToken | Store device push token |
| POST | /sendNotification | Send push notification via Expo |

**Startup sequence:**
```
1. Load .env file (PORT, FIREBASE_SERVICE_ACCOUNT)
2. Suppress TensorFlow log noise
3. Register static-ffmpeg so pydub can find ffmpeg
4. Initialize Firebase Admin SDK
5. Start Flask app
6. Background thread: load YAMNet + run one dummy inference (warm-up)
7. Server ready — first real request responds in ~80ms
```

The warm-up is important. TFLite takes ~5 seconds to load the model the first time.
By doing it in a background thread at startup, the first user request is instant.

---

### YAMNet Sound Classifier

**What is YAMNet?**

YAMNet (Yet Another Mobile Network) is a neural network trained by Google on AudioSet —
a dataset of 2 million YouTube clips labelled with 521 sound categories. It knows what
real cats and dogs sound like because it was trained on millions of real recordings.

The model file is `yamnet.tflite` — only 4 MB and runs on CPU in ~20ms per frame.

**How it classifies a sound:**

YAMNet works on fixed-size chunks of audio. Each chunk is exactly 15,600 samples = 0.975 seconds
at 16 kHz. For a 3-second recording, the backend processes multiple overlapping chunks:

```
Audio: [============================] 3 seconds
Frame 1: [=========] 0.975s
Frame 2:     [=========] 0.975s  (50% overlap)
Frame 3:         [=========] 0.975s
Frame 4:             [=========] 0.975s
...up to 6 frames
```

Each frame produces 521 scores (one per AudioSet class). The backend averages the scores
across all frames to get a stable result.

**Cat and dog class aggregation:**

Instead of using just one class, the backend sums up all cat-related and dog-related classes:

```
Cat classes:  76=Cat, 78=Meow, 80=Caterwaul, 104=Roaring cats
Dog classes:  69=Dog, 70=Bark, 75=Whimper, 117=Canidae

cat_prob = scores[76] + scores[78] + scores[80] + scores[104]
dog_prob = scores[69] + scores[70] + scores[75] + scores[117]
```

This is more robust than using a single class because a cat meowing might score high on
"Meow" but not "Cat", and this approach catches both.

**Calibration bias:**

On 440 real pet recordings, a `CAT_BIAS = 0.8` multiplier was tuned to balance accuracy:

```python
if cat_prob * 0.8 >= dog_prob:
    species = "cat"
else:
    species = "dog"
```

Results: cat accuracy = 83.1%, dog accuracy = 65.9%, overall = 75.7%.

**Unclear audio detection:**

If total pet probability < 6% or silence > 25%, the result is flagged as `isVeryUnclear: true`.
The app then shows a "Sound Unclear — Record Again" card instead of a species result.

---

### Audio Pipeline

```
Phone recording (.m4a / .ogg / .wav)
        ↓
pydub + ffmpeg: convert to .wav
        ↓
soundfile: read as float32 numpy array
        ↓
scipy.signal.resample_poly: resample to 16,000 Hz
        ↓
numpy: mix stereo to mono, normalise amplitude to [-1, 1]
        ↓
Find loudest 3-second window
        ↓
YAMNet: run inference on overlapping 0.975s frames (up to 6)
        ↓
Average scores across frames
        ↓
Aggregate cat/dog class scores, apply CAT_BIAS
        ↓
Return JSON to app
```

**Why pydub + ffmpeg?**
Phone recordings are in compressed formats (m4a, ogg) that Python cannot read directly.
`static-ffmpeg` bundles a pre-compiled ffmpeg binary so no separate installation is needed.

**Why soundfile instead of librosa?**
`soundfile` reads wav files directly into numpy arrays in milliseconds. `librosa` is slower
and has more dependencies.

**Why scipy for resampling?**
YAMNet requires exactly 16,000 Hz. Phone recordings are often at 44,100 Hz or 48,000 Hz.
`scipy.signal.resample_poly` does high-quality polyphase resampling without aliasing.

---

## 6. Data Flow Diagrams

### Sound Analysis Flow

```
User taps mic
      ↓
expo-av records audio → .m4a file saved to device cache
      ↓
soundAPI.analyze(uri, petType) called
      ↓
FormData built with audio file
      ↓
POST http://192.168.0.103:5000/analyze
      ↓
Flask receives file → saves to temp file
      ↓
pydub converts .m4a → .wav
      ↓
soundfile reads .wav → float32 array
      ↓
scipy resamples to 16 kHz
      ↓
YAMNet runs on 0.975s frames (up to 6 frames)
      ↓
Scores averaged → cat/dog probabilities calculated
      ↓
CAT_BIAS applied → species decided
      ↓
JSON response: {species, confidence, cat_prob, dog_prob, isVeryUnclear}
      ↓
App displays result card
      ↓
soundService.save() → Firestore soundHistory
```

### Authentication Flow

```
App opens
      ↓
Firebase onAuthStateChanged fires
      ↓
User exists? → fetch Firestore user doc
      ↓
isOnboarded = true?  → TabNavigator (Home)
isOnboarded = false? → OnboardingScreen
No user?             → AuthStack (GetStarted)
```

### Alarm Flow

```
User creates appointment with date/time
      ↓
taskService.addUpcoming() → Firestore appointments/{id}
      ↓
scheduleAlarm({id, title, date}) called
      ↓
Two things happen simultaneously:
  1. setTimeout(triggerAlarm, msUntilAlarm)          ← fires if app is open
  2. expo-notifications.scheduleNotificationAsync()  ← fires if app is closed
      ↓
When alarm time arrives:
  App open:   setTimeout fires → playAlarmSound() + Alert dialog
  App closed: Notification fires → user taps → app opens → alarm plays
      ↓
User dismisses alarm
      ↓
taskService.deleteUpcoming() → appointment removed from Firestore
```

---

## 7. Database Structure (Firestore)

```
users/
  {userId}/
    email: string
    displayName: string
    isOnboarded: boolean
    expoPushToken: string
    createdAt: timestamp

    pets/
      {petId}/
        name: string
        petType: "cat" | "dog"
        breed: string
        age: number
        createdAt: timestamp

    tasks/
      {taskId}/
        title: string
        category: string
        time: string
        icon: "food" | "walk" | "litter" | "vet" | "groom" | "play" | "medicine"
        done: boolean
        createdAt: timestamp

    appointments/
      {appointmentId}/
        title: string
        date: timestamp
        icon: string
        notificationId: string
        createdAt: timestamp

    soundHistory/
      {entryId}/
        species: "cat" | "dog"
        confidence: number
        isMock: boolean
        createdAt: timestamp
```

---

## 8. External APIs and Services

### Firebase (Google)
- **Firebase Auth**: Handles user accounts. Supports email/password and Google OAuth.
  Persists sessions automatically — users stay logged in between app restarts.
- **Firestore**: NoSQL real-time database. All app data lives here.
  Real-time listeners (`onSnapshot`) push updates to the UI instantly without polling.
- **Firebase Admin SDK**: Server-side Firestore access from the Flask backend.
  Bypasses client security rules — used for checklist operations.

### Groq API
- Powers the PoofieAI chatbot
- Model: `llama-3.3-70b-versatile` (Meta's LLaMA 3.3, 70 billion parameters)
- Called directly from the app — no backend proxy needed
- System prompt constrains it to pet care topics, 3-4 line answers, no medical diagnoses

### Google YAMNet
- Pre-trained audio classification model from Google
- Trained on AudioSet: 2 million YouTube clips, 521 sound categories
- Runs locally on the Flask server as a TFLite file
- No API calls needed — fully offline inference after the model is downloaded

### Expo Push Notifications
- Used to send notifications to devices even when the app is closed
- The backend calls `https://exp.host/--/api/v2/push/send` with the device's Expo push token
- No FCM (Firebase Cloud Messaging) credentials needed — Expo handles the delivery

### Google OAuth
- Used for "Sign in with Google" button
- Implemented with `expo-auth-session` which opens a browser popup
- Returns an ID token that is exchanged for a Firebase credential

---

## 9. Key Libraries Explained

### `expo-av`
Expo's audio/video library. Used for:
- Recording audio from the microphone (`Audio.Recording`)
- Playing the alarm sound (`Audio.Sound`)
- Metering (measuring volume level in real time for the waveform bars)

### `expo-notifications`
Schedules and receives local notifications. Used for appointment alarms.
On Android it requires a notification channel with MAX importance for alarms.

### `expo-document-picker`
Opens the device file picker so users can upload an existing audio file for analysis
instead of recording live.

### `react-navigation`
The navigation library. Two navigators are used:
- `@react-navigation/stack` — for the auth flow (screens slide in from the right)
- `@react-navigation/bottom-tabs` — for the main app (bottom tab bar)

`useFocusEffect` from react-navigation fires a callback every time a screen becomes active,
used in SoundRecorderScreen to reset state when the user navigates back to it.

### `react-native-svg`
Renders SVG graphics in React Native. Used for all the custom icons in the tab bar
and throughout the UI. SVG paths are written inline in JSX — no separate icon files needed.

### `firebase` (JS SDK)
The client-side Firebase SDK. Handles Auth and Firestore from the app.
Uses `onAuthStateChanged` for persistent sessions and `onSnapshot` for real-time listeners.

### `flask-cors`
Adds CORS headers to Flask responses so the React Native app can make requests
to the backend without being blocked by the browser's same-origin policy.

### `pydub`
Python library for audio manipulation. Used to convert m4a/mp3/ogg files to wav format
before processing. Requires ffmpeg (handled by `static-ffmpeg`).

### `soundfile`
Fast Python library for reading/writing audio files. Reads wav files directly into
numpy arrays. Much faster than librosa for simple loading.

### `scipy.signal.resample_poly`
High-quality audio resampling. Converts audio from any sample rate (44100 Hz, 48000 Hz)
to the 16000 Hz that YAMNet requires, without introducing aliasing artifacts.

### `tensorflow` (TFLite)
Used only for running the YAMNet TFLite model. The `tf.lite.Interpreter` loads the
`.tflite` file and runs inference. The full TensorFlow package is installed but only
the Lite interpreter is used at runtime.

---

## 10. Running the App

### Backend

```bash
cd backend

# First time only: download YAMNet model (4 MB)
python -c "
import urllib.request
urllib.request.urlretrieve(
  'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite',
  'yamnet.tflite'
)
print('Done')
"

# Start the server
python app.py
# Starts on http://0.0.0.0:5000
# YAMNet warms up in background (~5 seconds)
# Ready when you see: YAMNet warm-up complete

# Run tests
python test_analyze.py
python test_analyze.py path/to/audio.wav
```

### Frontend

```bash
# Install dependencies
npm install

# Update backend URL in src/services/api.js
# Change BACKEND_URL to your machine's local IP
# Find it with: ipconfig (Windows) or ifconfig (Mac/Linux)

# Start Expo
npx expo start

# Scan the QR code with Expo Go on your phone
# Phone and computer must be on the same WiFi network
```

### Environment Variables (`backend/.env`)

```
FLASK_ENV=development
PORT=5000

# For production deployment (Railway / Render):
# FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...full JSON...}
```

---

## Summary

PawTalk is built as a clean separation between a React Native frontend and a Python backend:

- The **frontend** handles all UI, navigation, auth, and real-time data sync with Firestore
- The **backend** handles the heavy AI inference (YAMNet) and server-side Firestore operations
- The **chatbot** (Groq) is called directly from the app — no backend needed
- The **database** (Firestore) is the single source of truth for all user data
- **Notifications** work both in-app (setTimeout) and out-of-app (expo-notifications) for reliable alarms

The app degrades gracefully: if the backend is unreachable, sound analysis falls back to a mock
result. If Groq is rate-limited, the chatbot shows a friendly error. If Firebase is unavailable,
the app still renders with cached data.
