import useHideNavBar from "../hooks/useHideNavBar";
import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, Dimensions, ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Circle } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { petService, userService } from "../services/firestore";
import { uploadPetPhoto } from "../services/storage";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

const PET_TYPES = [
  { key: "dog", label: "Dog", emoji: "🐶" },
  { key: "cat", label: "Cat", emoji: "🐱" },
];
const SEX_OPTIONS = ["Male", "Female"];

export default function PetProfileScreen({ navigation, route }) {
  useHideNavBar();
  const { setOwnerName, refreshPet } = useUser();
  const { user } = useAuth();

  // isSetup = true when coming from Onboarding (first time), false when editing
  const isSetup = route?.params?.isSetup === true;
  const forceNew = route?.params?.forceNew === true; // adding a brand new pet
  const editPetId = route?.params?.petId || null;    // editing a specific pet

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [petId, setPetId] = useState(null);
  const [ownerNameInput, setOwnerNameInput] = useState("");
  const [petType, setPetType] = useState("");
  const [petName, setPetName] = useState("");
  const [breed, setBreed] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [color, setColor] = useState("");
  const [about, setAbout] = useState("");
  const [photoUri, setPhotoUri] = useState(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const loadProfile = async () => {
      try {
        const userData = await userService.get(user.uid);
        if (userData?.displayName) {
          setOwnerNameInput(userData.displayName);
          setOwnerName(userData.displayName);
        }
        const pets = await petService.getAll(user.uid);
        // forceNew = adding a brand new pet, start blank
        if (forceNew) {
          // nothing to load
        } else if (pets.length > 0) {
          // editPetId specified → find that pet; otherwise always load first pet
          const pet = editPetId
            ? (pets.find(p => p.id === editPetId) || pets[0])
            : pets[0];
          setPetId(pet.id);
          setPetType(pet.petType || "");
          setPetName(pet.petName || "");
          setBreed(pet.breed || "");
          setAge(pet.age || "");
          setSex(pet.sex || "");
          setColor(pet.color || "");
          setAbout(pet.about || "");
          setPhotoUri(pet.photoUri || null);
        }
      } catch (e) {
        console.warn("Load profile error:", e);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [user]);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Please allow access to your photo library in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (user) {
        if (ownerNameInput.trim()) {
          await userService.update(user.uid, { displayName: ownerNameInput.trim() });
        }

        // Determine the pet ID (existing or new)
        const savedPetId = petId || `pet_${Date.now()}`;

        // Upload photo to Firebase Storage if it's a new local URI
        let finalPhotoUri = photoUri;
        if (photoUri && !photoUri.startsWith('https://')) {
          const uploaded = await uploadPetPhoto(user.uid, savedPetId, photoUri, null);
          // If upload succeeded use the remote URL, otherwise keep the local URI
          finalPhotoUri = uploaded || photoUri;
        }

        await petService.save(user.uid, {
          id: savedPetId,
          petName: petName.trim(),
          petType,
          breed: breed.trim(),
          age: age.trim(),
          sex,
          color: color.trim(),
          about: about.trim(),
          photoUri: finalPhotoUri || null,
        });
        // Keep local petId in sync for subsequent saves in the same session
        if (!petId) setPetId(savedPetId);
      }
      setOwnerName(ownerNameInput.trim());
      if (user) await refreshPet(user.uid);

      if (isSetup) {
        navigation.replace("Home");
      } else {
        Alert.alert("Saved", "Your profile has been updated.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e) {
      Alert.alert("Error", "Could not save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    if (isSetup) {
      navigation.replace("Home");
    } else {
      navigation.goBack();
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
      <View style={styles.blobTopRight} />
      <View style={styles.circleTopRight} />
      <View style={styles.blobBottom} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={styles.headerRow}>
          {!isSetup ? (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
          <Text style={styles.headerTitle}>Pet Profile</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Avatar / Photo picker */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarCircle} onPress={pickPhoto} activeOpacity={0.8}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImage} />
            ) : (
              <>
                <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
                  <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#e64980" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                  <Circle cx={12} cy={13} r={4} stroke="#e64980" strokeWidth={1.5}/>
                </Svg>
                <Text style={styles.avatarHint}>Tap to add photo</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.avatarLabel}>{petName || "Your Pet"}</Text>
        </View>

        <Text style={styles.sectionLabel}>What's your pet?</Text>
        <View style={styles.petTypeRow}>
          {PET_TYPES.map((t) => (
            <TouchableOpacity key={t.key} style={[styles.petTypeBtn, petType === t.key && styles.petTypeBtnActive]} onPress={() => setPetType(t.key)} activeOpacity={0.8}>
              <Text style={styles.petTypeEmoji}>{t.emoji}</Text>
              <Text style={[styles.petTypeLabel, petType === t.key && styles.petTypeLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.formCard}>
          <InputField label="Your Name (Owner)" value={ownerNameInput} onChangeText={setOwnerNameInput} placeholder="e.g. Alex" />
          <InputField label="Pet Name" value={petName} onChangeText={setPetName} placeholder="e.g. Buddy" />
          <InputField label="Breed" value={breed} onChangeText={setBreed} placeholder="e.g. Golden Retriever" />
          <InputField label="Age" value={age} onChangeText={setAge} placeholder="e.g. 2 years" />
          <InputField label="Fur / Color" value={color} onChangeText={setColor} placeholder="e.g. Golden, White" />

          <Text style={styles.fieldLabel}>Sex</Text>
          <View style={styles.sexRow}>
            {SEX_OPTIONS.map((s) => (
              <TouchableOpacity key={s} style={[styles.sexBtn, sex === s && styles.sexBtnActive]} onPress={() => setSex(s)} activeOpacity={0.8}>
                <Text style={[styles.sexText, sex === s && styles.sexTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>About your pet</Text>
          <TextInput style={styles.aboutInput} placeholder="Personality, health info, special notes..." placeholderTextColor="#bbb" value={about} onChangeText={setAbout} multiline numberOfLines={3} textAlignVertical="top" />
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleSave} activeOpacity={0.85} disabled={saving}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.submitText}>{isSetup ? "Get Started" : "Save Profile"}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>{isSetup ? "Skip for now" : "Cancel"}</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InputField({ label, value, onChangeText, placeholder, keyboardType }) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.fieldInput} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#ccc" keyboardType={keyboardType || "default"} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  blobTopRight: { position: "absolute", top: -60 * scaleY, left: 260 * scaleX, width: 220 * scaleX, height: 220 * scaleY, backgroundColor: "#ff6b9a", borderRadius: 9999 },
  circleTopRight: { position: "absolute", top: 60 * scaleY, left: 320 * scaleX, width: 130 * scaleX, height: 130 * scaleY, backgroundColor: "#e64980", borderRadius: 9999 },
  blobBottom: { position: "absolute", bottom: -100 * scaleY, left: -80 * scaleX, width: 500 * scaleX, height: 300 * scaleY, backgroundColor: "#e64980", borderRadius: 9999 },
  scroll: { paddingHorizontal: 24 * scaleX, paddingTop: 10 * scaleY, paddingBottom: 60 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 * scaleY },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: "Poppins-Bold", fontSize: 22 * scaleX, color: "#e64980" },
  avatarSection: { alignItems: "center", marginBottom: 24 * scaleY },
  avatarCircle: { width: 90 * scaleX, height: 90 * scaleX, borderRadius: 45 * scaleX, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: "#e64980", borderStyle: "dashed", elevation: 4, overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%", borderRadius: 45 * scaleX },
  avatarHint: { fontFamily: "Poppins-Regular", fontSize: 9 * scaleX, color: "#e64980", marginTop: 4, textAlign: "center" },
  avatarLabel: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#e64980", marginTop: 8 },
  sectionLabel: { fontFamily: "Poppins-SemiBold", fontSize: 18 * scaleX, color: "#111", marginBottom: 14 * scaleY },
  petTypeRow: { flexDirection: "row", gap: 16, marginBottom: 24 * scaleY },
  petTypeBtn: { flex: 1, alignItems: "center", paddingVertical: 18 * scaleY, borderRadius: 20, backgroundColor: "#fff", borderWidth: 2, borderColor: "#eee", elevation: 3 },
  petTypeBtnActive: { borderColor: "#e64980", backgroundColor: "#fff0f5", elevation: 6 },
  petTypeEmoji: { fontSize: 36, marginBottom: 6 },
  petTypeLabel: { fontFamily: "Poppins-SemiBold", fontSize: 15 * scaleX, color: "#888" },
  petTypeLabelActive: { color: "#e64980" },
  formCard: { backgroundColor: "#fff", borderRadius: 24, padding: 20 * scaleX, marginBottom: 20 * scaleY, elevation: 5 },
  fieldWrapper: { marginBottom: 18 * scaleY },
  fieldLabel: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#555", marginBottom: 6 },
  fieldInput: { borderBottomWidth: 1.5, borderBottomColor: "#f0d0da", paddingVertical: 8, fontFamily: "Poppins-Regular", fontSize: 15 * scaleX, color: "#333" },
  sexRow: { flexDirection: "row", gap: 12, marginBottom: 18 * scaleY },
  sexBtn: { flex: 1, paddingVertical: 10, borderRadius: 20, borderWidth: 2, borderColor: "#eee", alignItems: "center", backgroundColor: "#fafafa" },
  sexBtnActive: { borderColor: "#e64980", backgroundColor: "#fff0f5" },
  sexText: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#aaa" },
  sexTextActive: { color: "#e64980" },
  aboutInput: { borderWidth: 1.5, borderColor: "#f0d0da", borderRadius: 14, padding: 12, fontFamily: "Poppins-Regular", fontSize: 14 * scaleX, color: "#333", minHeight: 80 },
  submitBtn: { backgroundColor: "#fff", borderRadius: 41, height: 65 * scaleY, alignItems: "center", justifyContent: "center", marginBottom: 14 * scaleY, elevation: 8 },
  submitText: { fontFamily: "Poppins-Bold", fontSize: 18 * scaleX, color: "#000" },
  skipBtn: { alignItems: "center", paddingVertical: 12 },
  skipText: { fontFamily: "Poppins-Regular", fontSize: 14 * scaleX, color: "#aaa" },
});
