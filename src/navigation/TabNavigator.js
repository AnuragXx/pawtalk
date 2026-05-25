import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from '../screens/HomeScreen';
import SoundRecorderScreen from '../screens/SoundRecorderScreen';
import ChecklistScreen from '../screens/ChecklistScreen';
import MyPetScreen from '../screens/MyPetScreen';

const Tab = createBottomTabNavigator();
const { width } = Dimensions.get('window');
const scaleX = width / 412;

function TabIcon({ type, color }) {
  if (type === 'home') return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M9 22V12h6v10" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
  if (type === 'mic') return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
  if (type === 'check') return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 6);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: [styles.tabBar, { paddingBottom: bottomPad, height: 54 + bottomPad }],
        tabBarActiveTintColor: '#e64980',
        tabBarInactiveTintColor: '#aaa',
        tabBarLabelStyle: styles.tabLabel,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color }) => {
          const icons = { HomeTab: 'home', Analyze: 'mic', Checklist: 'check', MyPet: 'profile' };
          return <TabIcon type={icons[route.name]} color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} />
      <Tab.Screen name="Analyze" component={SoundRecorderScreen} />
      <Tab.Screen name="Checklist" component={ChecklistScreen} />
      <Tab.Screen name="MyPet" component={MyPetScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f5e0e8',
    paddingTop: 6,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  tabLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 10 * scaleX,
  },
});
