import useHideNavBar from "../hooks/useHideNavBar";
import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, ScrollView, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { TERMS_TEXT } from "./TermsScreen";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

export default function TermsAgreementScreen({ navigation }) {
  useHideNavBar();
  const [agreed, setAgreed] = useState(false);
  const [showError, setShowError] = useState(false);

  const handleContinue = () => {
    if (!agreed) {
      setShowError(true);
      return;
    }
    navigation.replace("PetProfile", { isSetup: true });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <Text style={styles.headerSub}>Please read and accept to continue</Text>
      </View>

      {/* Terms content */}
      <ScrollView style={styles.termsBox} contentContainerStyle={styles.termsScroll} showsVerticalScrollIndicator>
        <Text style={styles.termsText}>{TERMS_TEXT}</Text>
      </ScrollView>

      {/* Error message */}
      {showError && !agreed && (
        <View style={styles.errorBox}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
            <Path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#e64980" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
          <Text style={styles.errorText}>You must agree to the Terms of Service to use PawTalk.</Text>
        </View>
      )}

      {/* Checkbox row */}
      <View style={styles.checkRow}>
        <TouchableOpacity
          style={[styles.checkbox, agreed && styles.checkboxChecked]}
          onPress={() => { setAgreed(!agreed); setShowError(false); }}
          activeOpacity={0.8}
        >
          {agreed && (
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          )}
        </TouchableOpacity>
        <Text style={styles.checkLabel}>
          I have read and agree to the{" "}
          <Text style={styles.link} onPress={() => navigation.navigate("Terms")}>Terms of Service</Text>
          {" "}and{" "}
          <Text style={styles.link} onPress={() => navigation.navigate("Privacy")}>Privacy Policy</Text>
        </Text>
      </View>

      {/* Continue button */}
      <TouchableOpacity
        style={[styles.continueBtn, !agreed && styles.continueBtnDisabled]}
        onPress={handleContinue}
        activeOpacity={0.85}
      >
        <Text style={styles.continueBtnText}>Continue</Text>
      </TouchableOpacity>

      <View style={{ height: 20 }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  header: { paddingHorizontal: 20 * scaleX, paddingTop: 20 * scaleY, paddingBottom: 12 * scaleY },
  headerTitle: { fontFamily: "Poppins-Bold", fontSize: 22 * scaleX, color: "#1a1a1a" },
  headerSub: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#888", marginTop: 4 },

  termsBox: { flex: 1, marginHorizontal: 18 * scaleX, backgroundColor: "#fff", borderRadius: 16, elevation: 3 },
  termsScroll: { padding: 16 * scaleX },
  termsText: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#444", lineHeight: 20 * scaleX },

  errorBox: { flexDirection: "row", alignItems: "center", marginHorizontal: 18 * scaleX, marginTop: 12, backgroundColor: "#fce4ec", borderRadius: 10, padding: 12 },
  errorText: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#e64980", flex: 1 },

  checkRow: { flexDirection: "row", alignItems: "flex-start", marginHorizontal: 18 * scaleX, marginTop: 16, marginBottom: 16 },
  checkbox: { width: 24 * scaleX, height: 24 * scaleX, borderRadius: 6, borderWidth: 2, borderColor: "#ddd", alignItems: "center", justifyContent: "center", marginRight: 12, marginTop: 1, flexShrink: 0 },
  checkboxChecked: { backgroundColor: "#e64980", borderColor: "#e64980" },
  checkLabel: { flex: 1, fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#555", lineHeight: 20 * scaleX },
  link: { color: "#e64980", fontFamily: "Poppins-SemiBold" },

  continueBtn: { marginHorizontal: 18 * scaleX, backgroundColor: "#e64980", borderRadius: 41, height: 58 * scaleY, alignItems: "center", justifyContent: "center", elevation: 6 },
  continueBtnDisabled: { backgroundColor: "#f0a0bc" },
  continueBtnText: { fontFamily: "Poppins-Bold", fontSize: 17 * scaleX, color: "#fff" },
});
