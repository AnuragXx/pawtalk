import useHideNavBar from "../hooks/useHideNavBar";
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

export default function PrivacyScreen({ navigation }) {
  useHideNavBar();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.body}>{PRIVACY_TEXT}</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const PRIVACY_TEXT = `Last updated: April 26, 2026

1. INTRODUCTION
PawTalk ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our mobile application.

2. INFORMATION WE COLLECT

a) Account Information
• Email address and password (stored securely via Firebase Authentication)
• Display name (owner name)

b) Pet Profile Data
• Pet name, type, breed, age, sex, color, and description
• Pet profile photo (stored as a local device URI)

c) Usage Data
• Sound analysis results and history
• Daily care tasks and appointments
• Chat messages with PoofieAI

d) Device Information
• Device type and operating system (for app compatibility)
• Microphone access (only when recording pet sounds)
• Photo library access (only when uploading a pet photo)

3. HOW WE USE YOUR INFORMATION
• To provide and improve the App's features
• To personalize your experience (e.g., greeting you by name)
• To store your pet care data across sessions
• To provide AI-powered pet care guidance

4. DATA STORAGE
Your data is stored securely using Google Firebase (Firestore). We do not sell your personal data to third parties.

5. THIRD-PARTY SERVICES
PawTalk uses the following third-party services:
• Google Firebase — authentication and database
• Google Gemini AI — powering the PoofieAI chatbot
• Expo — app framework and device APIs

6. AUDIO DATA
Audio recordings made in the Sound Analysis feature are processed locally on your device. Audio files are not uploaded to any server.

7. CHILDREN'S PRIVACY
PawTalk is not directed to children under 13. We do not knowingly collect personal information from children under 13.

8. YOUR RIGHTS
You have the right to:
• Access your personal data
• Correct inaccurate data
• Delete your account and associated data
• Withdraw consent at any time

To exercise these rights, contact us at support@pawtalk.app

9. DATA RETENTION
We retain your data for as long as your account is active. When you delete your account, your data is permanently removed from our systems.

10. SECURITY
We implement industry-standard security measures to protect your data. However, no method of transmission over the internet is 100% secure.

11. CHANGES TO THIS POLICY
We may update this Privacy Policy from time to time. We will notify you of significant changes through the App.

12. CONTACT US
If you have questions about this Privacy Policy, contact us at:
Email: support@pawtalk.app
Website: www.pawtalk.app`;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 * scaleX, paddingVertical: 14 * scaleY, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f5e0e8" },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: "Poppins-Bold", fontSize: 18 * scaleX, color: "#1a1a1a" },
  scroll: { padding: 20 * scaleX },
  body: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#333", lineHeight: 22 * scaleX },
});
