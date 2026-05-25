/**
 * Alarm service for PawTalk.
 *
 * TWO-LAYER ALARM SYSTEM:
 * 1. When app is OPEN: precise JS setTimeout fires triggerAlarm directly — zero delay
 * 2. When app is BACKGROUND/CLOSED: expo-notifications fires a MAX-priority notification
 *
 * The JS timer is always registered alongside the notification so whichever fires first
 * (timer when open, notification when closed) handles it.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';

// Show notifications when app is in foreground (needed for background→foreground case)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false, // We handle it ourselves via the listener
    shouldPlaySound: false,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

// ─── Permissions ──────────────────────────────────────────────────────────────
export async function requestNotificationPermissions() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (_) {
    return false;
  }
}

// ─── Android alarm channel ────────────────────────────────────────────────────
export async function setupNotificationChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('alarms', {
      name: 'Pet Alarms',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 500, 300, 500, 300, 500],
      lightColor: '#e64980',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      enableVibrate: true,
    });
  } catch (_) {}
}

// ─── In-app alarm sound ───────────────────────────────────────────────────────
let alarmSound = null;

export async function playAlarmSound() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
    });
    // Unload any previous instance first
    if (alarmSound) {
      try { await alarmSound.unloadAsync(); } catch (_) {}
      alarmSound = null;
    }
    const { sound } = await Audio.Sound.createAsync(
      require('../assets/sounds/alarm.mp3'),
      { isLooping: true, volume: 1.0, shouldPlay: true }
    );
    alarmSound = sound;
    return alarmSound;
  } catch (e) {
    console.warn('playAlarmSound failed:', e.message);
    return null;
  }
}

export async function stopAlarmSound() {
  try {
    if (alarmSound) {
      await alarmSound.stopAsync();
      await alarmSound.unloadAsync();
      alarmSound = null;
    }
  } catch (_) {}
}

// ─── JS timer registry (for precise in-app firing) ───────────────────────────
const jsTimers = {};

// ─── Schedule alarm ───────────────────────────────────────────────────────────
// onFire: optional callback invoked by the JS timer when app is open
export async function scheduleAlarm({ id, title, body, date, onFire }) {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return null;

    await setupNotificationChannel();

    const trigger = new Date(date);
    const msUntil = trigger.getTime() - Date.now();
    if (msUntil <= 0) return null;

    // Cancel any existing alarm with this id
    await cancelAlarm(id);

    // 1. JS timer — fires precisely when app is open
    if (onFire) {
      jsTimers[String(id)] = setTimeout(() => {
        delete jsTimers[String(id)];
        onFire({ title, body, taskId: id });
      }, msUntil);
    }

    // 2. Notification — fires when app is background/closed
    const notifId = await Notifications.scheduleNotificationAsync({
      identifier: String(id),
      content: {
        title: `⏰ ${title}`,
        body: body || `Time for: ${title}`,
        sound: 'default',
        priority: 'max',
        vibrate: [0, 500, 300, 500, 300, 500],
        data: { taskId: id, type: 'alarm', title, body: body || `Time for: ${title}` },
        ...(Platform.OS === 'android' && {
          color: '#e64980',
          sticky: false,
          autoDismiss: false,
        }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
        channelId: 'alarms',
      },
    });

    return notifId;
  } catch (e) {
    console.warn('scheduleAlarm failed:', e.message);
    return null;
  }
}

export const scheduleReminder = scheduleAlarm;

// ─── Cancel alarm ─────────────────────────────────────────────────────────────
export async function cancelAlarm(id) {
  try {
    const key = String(id);
    // Cancel JS timer
    if (jsTimers[key]) {
      clearTimeout(jsTimers[key]);
      delete jsTimers[key];
    }
    // Cancel notification
    await Notifications.cancelScheduledNotificationAsync(key);
  } catch (_) {}
}

export const cancelReminder = cancelAlarm;

// ─── Notification listeners ───────────────────────────────────────────────────
export function addNotificationResponseListener(callback) {
  const sub = Notifications.addNotificationResponseReceivedListener(callback);
  return () => sub.remove();
}

export function addNotificationReceivedListener(callback) {
  const sub = Notifications.addNotificationReceivedListener(callback);
  return () => sub.remove();
}
