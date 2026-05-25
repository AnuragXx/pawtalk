import useHideNavBar from "../hooks/useHideNavBar";
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

export const TERMS_TEXT = `Last updated: April 26, 2026

1. ACCEPTANCE OF TERMS
By downloading, installing, or using PawTalk ("the App"), you agree to be bound by these Terms of Service. If you do not agree, do not use the App.

2. DESCRIPTION OF SERVICE
PawTalk is a pet care application that provides:
• AI-powered sound analysis to interpret pet emotions
• Daily care checklists and reminders
• An AI chatbot (PoofieAI) for pet care guidance
• Pet profile management

3. USER ACCOUNTS
You must create an account to use PawTalk. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. You must provide accurate and complete information when creating your account.

4. ACCEPTABLE USE
You agree not to:
• Use the App for any unlawful purpose
• Attempt to gain unauthorized access to any part of the App
• Upload harmful, offensive, or inappropriate content
• Misuse the AI features for purposes other than pet care

5. AI AND SOUND ANALYSIS DISCLAIMER
The sound analysis and AI chatbot features are provided for informational and entertainment purposes only. Results are not a substitute for professional veterinary advice, diagnosis, or treatment. Always consult a qualified veterinarian for your pet's health concerns.

6. INTELLECTUAL PROPERTY
All content, features, and functionality of PawTalk are owned by PawTalk and are protected by intellectual property laws. You may not copy, modify, or distribute any part of the App without prior written consent.

7. DATA AND PRIVACY
Your use of the App is also governed by our Privacy Policy. By using PawTalk, you consent to the collection and use of your data as described in the Privacy Policy.

8. LIMITATION OF LIABILITY
PawTalk is provided "as is" without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the App.

9. TERMINATION
We reserve the right to suspend or terminate your account at any time for violation of these Terms.

10. CHANGES TO TERMS
We may update these Terms at any time. Continued use of the App after changes constitutes acceptance of the new Terms.

11. CONTACT
For questions about these Terms, contact us at support@pawtalk.app`;

export default function TermsScreen({ navigation }) {
  useHideNavBar();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.body}>{TERMS_TEXT}</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 * scaleX, paddingVertical: 14 * scaleY, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f5e0e8" },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: "Poppins-Bold", fontSize: 18 * scaleX, color: "#1a1a1a" },
  scroll: { padding: 20 * scaleX },
  body: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#333", lineHeight: 22 * scaleX },
});
