import React from 'react';
import { View, ActivityIndicator, Animated } from 'react-native';
import { createStackNavigator, TransitionPresets, CardStyleInterpolators } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';

import SplashScreen from '../screens/SplashScreen';
import GetStartedScreen from '../screens/GetStartedScreen';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import PetProfileSetupScreen from '../screens/PetProfileScreen';
import ChatbotScreen from '../screens/ChatbotScreen';
import SoundHistoryScreen from '../screens/SoundHistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TermsScreen from '../screens/TermsScreen';
import PrivacyScreen from '../screens/PrivacyScreen';
import TermsAgreementScreen from '../screens/TermsAgreementScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import TabNavigator from './TabNavigator';

const Stack = createStackNavigator();

function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        ...TransitionPresets.SlideFromRightIOS,
        gestureEnabled: true,
      }}
      initialRouteName="Splash"
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="GetStarted" component={GetStartedScreen} />
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  );
}

function AppStack({ isNewUser }) {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        ...TransitionPresets.SlideFromRightIOS,
        gestureEnabled: true,
        transitionSpec: {
          open:  { animation: "spring", config: { stiffness: 1000, damping: 80, mass: 1, overshootClamping: true } },
          close: { animation: "spring", config: { stiffness: 1000, damping: 80, mass: 1, overshootClamping: true } },
        },
      }}
      initialRouteName={isNewUser ? "Onboarding" : "Home"}
    >
      <Stack.Screen name="Home" component={TabNavigator} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="TermsAgreement" component={TermsAgreementScreen} />
      <Stack.Screen name="PetProfile" component={PetProfileSetupScreen} />
      <Stack.Screen name="Chatbot" component={ChatbotScreen} />
      <Stack.Screen name="SoundHistory" component={SoundHistoryScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, isLoading, isNewUser } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff1f1' }}>
        <ActivityIndicator size="large" color="#e64980" />
      </View>
    );
  }

  return user ? <AppStack isNewUser={isNewUser} key={isNewUser ? "new" : "existing"} /> : <AuthStack />;
}
