import useHideNavBar from "../hooks/useHideNavBar";
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "../context/AuthContext";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

export default function SignUpScreen({ navigation }) {
  useHideNavBar();
  const { signUpWithEmail, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = "Enter a valid email";
    if (!password) e.password = "Password is required";
    else if (password.length < 6) e.password = "Password must be at least 6 characters";
    if (!confirmPassword) e.confirm = "Please confirm your password";
    else if (password !== confirmPassword) e.confirm = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignUp = async () => {
    if (!validate()) return;
    const res = await signUpWithEmail(email.trim(), password);
    if (!res.success) Alert.alert("Sign Up Failed", res.message);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.blobTopLeft} />
      <View style={styles.blobTopRight} />
      <View style={styles.circleTopRight} />
      <View style={styles.blobBottom} />
      <View style={styles.blobBottomRight} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Sign Up</Text>
        <Text style={styles.subtitle}>Hello! Join Us</Text>

        <View style={styles.inputWrapper}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" style={styles.inputIcon}>
            <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
            <Path d="M22 6l-10 7L2 6" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#9CA3AF" value={email} onChangeText={t => { setEmail(t); setErrors(e => ({ ...e, email: null })); }} keyboardType="email-address" autoCapitalize="none" />
        </View>
        {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

        <View style={styles.inputWrapper}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" style={styles.inputIcon}>
            <Path d="M12.65 10C11.83 7.67 9.61 6 7 6C3.69 6 1 8.69 1 12C1 15.31 3.69 18 7 18C9.61 18 11.83 16.33 12.65 14H17V18H21V14H23V10H12.65ZM7 14C5.9 14 5 13.1 5 12C5 10.9 5.9 10 7 10C8.1 10 9 10.9 9 12C9 13.1 8.1 14 7 14Z" fill="#9CA3AF" />
          </Svg>
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#9CA3AF" value={password} onChangeText={t => { setPassword(t); setErrors(e => ({ ...e, password: null })); }} secureTextEntry />
        </View>
        {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

        <View style={styles.inputWrapper}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" style={styles.inputIcon}>
            <Path d="M12.65 10C11.83 7.67 9.61 6 7 6C3.69 6 1 8.69 1 12C1 15.31 3.69 18 7 18C9.61 18 11.83 16.33 12.65 14H17V18H21V14H23V10H12.65ZM7 14C5.9 14 5 13.1 5 12C5 10.9 5.9 10 7 10C8.1 10 9 10.9 9 12C9 13.1 8.1 14 7 14Z" fill="#9CA3AF" />
          </Svg>
          <TextInput style={styles.input} placeholder="Confirm Password" placeholderTextColor="#9CA3AF" value={confirmPassword} onChangeText={t => { setConfirmPassword(t); setErrors(e => ({ ...e, confirm: null })); }} secureTextEntry />
        </View>
        {errors.confirm && <Text style={styles.errorText}>{errors.confirm}</Text>}

        <TouchableOpacity style={styles.signUpBtn} onPress={handleSignUp} activeOpacity={0.85} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#000" /> : <Text style={styles.signUpText}>Sign Up</Text>}
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("SignIn")}>
            <Text style={styles.footerLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  blobTopLeft: { position: "absolute", top: -135 * scaleY, left: -75 * scaleX, width: 471 * scaleX, height: 454 * scaleY, backgroundColor: "#fff", borderRadius: 9999 },
  blobTopRight: { position: "absolute", top: -87 * scaleY, left: 264 * scaleX, width: 295 * scaleX, height: 275 * scaleY, backgroundColor: "#ff6b9a", borderRadius: 9999 },
  circleTopRight: { position: "absolute", top: 92 * scaleY, left: 317 * scaleX, width: 157 * scaleX, height: 157 * scaleY, backgroundColor: "#e64980", borderRadius: 9999 },
  blobBottom: { position: "absolute", top: 602 * scaleY, left: -85 * scaleX, width: 745 * scaleX, height: 642 * scaleY, backgroundColor: "#e64980", borderRadius: 9999 },
  blobBottomRight: { position: "absolute", top: 686 * scaleY, left: 206 * scaleX, width: 323 * scaleX, height: 320 * scaleY, backgroundColor: "#ff6b9a", borderRadius: 9999 },
  scroll: { paddingHorizontal: 27 * scaleX, paddingTop: 100 * scaleY, paddingBottom: 40 },
  title: { fontFamily: "Poppins-SemiBold", fontSize: 55 * scaleX, color: "#000", zIndex: 10 },
  subtitle: { fontFamily: "Poppins-SemiBold", fontSize: 20 * scaleX, color: "#000", marginBottom: 30 * scaleY, zIndex: 10 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 41, height: 65 * scaleY, paddingHorizontal: 28 * scaleX, marginBottom: 4 * scaleY, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3, zIndex: 10 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontFamily: "Poppins-Regular", fontSize: 16 * scaleX, color: "#333" },
  errorText: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#e64980", marginBottom: 8, marginLeft: 16, zIndex: 10 },
  signUpBtn: { backgroundColor: "#fff", borderRadius: 41, height: 65 * scaleY, alignItems: "center", justifyContent: "center", marginBottom: 20 * scaleY, marginTop: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 8, zIndex: 10 },
  signUpText: { fontFamily: "Poppins-Bold", fontSize: 20 * scaleX, color: "#000" },
  footerRow: { flexDirection: "row", justifyContent: "center", zIndex: 10 },
  footerText: { fontFamily: "Poppins-Bold", fontSize: 16 * scaleX, color: "rgba(255,255,255,0.7)" },
  footerLink: { fontFamily: "Poppins-Bold", fontSize: 16 * scaleX, color: "#fff" },
});
