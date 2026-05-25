import useHideNavBar from "../hooks/useHideNavBar";
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, ScrollView, Image, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { petService } from "../services/firestore";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

const INFO_ROWS = [
  { key: "petType", label: "Type",  icon: "M4.5 9a2 2 0 100-4 2 2 0 000 4zM9 5.5a2 2 0 100-4 2 2 0 000 4zM15 5.5a2 2 0 100-4 2 2 0 000 4zM19.5 9a2 2 0 100-4 2 2 0 000 4zM12 22c-3.5 0-7-2.5-7-6.5 0-2 1.5-3.5 3-4l1.5-.5c1-.3 2-.3 3 0l1.5.5c1.5.5 3 2 3 4 0 4-3.5 6.5-7 6.5z" },
  { key: "breed",   label: "Breed", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
  { key: "age",     label: "Age",   icon: "M12 2a10 10 0 100 20A10 10 0 0012 2zm0 5v5l4 2" },
  { key: "sex",     label: "Sex",   icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" },
  { key: "color",   label: "Color", icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" },
];

export default function MyPetScreen({ navigation, route }) {
  useHideNavBar();
  const { user } = useAuth();
  const { refreshPet } = useUser();
  const [pets, setPets] = useState([]);
  const [selectedPet, setSelectedPet] = useState(null);
  const [loading, setLoading] = useState(true);

  const selectedPetRef = React.useRef(selectedPet);
  useEffect(() => { selectedPetRef.current = selectedPet; }, [selectedPet]);

  const loadPets = useCallback(async (selectId) => {
    if (!user) { setLoading(false); return; }
    try {
      const data = await petService.getAll(user.uid);
      setPets(data);
      if (data.length > 0) {
        const current = selectedPetRef.current;
        const target = selectId
          ? data.find(p => p.id === selectId) || data[0]
          : (current ? data.find(p => p.id === current.id) || data[0] : data[0]);
        setSelectedPet(target);
      } else {
        setSelectedPet(null);
      }
    } catch (_) {}
    setLoading(false);
  }, [user]);

  useEffect(() => {
    const selectId = route?.params?.selectPetId || null;
    loadPets(selectId);
  }, [loadPets]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      const selectId = route?.params?.selectPetId || null;
      loadPets(selectId);
      if (user) refreshPet(user.uid);
    });
    return unsub;
  }, [navigation, user, route?.params?.selectPetId]);

  const goEdit = (pet) => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate("PetProfile", { isSetup: false, petId: pet?.id || null });
    }
  };

  const goAddNew = () => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate("PetProfile", { isSetup: false, petId: null, forceNew: true });
    }
  };

  const handleDelete = (pet) => {
    Alert.alert("Remove Pet", `Remove ${pet.petName || "this pet"} from your profiles?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          await petService.delete(user.uid, pet.id).catch(() => {});
          const remaining = pets.filter(p => p.id !== pet.id);
          setPets(remaining);
          setSelectedPet(remaining.length > 0 ? remaining[0] : null);
          if (user) refreshPet(user.uid);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#e64980" />
      </SafeAreaView>
    );
  }

  if (pets.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🐾</Text>
          <Text style={styles.emptyTitle}>No pet profiles yet</Text>
          <Text style={styles.emptySub}>Add your pet's details to get personalized insights</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={goAddNew}>
            <Text style={styles.emptyBtnText}>Add Your First Pet</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const pet = selectedPet || pets[0];
  const typeEmoji = pet.petType === "cat" ? "🐱" : pet.petType === "dog" ? "🐶" : "🐾";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Pets</Text>
          <TouchableOpacity style={styles.addBtn} onPress={goAddNew} activeOpacity={0.8}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"/>
            </Svg>
            <Text style={styles.addBtnText}>Add Pet</Text>
          </TouchableOpacity>
        </View>

        {/* Pet selector tabs (if multiple pets) */}
        {pets.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
            {pets.map(p => {
              const isActive = p.id === pet.id;
              const emoji = p.petType === "cat" ? "🐱" : p.petType === "dog" ? "🐶" : "🐾";
              return (
                <TouchableOpacity
                  key={p.id || `pet-tab-${p.petName || Math.random()}`}
                  style={[styles.tab, isActive && styles.tabActive]}
                  onPress={() => setSelectedPet(p)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.tabEmoji}>{emoji}</Text>
                  <Text style={[styles.tabName, isActive && styles.tabNameActive]}>
                    {p.petName || "Pet"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroCardActions}>
            <TouchableOpacity style={styles.editBtn} onPress={() => goEdit(pet)} activeOpacity={0.8}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#e64980" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            {pets.length > 1 && (
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(pet)} activeOpacity={0.8}>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#f44336" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
                <Text style={styles.deleteBtnText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.photoWrapper}>
            {pet.photoUri ? (
              <Image source={{ uri: pet.photoUri }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoEmoji}>{typeEmoji}</Text>
              </View>
            )}
          </View>
          <Text style={styles.petName}>{pet.petName || "Unnamed Pet"}</Text>
          {pet.breed ? <Text style={styles.petBreed}>{pet.breed}</Text> : null}
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>
              {typeEmoji} {pet.petType ? pet.petType.charAt(0).toUpperCase() + pet.petType.slice(1) : "Pet"}
            </Text>
          </View>
        </View>

        {/* Info grid */}
        <View style={styles.infoGrid}>
          {INFO_ROWS.filter(r => pet[r.key]).map((row, i) => (
            <View key={row.key || `info-${i}`} style={styles.infoCard}>
              <View style={styles.infoIconBox}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path d={row.icon} stroke="#e64980" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              </View>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue}>
                {row.key === "petType"
                  ? pet[row.key].charAt(0).toUpperCase() + pet[row.key].slice(1)
                  : pet[row.key]}
              </Text>
            </View>
          ))}
        </View>

        {/* About */}
        {pet.about ? (
          <View style={styles.aboutCard}>
            <Text style={styles.aboutTitle}>About {pet.petName}</Text>
            <Text style={styles.aboutText}>{pet.about}</Text>
          </View>
        ) : null}

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("Analyze")} activeOpacity={0.8}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="#e64980" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="#e64980" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
            <Text style={styles.actionBtnText}>Analyze Sound</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => {
            const parent = navigation.getParent();
            if (parent) parent.navigate("Chatbot");
          }} activeOpacity={0.8}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#e64980" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
            <Text style={styles.actionBtnText}>Ask PoofieAI</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  scroll: { paddingHorizontal: 18 * scaleX, paddingTop: 16 * scaleY, paddingBottom: 40 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 * scaleY },
  headerTitle: { fontFamily: "Poppins-Bold", fontSize: 24 * scaleX, color: "#1a1a1a" },
  addBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#e64980", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, gap: 6, elevation: 4 },
  addBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#fff" },

  tabsScroll: { marginBottom: 16 * scaleY },
  tabs: { gap: 10, paddingRight: 4 },
  tab: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: "#eee", gap: 6 },
  tabActive: { borderColor: "#e64980", backgroundColor: "#fff0f5" },
  tabEmoji: { fontSize: 16 },
  tabName: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#888" },
  tabNameActive: { color: "#e64980" },

  heroCard: { backgroundColor: "#fff", borderRadius: 24, padding: 24 * scaleX, alignItems: "center", marginBottom: 20 * scaleY, elevation: 5, shadowColor: "#e64980", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
  heroCardActions: { flexDirection: "row", gap: 10, alignSelf: "flex-end", marginBottom: 8 },
  editBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#fce4ec", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, gap: 5 },
  editBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 12 * scaleX, color: "#e64980" },
  deleteBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#ffeaea", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, gap: 5 },
  deleteBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 12 * scaleX, color: "#f44336" },

  photoWrapper: { marginBottom: 14 },
  photo: { width: 110 * scaleX, height: 110 * scaleX, borderRadius: 55 * scaleX, borderWidth: 3, borderColor: "#e64980" },
  photoPlaceholder: { width: 110 * scaleX, height: 110 * scaleX, borderRadius: 55 * scaleX, backgroundColor: "#fce4ec", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#e64980" },
  photoEmoji: { fontSize: 52 },
  petName: { fontFamily: "Poppins-Bold", fontSize: 26 * scaleX, color: "#1a1a1a", marginBottom: 4 },
  petBreed: { fontFamily: "Poppins-Regular", fontSize: 14 * scaleX, color: "#888", marginBottom: 10 },
  typeBadge: { backgroundColor: "#fce4ec", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  typeBadgeText: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#e64980" },

  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 * scaleY },
  infoCard: { backgroundColor: "#fff", borderRadius: 16, padding: 14 * scaleX, width: (width - 36 * scaleX - 10) / 2, elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  infoIconBox: { width: 36 * scaleX, height: 36 * scaleX, borderRadius: 10, backgroundColor: "#fce4ec", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  infoLabel: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#aaa", marginBottom: 2 },
  infoValue: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#1a1a1a" },

  aboutCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16 * scaleX, marginBottom: 16 * scaleY, elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  aboutTitle: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#1a1a1a", marginBottom: 8 },
  aboutText: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#555", lineHeight: 20 * scaleX },

  actionsRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#fff", borderRadius: 16, paddingVertical: 14, borderWidth: 1.5, borderColor: "#f0d0da", elevation: 2 },
  actionBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#e64980" },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontFamily: "Poppins-Bold", fontSize: 20 * scaleX, color: "#1a1a1a", marginBottom: 8 },
  emptySub: { fontFamily: "Poppins-Regular", fontSize: 14 * scaleX, color: "#888", textAlign: "center", marginBottom: 24 },
  emptyBtn: { backgroundColor: "#e64980", borderRadius: 20, paddingVertical: 12, paddingHorizontal: 28 },
  emptyBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#fff" },
});
