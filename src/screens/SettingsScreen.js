import useHideNavBar from "../hooks/useHideNavBar";
import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Alert, ScrollView, Modal, TextInput, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "../config/firebase";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

function SettingRow({ icon, label, onPress, danger, sublabel }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, { backgroundColor: danger ? "#fce4ec" : "#f5f5f5" }]}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path d={icon} stroke={danger ? "#e64980" : "#555"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
        </Svg>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && { color: "#e64980" }]}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path d="M9 18l6-6-6-6" stroke="#ccc" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
      </Svg>
    </TouchableOpacity>
  );
}

export default function SettingsScreen({ navigation }) {
  useHideNavBar();
  const { user, logout } = useAuth();
  const { ownerName } = useUser();

  const displayName = ownerName || user?.displayName || (user?.email ? user.email.split("@")[0] : "User");
  const initial = displayName ? displayName.charAt(0).toUpperCase() : "?";

  // Change password modal state
  const [pwModal, setPwModal] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");

  const handleChangePassword = async () => {
    setPwError("");
    if (!currentPw) { setPwError("Enter your current password."); return; }
    if (!newPw || newPw.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    if (newPw !== confirmPw) { setPwError("Passwords do not match."); return; }

    setPwLoading(true);
    try {
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(auth.currentUser, credential);
      // Update password
      await updatePassword(auth.currentUser, newPw);
      setPwModal(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      Alert.alert("Success", "Password updated successfully.");
    } catch (e) {
      const code = e.code || "";
      if (code.includes("wrong-password") || code.includes("invalid-credential")) {
        setPwError("Current password is incorrect.");
      } else if (code.includes("weak-password")) {
        setPwError("New password is too weak.");
      } else if (code.includes("requires-recent-login")) {
        setPwError("Session expired. Please sign out and sign in again.");
      } else {
        setPwError("Could not update password. Please try again.");
      }
    } finally {
      setPwLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => Alert.alert("Contact Support", "Please contact support@pawtalk.app to delete your account.") },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile card */}
        <TouchableOpacity
          style={styles.profileCard}
          onPress={() => navigation.navigate("UserProfile")}
          activeOpacity={0.85}
        >
          <View style={styles.profileAvatarInitial}>
            <Text style={styles.profileAvatarInitialText}>{initial}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileEmail}>{user?.email || ""}</Text>
            <Text style={styles.profileEditHint}>Tap to edit profile →</Text>
          </View>
        </TouchableOpacity>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.section}>
          <SettingRow
            icon="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            label="Change Password"
            sublabel="Update your account password"
            onPress={() => { setPwError(""); setPwModal(true); }}
          />
          <SettingRow
            icon="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            label="Sign Out"
            onPress={handleLogout}
            danger
          />
        </View>

        {/* App */}
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.section}>
          <SettingRow
            icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            label="Analysis History"
            onPress={() => navigation.navigate("SoundHistory")}
          />
          <SettingRow
            icon="M9 12h6M9 16h6M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h5l5 5v11a2 2 0 01-2 2z"
            label="Terms of Service"
            onPress={() => navigation.navigate("Terms")}
          />
          <SettingRow
            icon="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
            label="Privacy Policy"
            onPress={() => navigation.navigate("Privacy")}
          />
        </View>

        {/* Danger zone */}
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <View style={styles.section}>
          <SettingRow
            icon="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            label="Delete Account"
            onPress={handleDeleteAccount}
            danger
          />
        </View>

        <Text style={styles.version}>PawTalk v1.0.0</Text>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal visible={pwModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Password</Text>

            <Text style={styles.fieldLabel}>Current Password</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter current password"
              placeholderTextColor="#bbb"
              value={currentPw}
              onChangeText={t => { setCurrentPw(t); setPwError(""); }}
              secureTextEntry
            />

            <Text style={styles.fieldLabel}>New Password</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="At least 6 characters"
              placeholderTextColor="#bbb"
              value={newPw}
              onChangeText={t => { setNewPw(t); setPwError(""); }}
              secureTextEntry
            />

            <Text style={styles.fieldLabel}>Confirm New Password</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Repeat new password"
              placeholderTextColor="#bbb"
              value={confirmPw}
              onChangeText={t => { setConfirmPw(t); setPwError(""); }}
              secureTextEntry
            />

            {pwError ? <Text style={styles.errorText}>{pwError}</Text> : null}

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setPwModal(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwError(""); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleChangePassword} disabled={pwLoading}>
                {pwLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalSaveText}>Update</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 * scaleX, paddingVertical: 14 * scaleY, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f5e0e8" },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: "Poppins-Bold", fontSize: 18 * scaleX, color: "#1a1a1a" },
  scroll: { padding: 18 * scaleX, paddingBottom: 50 },

  profileCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 20, padding: 16 * scaleX, marginBottom: 24 * scaleY, shadowColor: "#e64980", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, borderWidth: 1.5, borderColor: "#fce4ec" },
  profileAvatarInitial: { width: 62 * scaleX, height: 62 * scaleX, borderRadius: 31 * scaleX, backgroundColor: "#e64980", alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: "#c2185b" },
  profileAvatarInitialText: { fontFamily: "Poppins-Bold", fontSize: 24 * scaleX, color: "#fff" },
  profileInfo: { flex: 1, marginLeft: 14 },
  profileName: { fontFamily: "Poppins-Bold", fontSize: 17 * scaleX, color: "#1a1a1a" },
  profileEmail: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#888", marginTop: 2 },
  profileEditHint: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#e64980", marginTop: 4 },

  sectionTitle: { fontFamily: "Poppins-SemiBold", fontSize: 12 * scaleX, color: "#aaa", marginBottom: 8, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.8 },
  section: { backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", elevation: 2, marginBottom: 20 * scaleY },
  row: { flexDirection: "row", alignItems: "center", padding: 15 * scaleX, borderBottomWidth: 1, borderBottomColor: "#f5f5f5" },
  rowIcon: { width: 38 * scaleX, height: 38 * scaleX, borderRadius: 11, alignItems: "center", justifyContent: "center", marginRight: 14 },
  rowLabel: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#1a1a1a" },
  rowSublabel: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#aaa", marginTop: 1 },
  version: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#ccc", textAlign: "center", marginTop: 8 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 * scaleX, paddingBottom: 40 },
  modalTitle: { fontFamily: "Poppins-Bold", fontSize: 18 * scaleX, color: "#1a1a1a", marginBottom: 20 },
  fieldLabel: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#555", marginBottom: 6 },
  modalInput: { borderWidth: 1.5, borderColor: "#f0d0da", borderRadius: 12, padding: 14, fontFamily: "Poppins-Regular", fontSize: 15 * scaleX, color: "#333", marginBottom: 14 },
  errorText: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#e64980", marginBottom: 12, marginLeft: 4 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: "#ddd", alignItems: "center" },
  modalCancelText: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#888" },
  modalSave: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#e64980", alignItems: "center" },
  modalSaveText: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#fff" },
});
