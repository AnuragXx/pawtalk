import useHideNavBar from "../hooks/useHideNavBar";
import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Dimensions, ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { userService } from "../services/firestore";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

export default function UserProfileScreen({ navigation }) {
  useHideNavBar();
  const { user } = useAuth();
  const { ownerName, setOwnerName } = useUser();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    userService.get(user.uid).then(data => {
      if (data) {
        setDisplayName(data.displayName || "");
        setPhone(data.phone || "");
        setCity(data.city || "");
        setBio(data.bio || "");
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await userService.update(user.uid, {
        displayName: displayName.trim(),
        phone: phone.trim(),
        city: city.trim(),
        bio: bio.trim(),
      });
      setOwnerName(displayName.trim());
      setEditing(false);
      Alert.alert("Saved", "Profile updated successfully.");
    } catch (e) {
      Alert.alert("Error", "Could not save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#e64980" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity onPress={() => editing ? handleSave() : setEditing(true)} style={styles.editBtn}>
          {saving ? <ActivityIndicator size="small" color="#e64980" /> : (
            <Text style={styles.editBtnText}>{editing ? "Save" : "Edit"}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Avatar — initials only, no photo */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitialText}>
              {displayName ? displayName.charAt(0).toUpperCase() : "?"}
            </Text>
          </View>
          <Text style={styles.avatarName}>{displayName || "Pet Owner"}</Text>
          <Text style={styles.avatarEmail}>{user?.email || ""}</Text>
        </View>

        {/* Info section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Info</Text>

          <InfoRow
            label="Full Name"
            value={displayName}
            editing={editing}
            onChangeText={setDisplayName}
            placeholder="Your name"
            icon="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"
          />
          <InfoRow
            label="Email"
            value={user?.email || ""}
            editing={false}
            placeholder="Email"
            icon="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6"
          />
          <InfoRow
            label="Phone"
            value={phone}
            editing={editing}
            onChangeText={setPhone}
            placeholder="Your phone number"
            keyboardType="phone-pad"
            icon="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"
          />
          <InfoRow
            label="City"
            value={city}
            editing={editing}
            onChangeText={setCity}
            placeholder="Your city"
            icon="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 13a3 3 0 100-6 3 3 0 000 6z"
            last
          />
        </View>

        {/* Bio */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About Me</Text>
          {editing ? (
            <TextInput
              style={styles.bioInput}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell us about yourself and your pet..."
              placeholderTextColor="#ccc"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          ) : (
            <Text style={styles.bioText}>{bio || "No bio added yet. Tap Edit to add one."}</Text>
          )}
        </View>

        {/* Account info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <View style={styles.infoRowStatic}>
            <Text style={styles.infoLabel}>Member since</Text>
            <Text style={styles.infoValue}>
              {user?.metadata?.creationTime
                ? new Date(user.metadata.creationTime).toLocaleDateString([], { month: "long", year: "numeric" })
                : "—"}
            </Text>
          </View>
          <View style={[styles.infoRowStatic, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Account type</Text>
            <Text style={styles.infoValue}>Free</Text>
          </View>
        </View>

        {editing && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, editing, onChangeText, placeholder, keyboardType, icon, last }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.infoIconBox}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Path d={icon} stroke="#e64980" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
        </Svg>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        {editing && onChangeText ? (
          <TextInput
            style={styles.infoInput}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#ccc"
            keyboardType={keyboardType || "default"}
          />
        ) : (
          <Text style={styles.infoValue}>{value || "—"}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 * scaleX, paddingVertical: 14 * scaleY, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f5e0e8" },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: "Poppins-Bold", fontSize: 18 * scaleX, color: "#1a1a1a" },
  editBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#fce4ec", borderRadius: 20 },
  editBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#e64980" },

  scroll: { paddingHorizontal: 18 * scaleX, paddingTop: 20 * scaleY, paddingBottom: 20 },

  avatarSection: { alignItems: "center", marginBottom: 24 * scaleY },
  avatarPlaceholder: { width: 80 * scaleX, height: 80 * scaleX, borderRadius: 40 * scaleX, backgroundColor: "#e64980", alignItems: "center", justifyContent: "center", marginBottom: 12, borderWidth: 3, borderColor: "#c2185b" },
  avatarInitialText: { fontFamily: "Poppins-Bold", fontSize: 30 * scaleX, color: "#fff" },
  avatarName: { fontFamily: "Poppins-Bold", fontSize: 20 * scaleX, color: "#1a1a1a" },
  avatarEmail: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#888", marginTop: 2 },

  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16 * scaleX, marginBottom: 16 * scaleY, elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  cardTitle: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#888", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },

  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f5f5f5" },
  infoRowStatic: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f5f5f5" },
  infoIconBox: { width: 32 * scaleX, height: 32 * scaleX, borderRadius: 8, backgroundColor: "#fce4ec", alignItems: "center", justifyContent: "center", marginRight: 12 },
  infoLabel: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#aaa", marginBottom: 2 },
  infoValue: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#1a1a1a" },
  infoInput: { fontFamily: "Poppins-Regular", fontSize: 14 * scaleX, color: "#333", borderBottomWidth: 1, borderBottomColor: "#f0d0da", paddingVertical: 4 },

  bioInput: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#333", borderWidth: 1.5, borderColor: "#f0d0da", borderRadius: 12, padding: 12, minHeight: 90, lineHeight: 20 * scaleX },
  bioText: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#555", lineHeight: 20 * scaleX },

  cancelBtn: { alignItems: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: "#ddd", marginTop: 4 },
  cancelBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#888" },
});
