# 🎯 How to Test the ML Model Integration

## ✅ Current Status
- ✅ Backend is running on `http://192.168.0.103:5000`
- ✅ Model file loaded successfully
- ✅ Python and all dependencies installed
- ✅ Firewall allows Python connections
- ⚠️ App needs to be restarted to connect

## 📱 Step-by-Step Testing Instructions

### Step 1: Restart Your Expo App (IMPORTANT!)

The app is still using the old code. You MUST restart it:

1. **On your PC terminal** where Expo is running:
   - Press `Ctrl + C` to stop Expo
   - Wait for it to fully stop
   - Run: `npx expo start`

2. **On your phone**:
   - Close the PawTalk app completely (swipe it away from recent apps)
   - Wait 5 seconds
   - Open the app again from Expo Go

### Step 2: Verify Backend is Running

Check the terminal where you ran `python app.py` in the `backend` folder.

You should see:
```
2026-04-30 00:27:22,311 [INFO] Starting PawTalk backend on port 5000
 * Running on http://192.168.0.103:5000
```

If not running, open a terminal in the `backend` folder and run:
```bash
python app.py
```

### Step 3: Test from Your Phone's Browser

**Before testing in the app**, verify your phone can reach the backend:

1. Open **Chrome** or **Safari** on your phone
2. Go to: `http://192.168.0.103:5000`
3. You should see: `{"status":"ok","service":"PawTalk Backend"}`

**If this doesn't work:**
- Make sure your phone is on the **same WiFi** as your PC
- Check WiFi name on both devices
- Try turning WiFi off and on again on your phone

### Step 4: Test in the App

1. Open PawTalk app on your phone
2. Go to the **"Analyze"** tab (microphone icon)
3. Tap the **microphone button** to start recording
4. Play a cat or dog sound (you can use YouTube on another device)
5. Tap the microphone again to stop
6. Wait for analysis

### Step 5: Check the Logs

**On your PC - Backend Terminal:**
When you analyze audio, you should see:
```
📥 POST /analyze from 192.168.0.XXX
   Content-Type: multipart/form-data
Prediction: dog (85.3%)
```

**On your PC - Expo Terminal:**
You should see:
```
🔍 soundAPI.analyze called
   Backend URL: http://192.168.0.103:5000
📤 Sending request to: http://192.168.0.103:5000/analyze
✅ Backend response: {species: "dog", confidence: 85.3, ...}
```

**On your phone - App Screen:**
- If working: Shows result WITHOUT "Demo" badge
- If not working: Shows result WITH "Demo" badge

## 🎉 Success Indicators

### ✅ It's Working When:
1. Backend terminal shows incoming POST requests
2. Expo terminal shows "✅ Backend response"
3. App shows result WITHOUT "Demo" badge
4. Confidence percentage varies (not always 70-90%)
5. Backend logs show "Prediction: cat/dog (XX.X%)"

### ❌ Still Using Mock When:
1. Backend terminal shows NO requests
2. Expo terminal shows "⚠️ Sound analysis error"
3. App shows "Demo" badge on result
4. Confidence is random 70-90%

## 🔧 Troubleshooting

### Problem: "Demo" badge still appears

**Solution 1: Hard restart everything**
```bash
# 1. Stop backend (Ctrl+C in backend terminal)
# 2. Stop Expo (Ctrl+C in Expo terminal)
# 3. Close app on phone
# 4. Start backend: python app.py
# 5. Start Expo: npx expo start
# 6. Open app on phone
```

**Solution 2: Check the URL**
Open `src/services/api.js` and verify line 11:
```javascript
const BACKEND_URL = "http://192.168.0.103:5000";
```
No spaces, correct IP address.

**Solution 3: Clear Expo cache**
```bash
npx expo start --clear
```

### Problem: "Network request failed"

This means your phone can't reach your PC.

**Check:**
1. Both devices on same WiFi? (Check WiFi name)
2. Can you open `http://192.168.0.103:5000` in phone's browser?
3. Is Windows Firewall blocking? (Already allowed, but double-check)

**Quick fix:**
```bash
# Run this as Administrator in PowerShell:
netsh advfirewall firewall add rule name="Flask Port 5000" dir=in action=allow protocol=TCP localport=5000
```

### Problem: Backend crashes when analyzing

Check backend terminal for error messages. Common issues:
- Model file corrupted → Re-download from Colab
- Audio file format not supported → Try different audio file
- Out of memory → Close other programs

## 📊 What to Expect

### First Test (with real audio):
```
Species: Dog
Confidence: 87.3%
Emotion: Excited and Playful 🎾
(NO "Demo" badge)
```

### Mock/Demo Mode (when backend unreachable):
```
Species: Dog
Confidence: 82.1%
Emotion: Alert 👀
Demo (badge appears)
```

## 🎬 Quick Test Video Workflow

1. Start backend: `python app.py` in backend folder
2. Start Expo: `npx expo start` in project root
3. Open app on phone
4. Go to Analyze tab
5. Record a pet sound (or upload)
6. Watch both terminals for logs
7. Check result on phone

## 📞 Need Help?

If it's still not working after following all steps:

1. Take a screenshot of:
   - Backend terminal (showing logs)
   - Expo terminal (showing logs)
   - App screen (showing result with "Demo" badge)
   - Phone's WiFi settings

2. Run this and share output:
   ```bash
   cd backend
   python test_connection.py
   ```

3. Check `backend/TROUBLESHOOTING.md` for advanced debugging

---

**Remember**: The most common issue is forgetting to restart the Expo app after changing the code! Always do a full restart (Ctrl+C, then start again) when testing.
