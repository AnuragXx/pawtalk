import useHideNavBar from "../hooks/useHideNavBar";
import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Dimensions, ScrollView, ActivityIndicator, Alert, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "../context/AuthContext";
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

export default function SignInScreen({ navigation }) {
  useHideNavBar();
  const { signInWithEmail, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});

  // Forgot password modal state
  const [forgotModal, setForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const validate = () => {
    const e = {};
    if (!email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = "Enter a valid email";
    if (!password) e.password = "Password is required";
    else if (password.length < 6) e.password = "Password must be at least 6 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignIn = async () => {
    if (!validate()) return;
    const res = await signInWithEmail(email.trim(), password);
    if (!res.success) Alert.alert("Sign In Failed", res.message);
  };

  const openForgotModal = () => {
    // Pre-fill with whatever email is already typed in the sign-in field
    setResetEmail(email.trim());
    setResetError("");
    setResetSent(false);
    setForgotModal(true);
  };

  const handleSendReset = async () => {
    const trimmed = resetEmail.trim();
    if (!trimmed) { setResetError("Please enter your email address."); return; }
    if (!/\S+@\S+\.\S+/.test(trimmed)) { setResetError("Enter a valid email address."); return; }

    setResetLoading(true);
    setResetError("");
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setResetSent(true);
    } catch (e) {
      const code = e.code || "";
      if (code === "auth/user-not-found" || code === "auth/invalid-email") {
        setResetError("No account found with this email address.");
      } else if (code === "auth/too-many-requests") {
        setResetError("Too many attempts. Please wait a few minutes and try again.");
      } else if (code === "auth/network-request-failed") {
        setResetError("Network error. Check your internet connection.");
      } else {
        setResetError("Could not send reset email. Please try again.");
      }
    } finally {
      setResetLoading(false);
    }
  };

  const closeForgotModal = () => {
    setForgotModal(false);
    setResetEmail("");
    setResetError("");
    setResetSent(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.blobTopRight} />
      <View style={styles.blobBottomLeft} />
      <View style={styles.blobBottomRight} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{"Welcome\nBack"}</Text>
        <Text style={styles.subtitle}>Hey! Good to see you again</Text>

        <View style={styles.inputWrapper}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" style={styles.inputIcon}>
            <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
            <Path d="M22 6l-10 7L2 6" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={t => { setEmail(t); setErrors(e => ({ ...e, email: null })); }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
        {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

        <View style={styles.inputWrapper}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" style={styles.inputIcon}>
            <Path d="M12.65 10C11.83 7.67 9.61 6 7 6C3.69 6 1 8.69 1 12C1 15.31 3.69 18 7 18C9.61 18 11.83 16.33 12.65 14H17V18H21V14H23V10H12.65ZM7 14C5.9 14 5 13.1 5 12C5 10.9 5.9 10 7 10C8.1 10 9 10.9 9 12C9 13.1 8.1 14 7 14Z" fill="#9CA3AF" />
          </Svg>
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={t => { setPassword(t); setErrors(e => ({ ...e, password: null })); }}
            secureTextEntry
          />
        </View>
        {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

        <TouchableOpacity onPress={openForgotModal} style={styles.forgotBtn}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn} activeOpacity={0.85} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#000" /> : <Text style={styles.signInText}>Sign In</Text>}
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("SignUp")}>
            <Text style={styles.footerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Forgot Password Modal ── */}
      <Modal visible={forgotModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>

            {resetSent ? (
              /* Success state */
              <>
                <View style={styles.successIcon}>
                  <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
                    <Path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="#4caf50" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                    <Path d="M22 4L12 14.01l-3-3" stroke="#4caf50" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                  </Svg>
                </View>
                <Text style={styles.modalTitle}>Email Sent!</Text>
                <Text style={styles.modalSubtitle}>
                  A password reset link has been sent to{"\n"}
                  <Text style={styles.resetEmailText}>{resetEmail}</Text>
                  {"\n\n"}Check your inbox and follow the link to reset your password.
                </Text>
                <Text style={styles.spamNote}>Didn't receive it? Check your spam folder.</Text>
                <TouchableOpacity style={styles.doneBtn} onPress={closeForgotModal}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Input state */
              <>
                <Text style={styles.modalTitle}>Reset Password</Text>
                <Text style={styles.modalSubtitle}>
                  Enter your email address and we'll send you a link to reset your password.
                </Text>

                <Text style={styles.fieldLabel}>Email Address</Text>
                <View style={styles.modalInputWrapper}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" style={{ marginRight: 10 }}>
                    <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                    <Path d="M22 6l-10 7L2 6" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                  </Svg>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="your@email.com"
                    placeholderTextColor="#bbb"
                    value={resetEmail}
                    onChangeText={t => { setResetEmail(t); setResetError(""); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoFocus
                  />
                </View>

                {resetError ? (
                  <View style={styles.errorBox}>
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
                      <Path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#e64980" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                    </Svg>
                    <Text style={styles.errorBoxText}>{resetError}</Text>
                  </View>
                ) : null}

                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={closeForgotModal}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.sendBtn} onPress={handleSendReset} disabled={resetLoading}>
                    {resetLoading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.sendBtnText}>Send Link</Text>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}

          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  blobTopRight: { position: "absolute", top: -51 * scaleY, left: 206 * scaleX, width: 185 * scaleX, height: 171 * scaleY, backgroundColor: "#ff6b9a", borderRadius: 9999 },
  blobBottomLeft: { position: "absolute", top: 488 * scaleY, left: -284 * scaleX, width: 745 * scaleX, height: 642 * scaleY, backgroundColor: "#ff6b9a", borderRadius: 9999 },
  blobBottomRight: { position: "absolute", top: 666 * scaleY, left: 155 * scaleX, width: 323 * scaleX, height: 320 * scaleY, backgroundColor: "#e64980", borderRadius: 9999 },
  scroll: { paddingHorizontal: 27 * scaleX, paddingTop: 100 * scaleY, paddingBottom: 40 },
  title: { fontFamily: "Poppins-SemiBold", fontSize: 55 * scaleX, color: "#000", lineHeight: 65 * scaleX, marginBottom: 8 * scaleY },
  subtitle: { fontFamily: "Poppins-SemiBold", fontSize: 20 * scaleX, color: "#000", marginBottom: 30 * scaleY },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 41, height: 65 * scaleY, paddingHorizontal: 28 * scaleX, marginBottom: 4 * scaleY, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontFamily: "Poppins-Regular", fontSize: 16 * scaleX, color: "#333" },
  errorText: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#e64980", marginBottom: 8, marginLeft: 16 },
  forgotBtn: { alignSelf: "flex-end", marginBottom: 24, marginTop: 4 },
  forgotText: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#e64980" },
  signInBtn: { backgroundColor: "#fff", borderRadius: 41, height: 65 * scaleY, alignItems: "center", justifyContent: "center", marginBottom: 20 * scaleY, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 8 },
  signInText: { fontFamily: "Poppins-Bold", fontSize: 20 * scaleX, color: "#000" },
  footerRow: { flexDirection: "row", justifyContent: "center" },
  footerText: { fontFamily: "Poppins-Bold", fontSize: 16 * scaleX, color: "rgba(255,255,255,0.7)" },
  footerLink: { fontFamily: "Poppins-Bold", fontSize: 16 * scaleX, color: "#fff" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28 * scaleX, paddingBottom: 44 },
  modalTitle: { fontFamily: "Poppins-Bold", fontSize: 22 * scaleX, color: "#1a1a1a", marginBottom: 8, textAlign: "center" },
  modalSubtitle: { fontFamily: "Poppins-Regular", fontSize: 14 * scaleX, color: "#666", textAlign: "center", lineHeight: 22 * scaleX, marginBottom: 24 },
  fieldLabel: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#555", marginBottom: 8 },
  modalInputWrapper: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#f0d0da", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, backgroundColor: "#fff9fb" },
  modalInput: { flex: 1, fontFamily: "Poppins-Regular", fontSize: 15 * scaleX, color: "#333" },
  errorBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#fce4ec", borderRadius: 10, padding: 12, marginBottom: 16 },
  errorBoxText: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#e64980", flex: 1 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1.5, borderColor: "#ddd", alignItems: "center" },
  cancelBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 15 * scaleX, color: "#888" },
  sendBtn: { flex: 1, paddingVertical: 15, borderRadius: 14, backgroundColor: "#e64980", alignItems: "center", shadowColor: "#e64980", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  sendBtnText: { fontFamily: "Poppins-Bold", fontSize: 15 * scaleX, color: "#fff" },

  // Success state
  successIcon: { alignItems: "center", marginBottom: 16 },
  resetEmailText: { fontFamily: "Poppins-SemiBold", color: "#e64980" },
  spamNote: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#aaa", textAlign: "center", marginBottom: 24 },
  doneBtn: { backgroundColor: "#e64980", borderRadius: 14, paddingVertical: 15, alignItems: "center", shadowColor: "#e64980", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  doneBtnText: { fontFamily: "Poppins-Bold", fontSize: 16 * scaleX, color: "#fff" },
});
