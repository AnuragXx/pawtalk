import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Image, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { soundService, petService } from "../services/firestore";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

const QUICK_ACTIONS = [
  { screen: "Analyze",   title: "Sound\nAnalysis",  desc: "Record & analyze",  color: "#fce4ec", iconColor: "#e64980", icon: "mic"   },
  { screen: "MyPet",     title: "My\nPets",         desc: "Manage your pets",  color: "#f3e5f5", iconColor: "#9c27b0", icon: "paw"   },
  { screen: "Checklist", title: "Daily\nCare",      desc: "Tasks & reminders", color: "#e8f5e9", iconColor: "#2e7d32", icon: "check" },
];

function Icon({ type, color, size = 24 }) {
  if (type === "mic") return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
  if (type === "paw") return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4.5 9a2 2 0 100-4 2 2 0 000 4zM9 5.5a2 2 0 100-4 2 2 0 000 4zM15 5.5a2 2 0 100-4 2 2 0 000 4zM19.5 9a2 2 0 100-4 2 2 0 000 4z" stroke={color} strokeWidth={1.5}/>
      <Path d="M12 22c-3.5 0-7-2.5-7-6.5 0-2 1.5-3.5 3-4l1.5-.5c1-.3 2-.3 3 0l1.5.5c1.5.5 3 2 3 4 0 4-3.5 6.5-7 6.5z" stroke={color} strokeWidth={2}/>
    </Svg>
  );
  if (type === "check") return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
  return null;
}

export default function HomeScreen({ navigation }) {
  const { ownerName } = useUser();
  const { user } = useAuth();
  const [recentActivity, setRecentActivity] = useState([]);
  const [allPets, setAllPets] = useState([]);

  const displayName = ownerName
    || user?.displayName
    || (user?.email ? user.email.split("@")[0] : "");

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  // Real-time sound history listener — max 2 items
  useEffect(() => {
    if (!user) return;
    const unsub = soundService.listenRecent(user.uid, (data) => {
      setRecentActivity(data);
    }, 2);
    return () => unsub();
  }, [user]);

  // Real-time pets listener — updates instantly when any pet is added/edited/deleted
  useEffect(() => {
    if (!user) return;
    const unsub = petService.listen(user.uid, (pets) => {
      setAllPets(pets);
    });
    return () => unsub();
  }, [user]);

  const goTo = (screen) => {
    const tabScreens = ["Analyze", "Checklist", "MyPet"];
    if (tabScreens.includes(screen)) {
      navigation.navigate(screen);
    } else {
      navigation.getParent()?.navigate(screen);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>
              {getGreeting()}{displayName ? `, ${displayName}` : ""} 👋
            </Text>
            <Text style={styles.headerTitle}>PawTalk</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.getParent()?.navigate("Settings")}
            style={styles.settingsBtn}
            activeOpacity={0.85}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="#e64980" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="#e64980" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </TouchableOpacity>
        </View>

        {/* ── Hero banner ── */}
        <View style={styles.heroBanner}>
          <View style={styles.heroCircle1} />
          <View style={styles.heroCircle2} />
          <View style={styles.heroContent}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>✨ AI-Powered</Text>
            </View>
            <Text style={styles.heroTitle}>Understand your{"\n"}pet's emotions</Text>
            <TouchableOpacity style={styles.heroBtn} onPress={() => goTo("Analyze")} activeOpacity={0.85}>
              <Icon type="mic" color="#e64980" size={14} />
              <Text style={styles.heroBtnText}>  Start Recording</Text>
            </TouchableOpacity>
          </View>
          <Image
            source={require("../assets/images/pngtree-cute-cartoon-cat-vector-22563081-1.png")}
            style={styles.heroImage}
            resizeMode="contain"
          />
        </View>

        {/* ── My Pets section ── */}
        {allPets.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>My Pets</Text>
              <TouchableOpacity onPress={() => goTo("MyPet")}>
                <Text style={styles.seeAll}>Manage →</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.petsRow}
            >
              {allPets.map((pet, i) => {
                const emoji = pet.petType === "cat" ? "🐱" : pet.petType === "dog" ? "🐶" : "🐾";
                return (
                  <TouchableOpacity
                    key={pet.id || `pet-${i}`}
                    style={styles.petCard}
                    onPress={() => {
                      navigation.navigate("MyPet", { selectPetId: pet.id });
                    }}
                    activeOpacity={0.85}
                  >
                    {pet.photoUri ? (
                      <Image source={{ uri: pet.photoUri }} style={styles.petCardPhoto} />
                    ) : (
                      <View style={styles.petCardPhotoPlaceholder}>
                        <Text style={{ fontSize: 28 }}>{emoji}</Text>
                      </View>
                    )}
                    <Text style={styles.petCardName} numberOfLines={1}>{pet.petName || "Pet"}</Text>
                    <Text style={styles.petCardType}>{pet.petType ? pet.petType.charAt(0).toUpperCase() + pet.petType.slice(1) : "Pet"}</Text>
                  </TouchableOpacity>
                );
              })}
              {/* Add pet button */}
              <TouchableOpacity
                style={styles.petCardAdd}
                onPress={() => navigation.getParent()?.navigate("PetProfile", { isSetup: false, forceNew: true })}
                activeOpacity={0.8}
              >
                <View style={styles.petCardAddIcon}>
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                    <Path d="M12 5v14M5 12h14" stroke="#e64980" strokeWidth={2.5} strokeLinecap="round"/>
                  </Svg>
                </View>
                <Text style={styles.petCardAddText}>Add Pet</Text>
              </TouchableOpacity>
            </ScrollView>
          </>
        )}

        {/* ── Quick Actions ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>
        <View style={styles.actionsRow}>
          {QUICK_ACTIONS.map((a, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.actionCard, { backgroundColor: a.color }]}
              onPress={() => goTo(a.screen)}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconBox, { shadowColor: a.iconColor }]}>
                <Icon type={a.icon} color={a.iconColor} size={22} />
              </View>
              <Text style={styles.actionTitle}>{a.title}</Text>
              <Text style={styles.actionDesc}>{a.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── PoofieAI card ── */}
        <TouchableOpacity style={styles.chatCard} onPress={() => goTo("Chatbot")} activeOpacity={0.85}>
          <View style={styles.chatCardInner}>
            <View style={styles.chatAvatarBox}>
              <Text style={{ fontSize: 22 }}>🐾</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.chatCardTitle}>Ask PoofieAI</Text>
              <Text style={styles.chatCardSub}>Get instant answers about your pet's behavior, health & more</Text>
            </View>
          </View>
          <View style={styles.chatCardArrow}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M9 18l6-6-6-6" stroke="#e64980" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </View>
        </TouchableOpacity>

        {/* ── Recent Activity (real-time, max 2) ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity onPress={() => navigation.getParent()?.navigate("SoundHistory")}>
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>

        {recentActivity.length > 0 ? recentActivity.map((item, i) => (
          <View key={item.id || `activity-${i}`} style={styles.activityCard}>
            <View style={styles.activityIcon}>
              <Icon type="mic" color="#e64980" size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activityTitle}>
                {item.species
                  ? item.species.charAt(0).toUpperCase() + item.species.slice(1) + " sound analysis"
                  : "Sound analysis"}
              </Text>
              <Text style={styles.activitySub}>
                {item.emotion || "Analysis complete"}
                {item.confidence ? ` · ${item.confidence}%` : ""}
              </Text>
            </View>
            <Text style={styles.activityTime}>
              {item.createdAt?.toDate
                ? item.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "Recent"}
            </Text>
          </View>
        )) : (
          <View style={styles.emptyActivity}>
            <Text style={styles.emptyActivityEmoji}>🎙️</Text>
            <Text style={styles.emptyActivityText}>No analyses yet — record your pet's sound to get started!</Text>
            <TouchableOpacity style={styles.emptyActivityBtn} onPress={() => goTo("Analyze")}>
              <Text style={styles.emptyActivityBtnText}>Start Recording</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  scroll: { paddingHorizontal: 18 * scaleX, paddingTop: 14 * scaleY, paddingBottom: 10 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 * scaleY },
  headerLeft: { flex: 1, paddingRight: 12 },
  greeting: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#888" },
  headerTitle: { fontFamily: "Poppins-Bold", fontSize: 28 * scaleX, color: "#1a1a1a", marginTop: 1 },
  settingsBtn: { width: 44 * scaleX, height: 44 * scaleX, borderRadius: 22 * scaleX, backgroundColor: "#fce4ec", alignItems: "center", justifyContent: "center" },

  heroBanner: { flexDirection: "row", backgroundColor: "#e64980", borderRadius: 22, padding: 20 * scaleX, marginBottom: 18 * scaleY, overflow: "hidden", shadowColor: "#e64980", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 10, minHeight: 140 * scaleY },
  heroCircle1: { position: "absolute", width: 120 * scaleX, height: 120 * scaleX, borderRadius: 60 * scaleX, backgroundColor: "rgba(255,255,255,0.08)", top: -30, right: 80 },
  heroCircle2: { position: "absolute", width: 80 * scaleX, height: 80 * scaleX, borderRadius: 40 * scaleX, backgroundColor: "rgba(255,255,255,0.06)", bottom: -20, left: 20 },
  heroContent: { flex: 1, justifyContent: "center", zIndex: 1 },
  heroPill: { backgroundColor: "rgba(255,255,255,0.22)", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 8 },
  heroPillText: { fontFamily: "Poppins-SemiBold", fontSize: 11 * scaleX, color: "#fff" },
  heroTitle: { fontFamily: "Poppins-Bold", fontSize: 19 * scaleX, color: "#fff", lineHeight: 27 * scaleX, marginBottom: 14 * scaleY },
  heroBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, alignSelf: "flex-start", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  heroBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 12 * scaleX, color: "#e64980" },
  heroImage: { width: 105 * scaleX, height: 105 * scaleX, alignSelf: "flex-end", zIndex: 1 },

  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 * scaleY },
  sectionTitle: { fontFamily: "Poppins-SemiBold", fontSize: 16 * scaleX, color: "#1a1a1a" },
  seeAll: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#e64980" },

  // ── Pets row ──
  petsRow: { paddingBottom: 4, gap: 12, marginBottom: 18 * scaleY },
  petCard: { width: 90 * scaleX, alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 10 * scaleX, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 },
  petCardPhoto: { width: 56 * scaleX, height: 56 * scaleX, borderRadius: 28 * scaleX, borderWidth: 2, borderColor: "#e64980", marginBottom: 6 },
  petCardPhotoPlaceholder: { width: 56 * scaleX, height: 56 * scaleX, borderRadius: 28 * scaleX, backgroundColor: "#fce4ec", alignItems: "center", justifyContent: "center", marginBottom: 6, borderWidth: 2, borderColor: "#e64980" },
  petCardName: { fontFamily: "Poppins-SemiBold", fontSize: 11 * scaleX, color: "#1a1a1a", textAlign: "center" },
  petCardType: { fontFamily: "Poppins-Regular", fontSize: 10 * scaleX, color: "#aaa", textAlign: "center" },
  petCardAdd: { width: 90 * scaleX, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: 16, padding: 10 * scaleX, borderWidth: 1.5, borderColor: "#fce4ec", borderStyle: "dashed" },
  petCardAddIcon: { width: 56 * scaleX, height: 56 * scaleX, borderRadius: 28 * scaleX, backgroundColor: "#fce4ec", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  petCardAddText: { fontFamily: "Poppins-SemiBold", fontSize: 11 * scaleX, color: "#e64980" },

  actionsRow: { flexDirection: "row", gap: 10, marginBottom: 18 * scaleY },
  actionCard: { flex: 1, borderRadius: 18, padding: 14 * scaleX, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  actionIconBox: { width: 44 * scaleX, height: 44 * scaleX, borderRadius: 13, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 10, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  actionTitle: { fontFamily: "Poppins-SemiBold", fontSize: 12 * scaleX, color: "#1a1a1a", marginBottom: 2 },
  actionDesc: { fontFamily: "Poppins-Regular", fontSize: 10 * scaleX, color: "#888" },

  chatCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 18, padding: 16 * scaleX, marginBottom: 18 * scaleY, borderLeftWidth: 4, borderLeftColor: "#e64980", shadowColor: "#e64980", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 5 },
  chatCardInner: { flex: 1, flexDirection: "row", alignItems: "center" },
  chatAvatarBox: { width: 48 * scaleX, height: 48 * scaleX, borderRadius: 14, backgroundColor: "#fce4ec", alignItems: "center", justifyContent: "center" },
  chatCardTitle: { fontFamily: "Poppins-SemiBold", fontSize: 15 * scaleX, color: "#1a1a1a", marginBottom: 3 },
  chatCardSub: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#888", lineHeight: 16 * scaleX },
  chatCardArrow: { width: 32 * scaleX, height: 32 * scaleX, borderRadius: 16 * scaleX, backgroundColor: "#fce4ec", alignItems: "center", justifyContent: "center", marginLeft: 8 },

  activityCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 14 * scaleX, marginBottom: 10 * scaleY, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  activityIcon: { width: 42 * scaleX, height: 42 * scaleX, borderRadius: 12, backgroundColor: "#fce4ec", alignItems: "center", justifyContent: "center", marginRight: 12 },
  activityTitle: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#1a1a1a" },
  activitySub: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#888", marginTop: 2 },
  activityTime: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#bbb" },

  emptyActivity: { backgroundColor: "#fff", borderRadius: 16, padding: 24 * scaleX, alignItems: "center", marginBottom: 10 * scaleY, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  emptyActivityEmoji: { fontSize: 40, marginBottom: 10 },
  emptyActivityText: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#888", textAlign: "center", lineHeight: 20 * scaleX, marginBottom: 16 },
  emptyActivityBtn: { backgroundColor: "#e64980", borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24 },
  emptyActivityBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#fff" },
});
