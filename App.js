import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import AppNavigator from './src/navigation/AppNavigator';
import { UserProvider } from './src/context/UserContext';
import { AuthProvider } from './src/context/AuthContext';
import { AlarmProvider, useAlarm } from './src/context/AlarmContext';
import {
  setupNotificationChannel,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from './src/services/notifications';
import { taskService } from './src/services/firestore';
import { useAuth } from './src/context/AuthContext';

// Inner component so it can access AlarmContext and AuthContext
function AppWithAlarm() {
  const { triggerAlarm, setOnDismiss } = useAlarm();
  const { user } = useAuth();

  useEffect(() => {
    // When alarm is dismissed, delete the appointment from Firestore
    setOnDismiss((taskId) => {
      if (taskId && user) {
        taskService.deleteUpcoming(user.uid, String(taskId)).catch(() => {});
      }
    });
  }, [user, setOnDismiss]);

  useEffect(() => {
    // Notification received while app is OPEN (background→foreground edge case)
    // The JS timer handles the normal open-app case, this is a safety net
    const unsubReceived = addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data;
      if (data?.type === 'alarm') {
        const title = data.title || notification.request.content.title?.replace('⏰ ', '') || 'Appointment';
        const body  = data.body  || notification.request.content.body || '';
        triggerAlarm({ title, body, taskId: data.taskId });
      }
    });

    // Notification tapped while app was in background — delete appointment
    const unsubResponse = addNotificationResponseListener((response) => {
      const taskId = response.notification.request.content.data?.taskId;
      if (taskId && user) {
        taskService.deleteUpcoming(user.uid, String(taskId)).catch(() => {});
      }
    });

    return () => {
      unsubReceived();
      unsubResponse();
    };
  }, [triggerAlarm, user]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'Poppins-Regular':  require('./src/assets/fonts/Poppins-Regular.ttf'),
    'Poppins-Medium':   require('./src/assets/fonts/Poppins-Medium.ttf'),
    'Poppins-SemiBold': require('./src/assets/fonts/Poppins-SemiBold.ttf'),
    'Poppins-Bold':     require('./src/assets/fonts/Poppins-Bold.ttf'),
  });

  useEffect(() => {
    setupNotificationChannel();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#e64980" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <UserProvider>
        <AlarmProvider>
          <AppWithAlarm />
        </AlarmProvider>
      </UserProvider>
    </AuthProvider>
  );
}
