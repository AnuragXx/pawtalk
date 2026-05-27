import useHideNavBar from "../hooks/useHideNavBar";
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, FlatList, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "../context/AuthContext";
import { soundService } from "../services/firestore";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

const BEHAVIOR_COLORS = {
  "Excited and Playful": "#4caf50",
  "Wants Attention":     "#e91e63",
  "Alert":               "#ff9800",
  "Alert or Warning":    "#ff9800",
  "Anxious or Stressed": "#f44336",
  "Content":             "#4caf50",
  "Observing":           "#9e9e9e",
  "Unclear":             "#9e9e9e",
};

export default function SoundHistoryScreen({ navigation }) {
  useHideNavBar();
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Real-time listener instead of one-time fetch
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = soundService.listenRecent(user.uid, (data) => {
      setHistory(data);
      setLoading(false);
    }, 50);
    return () => unsub();
  }, [user]);

  const handleDelete = useCallback((item) => {
    Alert.alert("Delete Entry", "Remove this analysis from history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await soundService.delete(user.uid, item.id);
          } catch (e) {
            Alert.alert("Error", "Could not delete entry.");
          }
        },
      },
    ]);
  }, [user]);

  const formatTime = (ts) => {
    if (!ts) return "";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " +
           date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderItem = useCallback(({ item }) => {
    const behaviorLabel = item.behavior || item.emotion || "Analyzed";
    const behaviorEmoji = item.behaviorEmoji || (item.species === "cat" ? "🐱" : item.species === "bird" ? "🐦" : "🐶");
    const color = item.behaviorColor || BEHAVIOR_COLORS[behaviorLabel] || "#e64980";
    const speciesEmoji = item.species === "cat" ? "🐱" : item.species === "bird" ? "🐦" : "🐶";
    return (
      <View style={[styles.card, { borderLeftColor: color }]}>
        <Text style={styles.cardEmoji}>{speciesEmoji}</Text>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.cardSpecies}>
            {item.species ? item.species.charAt(0).toUpperCase() + item.species.slice(1) : "Unknown"}
            {item.confidence ? ` · ${item.confidence}%` : ""}
          </Text>
          <View style={styles.behaviorRow}>
            <Text style={styles.behaviorEmoji}>{behaviorEmoji}</Text>
            <Text style={[styles.cardBehavior, { color }]}>{behaviorLabel}</Text>
          </View>
          {item.behaviorDescription ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.behaviorDescription}</Text>
          ) : null}
          <Text style={styles.cardTime}>{formatTime(item.createdAt)}</Text>
          {!item.isMock && (
            <TouchableOpacity
              style={styles.askBtn}
              onPress={() => navigation.navigate("Chatbot")}
              activeOpacity={0.8}
            >
              <Text style={styles.askBtnText}>🐾 Ask PoofieAI about this</Text>
            </TouchableOpacity>
          )}
        </View>
        {item.isMock && (
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>Demo</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => handleDelete(item)}
          style={styles.deleteBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ccc" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
        </TouchableOpacity>
      </View>
    );
  }, [handleDelete, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analysis History</Text>
        {history.length > 0 ? (
          <TouchableOpacity
            onPress={() => Alert.alert("Clear All", "Delete all analysis history?", [
              { text: "Cancel", style: "cancel" },
              { text: "Clear All", style: "destructive", onPress: async () => {
                try {
                  await soundService.deleteAll(user.uid);
                } catch (_) {}
              }},
            ])}
            style={styles.clearBtn}
          >
            <Text style={styles.clearBtnText}>Clear All</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 60 }} />}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#e64980" />
        </View>
      ) : history.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎙️</Text>
          <Text style={styles.emptyTitle}>No analyses yet</Text>
          <Text style={styles.emptySub}>Record your pet's sound to see results here</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.emptyBtnText}>Start Recording</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={(item, i) => item.id ? `history-${item.id}` : `history-${i}`}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 * scaleX, paddingVertical: 14 * scaleY, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f5e0e8" },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: "Poppins-Bold", fontSize: 18 * scaleX, color: "#1a1a1a" },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  clearBtnText: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#e64980" },
  list: { padding: 18 * scaleX },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 14 * scaleX, marginBottom: 10 * scaleY, borderLeftWidth: 4, elevation: 3 },
  cardEmoji: { fontSize: 32 },
  cardSpecies: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#1a1a1a" },
  behaviorRow: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 4 },
  behaviorEmoji: { fontSize: 14 },
  cardBehavior: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX },
  cardDesc: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#888", marginTop: 2, lineHeight: 16 },
  cardTime: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#bbb", marginTop: 3 },
  demoBadge: { backgroundColor: "#f5f5f5", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  demoBadgeText: { fontFamily: "Poppins-Regular", fontSize: 10 * scaleX, color: "#aaa" },
  deleteBtn: { padding: 6 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyEmoji: { fontSize: 60, marginBottom: 16 },
  emptyTitle: { fontFamily: "Poppins-Bold", fontSize: 20 * scaleX, color: "#1a1a1a", marginBottom: 8 },
  emptySub: { fontFamily: "Poppins-Regular", fontSize: 14 * scaleX, color: "#888", textAlign: "center", marginBottom: 24 },
  emptyBtn: { backgroundColor: "#e64980", borderRadius: 20, paddingVertical: 12, paddingHorizontal: 28 },
  emptyBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#fff" },
});
