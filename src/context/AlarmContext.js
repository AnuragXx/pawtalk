import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Vibration, Platform,
} from 'react-native';
import { playAlarmSound, stopAlarmSound, scheduleAlarm } from '../services/notifications';

const { width } = Dimensions.get('window');
const scaleX = width / 412;

const AlarmContext = createContext(null);

export function AlarmProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [alarmInfo, setAlarmInfo] = useState({ title: '', body: '', taskId: null });
  const vibrationRef = useRef(null);
  const onDismissRef = useRef(null); // callback set by App.js

  const triggerAlarm = useCallback(async ({ title, body, taskId }) => {
    setAlarmInfo({ title, body, taskId });
    setVisible(true);
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 500, 300, 500, 300, 500], true);
    } else {
      const loop = () => {
        Vibration.vibrate(1000);
        vibrationRef.current = setTimeout(loop, 1500);
      };
      loop();
    }
    await playAlarmSound();
  }, []);

  // App.js calls this to register a cleanup callback for when alarm is dismissed
  const setOnDismiss = useCallback((fn) => {
    onDismissRef.current = fn;
  }, []);

  const stopAlarm = useCallback(async () => {
    Vibration.cancel();
    if (vibrationRef.current) clearTimeout(vibrationRef.current);
    await stopAlarmSound();
    setVisible(false);
  }, []);

  const dismissAlarm = useCallback(async () => {
    await stopAlarm();
    // Fire the dismiss callback (deletes appointment from Firestore)
    if (onDismissRef.current && alarmInfo.taskId) {
      onDismissRef.current(alarmInfo.taskId);
    }
  }, [stopAlarm, alarmInfo]);

  const snoozeAlarm = useCallback(async () => {
    await stopAlarm();
    // Re-schedule 5 minutes later (no onFire needed — will use notification)
    const snoozeDate = new Date(Date.now() + 5 * 60 * 1000);
    await scheduleAlarm({
      id: alarmInfo.taskId ? `snooze_${alarmInfo.taskId}` : `snooze_${Date.now()}`,
      title: alarmInfo.title,
      body: alarmInfo.body,
      date: snoozeDate,
    });
  }, [stopAlarm, alarmInfo]);

  return (
    <AlarmContext.Provider value={{ triggerAlarm, setOnDismiss }}>
      {children}

      <Modal
        visible={visible}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismissAlarm}
      >
        <View style={styles.fullScreen}>
          <View style={styles.pulseRing} />
          <Text style={styles.emoji}>⏰</Text>
          <Text style={styles.alarmLabel}>ALARM</Text>
          <Text style={styles.title}>{alarmInfo.title}</Text>
          {!!alarmInfo.body && <Text style={styles.body}>{alarmInfo.body}</Text>}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.snoozeBtn} onPress={snoozeAlarm} activeOpacity={0.85}>
              <Text style={styles.snoozeTxt}>Snooze 5 min</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dismissBtn} onPress={dismissAlarm} activeOpacity={0.85}>
              <Text style={styles.dismissTxt}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </AlarmContext.Provider>
  );
}

export function useAlarm() {
  return useContext(AlarmContext);
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: '#1a0010',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32 * scaleX,
  },
  pulseRing: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 2,
    borderColor: 'rgba(230,73,128,0.3)',
  },
  emoji: { fontSize: 80, marginBottom: 16 },
  alarmLabel: {
    fontFamily: 'Poppins-Bold',
    fontSize: 36 * scaleX,
    color: '#e64980',
    letterSpacing: 8,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Poppins-Bold',
    fontSize: 22 * scaleX,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontFamily: 'Poppins-Regular',
    fontSize: 15 * scaleX,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 48,
  },
  btnRow: { flexDirection: 'row', gap: 16, marginTop: 40 },
  snoozeBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#e64980',
    alignItems: 'center',
  },
  snoozeTxt: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15 * scaleX,
    color: '#e64980',
  },
  dismissBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 40,
    backgroundColor: '#e64980',
    alignItems: 'center',
    shadowColor: '#e64980',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  dismissTxt: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15 * scaleX,
    color: '#fff',
  },
});
