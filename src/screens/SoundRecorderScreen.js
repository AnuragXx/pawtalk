import useHideNavBar from "../hooks/useHideNavBar";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Svg, { Path } from "react-native-svg";
import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import { soundAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { soundService, petService } from "../services/firestore";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;
const BAR_COUNT = 40;

export default function SoundRecorderScreen({ navigation }) {
  useHideNavBar();
  const { user } = useAuth();

  const [petType, setPetType] = useState("dog");
  const [hasPermission, setHasPermission] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [bars, setBars] = useState(Array(BAR_COUNT).fill(3));
  const [result, setResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const recordingRef = useRef(null);
  const timerRef = useRef(null);
  const meteringRef = useRef(null);

  useEffect(() => {
    // Load pet type from Firestore profile
    if (user) {
      petService.getAll(user.uid).then(pets => {
        if (pets && pets.length > 0) {
          // Handle both field names for backwards compatibility
          const type = pets[0].petType || pets[0].species || "dog";
          setPetType(type.toLowerCase());
        }
      }).catch(() => {});
    }
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === "granted");
      if (status !== "granted") {
        Alert.alert(
          "Microphone Permission Required",
          "PawTalk needs microphone access to analyze your pet's sounds. Please enable it in your device Settings.",
          [{ text: "OK" }]
        );
      }
    })();
    return () => {
      clearInterval(timerRef.current);
      clearInterval(meteringRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // Clear all result/recording state every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Stop any in-progress recording when navigating back to this screen
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      clearInterval(timerRef.current);
      clearInterval(meteringRef.current);

      // Reset all UI state to a clean slate
      setResult(null);
      setIsAnalyzing(false);
      setIsRecording(false);
      setIsPaused(false);
      setSeconds(0);
      setBars(Array(BAR_COUNT).fill(3));
    }, [])
  );

  const startRecording = async () => {
    if (!hasPermission) {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === "granted");
      if (status !== "granted") return;
    }
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await rec.startAsync();
      recordingRef.current = rec;
      setIsRecording(true);
      setIsPaused(false);
      setSeconds(0);
      setResult(null);

      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);

      meteringRef.current = setInterval(async () => {
        try {
          const status = await rec.getStatusAsync();
          if (status.isRecording && status.metering !== undefined) {
            const normalized = Math.max(0, Math.min(1, (status.metering + 60) / 60));
            const barH = Math.max(3, Math.round(normalized * 65));
            setBars(prev => [...prev.slice(1), barH]);
          }
        } catch (_) {}
      }, 80);
    } catch (e) {
      console.warn("Record error:", e);
      Alert.alert("Recording Error", "Could not start recording. Please check microphone permissions.");
    }
  };

  const stopRecording = async () => {
    clearInterval(timerRef.current);
    clearInterval(meteringRef.current);
    setBars(Array(BAR_COUNT).fill(3));
    setIsRecording(false);
    setIsPaused(false);

    let uri = null;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      uri = recordingRef.current.getURI();
      recordingRef.current = null;
    } catch (e) {
      console.warn("Stop error:", e);
    }

    setIsAnalyzing(true);
    try {
      const res = await soundAPI.analyze(uri, petType);
      setResult(res);
      // Save to Firestore history if logged in
      if (user && res.success) {
        soundService.save(user.uid, {
          species:             res.species,
          confidence:          res.confidence,
          isMock:              res.isMock || false,
          behavior:            res.behavior || null,
          behaviorDescription: res.behaviorDescription || null,
          behaviorEmoji:       res.behaviorEmoji || null,
          behaviorColor:       res.behaviorColor || null,
          behaviorConfidence:  res.behaviorConfidence || 0,
        }).catch(() => {});
      }
    } catch (e) {
      Alert.alert("Analysis Error", "Could not analyze the recording. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const pauseRecording = async () => {
    if (!recordingRef.current) return;
    if (isPaused) {
      await recordingRef.current.startAsync();
      setIsPaused(false);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
      meteringRef.current = setInterval(async () => {
        try {
          const status = await recordingRef.current.getStatusAsync();
          if (status.isRecording && status.metering !== undefined) {
            const normalized = Math.max(0, Math.min(1, (status.metering + 60) / 60));
            setBars(prev => [...prev.slice(1), Math.max(3, Math.round(normalized * 65))]);
          }
        } catch (_) {}
      }, 80);
    } else {
      await recordingRef.current.pauseAsync();
      setIsPaused(true);
      clearInterval(timerRef.current);
      clearInterval(meteringRef.current);
    }
  };

  const formatTime = s => {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return m + ":" + sec;
  };

  const getBarColor = h => {
    if (!isRecording || isPaused) return "#f0d0da";
    const opacity = 0.4 + (h / 65) * 0.6;
    return "rgba(230,73,128," + opacity.toFixed(2) + ")";
  };

  const goToChatbot = () => navigation.getParent()?.navigate("Chatbot");

  const uploadAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const uri = result.assets[0].uri;
      setResult(null);
      setIsAnalyzing(true);
      try {
        const res = await soundAPI.analyze(uri, petType);
        setResult(res);
        if (user && res.success) {
          soundService.save(user.uid, {
            species:             res.species,
            confidence:          res.confidence,
            isMock:              res.isMock || false,
            behavior:            res.behavior || null,
            behaviorDescription: res.behaviorDescription || null,
            behaviorEmoji:       res.behaviorEmoji || null,
            behaviorColor:       res.behaviorColor || null,
            behaviorConfidence:  res.behaviorConfidence || 0,
          }).catch(() => {});
        }
      } catch (e) {
        Alert.alert("Analysis Error", "Could not analyze the audio file. Please try again.");
      } finally {
        setIsAnalyzing(false);
      }
    } catch (e) {
      Alert.alert("Error", "Could not open file picker.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Sound Analysis</Text>
          <Text style={styles.headerSub}>Record your pet's sounds to understand their emotions</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={uploadAudio} style={styles.uploadBtn} disabled={isAnalyzing || isRecording}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="#e64980" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
              <Text style={styles.uploadBtnText}>Upload Audio</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.getParent()?.navigate("SoundHistory")} style={styles.historyLink}>
              <Text style={styles.historyLinkText}>View History →</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.micSection}>
          <View style={[styles.pulseRing, isRecording && styles.pulseRingActive]} />
          <TouchableOpacity
            style={[styles.micBtn, isRecording && styles.micBtnActive]}
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.85}
            disabled={hasPermission === false || isAnalyzing}
          >
            <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
              {isRecording
                ? <Path d="M6 6h12v12H6z" fill="#fff" />
                : <Path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              }
            </Svg>
          </TouchableOpacity>
        </View>

        <Text style={styles.timer}>{formatTime(seconds)}</Text>
        <Text style={styles.timerLabel}>
          {isAnalyzing ? "Analyzing..." : isRecording ? (isPaused ? "Paused" : "Recording...") : "Tap mic to start"}
        </Text>

        <View style={styles.waveformCard}>
          <View style={styles.waveform}>
            {bars.map((h, i) => (
              <View key={i} style={[styles.bar, { height: h, backgroundColor: getBarColor(h) }]} />
            ))}
          </View>
        </View>

        {isRecording && (
          <TouchableOpacity style={styles.pauseBtn} onPress={pauseRecording} activeOpacity={0.8}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              {isPaused
                ? <Path d="M5 3l14 9-14 9V3z" fill="#fff" />
                : <Path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="#fff" />
              }
            </Svg>
            <Text style={styles.pauseBtnText}>{isPaused ? "Resume" : "Pause"}</Text>
          </TouchableOpacity>
        )}

        {hasPermission === false && (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>
              Microphone permission denied. Please enable it in your device Settings to use this feature.
            </Text>
          </View>
        )}

        {isAnalyzing && (
          <View style={styles.analyzingBox}>
            <ActivityIndicator color="#e64980" size="large" />
            <Text style={styles.analyzingText}>Analyzing your pet's sound with AI...</Text>
          </View>
        )}

        {result && !isAnalyzing && (
          <>
            {/* Very unclear audio — show prominent warning to record again */}
            {result.isVeryUnclear && !result.isMock ? (
              <View style={styles.unclearCard}>
                <Text style={styles.unclearEmoji}>🔇</Text>
                <Text style={styles.unclearTitle}>Sound Unclear</Text>
                <Text style={styles.unclearMessage}>
                  The audio is too quiet, silent, or contains only ambient noise. 
                  Please record again with your pet making a clear sound closer to the microphone.
                </Text>
                <TouchableOpacity 
                  style={styles.recordAgainBtn} 
                  onPress={() => {
                    setResult(null);
                    setSeconds(0);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.recordAgainBtnText}>Record Again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.resultCard, { borderLeftColor: result.color }]}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultEmoji}>{result.emoji}</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={styles.resultTopRow}>
                      <Text style={styles.resultLabel}>{result.label}</Text>
                      {result.confidence > 0 && (
                        <View style={[styles.confidenceBadge, { backgroundColor: result.color + "22" }]}>
                          <Text style={[styles.confidenceText, { color: result.color }]}>{result.confidence}%</Text>
                        </View>
                      )}
                      {result.isMock && <Text style={styles.mockBadge}>Demo</Text>}
                    </View>
                  </View>
                </View>

                {/* Cat vs Dog probability bars — only shown for real results */}
                {!result.isMock && result.catProb !== undefined && (
                  <View style={styles.probBars}>
                    {(() => {
                      // Normalise so bars always sum to 100% visually
                      const total = (result.catProb || 0) + (result.dogProb || 0);
                      const catPct = total > 0 ? Math.round((result.catProb / total) * 100) : 50;
                      const dogPct = 100 - catPct;
                      return (
                        <>
                          <View style={styles.probRow}>
                            <Text style={styles.probLabel}>🐱 Cat</Text>
                            <View style={styles.probBarBg}>
                              <View style={[styles.probBarFill, { width: `${catPct}%`, backgroundColor: "#e64980" }]} />
                            </View>
                            <Text style={styles.probPct}>{catPct}%</Text>
                          </View>
                          <View style={styles.probRow}>
                            <Text style={styles.probLabel}>🐶 Dog</Text>
                            <View style={styles.probBarBg}>
                              <View style={[styles.probBarFill, { width: `${dogPct}%`, backgroundColor: "#ff9800" }]} />
                            </View>
                            <Text style={styles.probPct}>{dogPct}%</Text>
                          </View>
                        </>
                      );
                    })()}
                  </View>
                )}

                {/* Low confidence warning */}
                {result.isUncertain && !result.isMock && (
                  <View style={styles.uncertainBox}>
                    <Text style={styles.uncertainText}>
                      ⚠️ Low confidence — try recording a clearer, louder sound closer to the mic
                    </Text>
                  </View>
                )}

                {/* ── Mood Card ──────────────────────────────────────────── */}
                {!result.isMock && result.behavior && result.behavior !== "Unclear" && (
                  <View style={[styles.moodCard, { backgroundColor: (result.behaviorColor || "#e64980") + "12", borderColor: result.behaviorColor || "#e64980" }]}>
                    {/* Mood header */}
                    <View style={styles.moodHeaderRow}>
                      <View style={[styles.moodIconCircle, { backgroundColor: (result.behaviorColor || "#e64980") + "22" }]}>
                        <Text style={styles.moodIconEmoji}>{result.behaviorEmoji || "🐾"}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.moodSectionLabel}>Mood Detected</Text>
                        <Text style={[styles.moodName, { color: result.behaviorColor || "#e64980" }]}>
                          {result.behavior}
                        </Text>
                      </View>
                      {result.behaviorConfidence > 0 && (
                        <View style={[styles.moodConfidenceBadge, { backgroundColor: (result.behaviorColor || "#e64980") + "22" }]}>
                          <Text style={[styles.moodConfidenceText, { color: result.behaviorColor || "#e64980" }]}>
                            {result.behaviorConfidence}%
                          </Text>
                        </View>
                      )}
                    </View>
                    {/* Mood description */}
                    <Text style={styles.moodDescription}>{result.behaviorDescription}</Text>
                    {/* Mood confidence bar */}
                    {result.behaviorConfidence > 0 && (
                      <View style={styles.moodBarRow}>
                        <Text style={styles.moodBarLabel}>Confidence</Text>
                        <View style={styles.moodBarBg}>
                          <View style={[styles.moodBarFill, {
                            width: `${result.behaviorConfidence}%`,
                            backgroundColor: result.behaviorColor || "#e64980",
                          }]} />
                        </View>
                        <Text style={[styles.moodBarPct, { color: result.behaviorColor || "#e64980" }]}>
                          {result.behaviorConfidence}%
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.resultActions}>
                  <TouchableOpacity style={styles.resultBtn} onPress={() => {
                    if (result.isMock) {
                      Alert.alert("Demo Result", "Record a real pet sound to save an actual analysis.");
                    } else {
                      Alert.alert("Saved ✓", "Analysis saved to your history.");
                    }
                  }}>
                    <Text style={styles.resultBtnText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.resultBtn} onPress={goToChatbot}>
                    <Text style={styles.resultBtnText}>Ask PoofieAI</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },
  scroll: { paddingHorizontal: 18 * scaleX, paddingTop: 20 * scaleY, alignItems: "center" },
  header: { width: "100%", marginBottom: 30 * scaleY },
  headerTitle: { fontFamily: "Poppins-Bold", fontSize: 24 * scaleX, color: "#1a1a1a" },
  headerSub: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#888", marginTop: 4 },
  headerActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  uploadBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#fce4ec", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  uploadBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#e64980" },
  historyLink: {},
  historyLinkText: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#e64980" },  micSection: { alignItems: "center", justifyContent: "center", marginBottom: 20 * scaleY, width: 160 * scaleX, height: 160 * scaleX },
  pulseRing: { position: "absolute", width: 150 * scaleX, height: 150 * scaleX, borderRadius: 75 * scaleX, backgroundColor: "rgba(230,73,128,0.1)" },
  pulseRingActive: { backgroundColor: "rgba(230,73,128,0.2)" },
  micBtn: { width: 110 * scaleX, height: 110 * scaleX, borderRadius: 55 * scaleX, backgroundColor: "#e64980", alignItems: "center", justifyContent: "center", shadowColor: "#e64980", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 12 },
  micBtnActive: { backgroundColor: "#c2185b" },
  timer: { fontFamily: "Poppins-Bold", fontSize: 42 * scaleX, color: "#1a1a1a", letterSpacing: 2 },
  timerLabel: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#888", marginTop: 4, marginBottom: 24 * scaleY },
  waveformCard: { width: "100%", backgroundColor: "#fff", borderRadius: 20, padding: 16 * scaleX, marginBottom: 20 * scaleY, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 4 },
  waveform: { flexDirection: "row", alignItems: "center", height: 70 },
  bar: { flex: 1, borderRadius: 3, marginHorizontal: 1, minHeight: 3 },
  pauseBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#e64980", borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24, marginBottom: 20 * scaleY, shadowColor: "#e64980", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  pauseBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#fff", marginLeft: 8 },
  permissionBox: { backgroundColor: "#fff3e0", borderRadius: 12, padding: 14, width: "100%", marginBottom: 16 },
  permissionText: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#e65100" },
  analyzingBox: { alignItems: "center", justifyContent: "center", paddingVertical: 24, width: "100%" },
  analyzingText: { fontFamily: "Poppins-Regular", fontSize: 14 * scaleX, color: "#888", marginTop: 12 },
  resultCard: { width: "100%", backgroundColor: "#fff", borderRadius: 16, padding: 18 * scaleX, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 5 },
  resultHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  resultEmoji: { fontSize: 40 },
  resultTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  resultLabel: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#888" },
  confidenceBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  confidenceText: { fontFamily: "Poppins-Bold", fontSize: 11 * scaleX },
  mockBadge: { fontFamily: "Poppins-Regular", fontSize: 10 * scaleX, color: "#aaa", backgroundColor: "#f5f5f5", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  resultActions: { flexDirection: "row", gap: 10 },
  resultBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#e64980", borderRadius: 20, paddingVertical: 10 },
  resultBtnText: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#e64980" },
  // Probability bars
  probBars: { marginBottom: 12, gap: 6 },
  probRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  probLabel: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, width: 50 * scaleX },
  probBarBg: { flex: 1, height: 8, backgroundColor: "#f0f0f0", borderRadius: 4, overflow: "hidden" },
  probBarFill: { height: 8, borderRadius: 4 },
  probPct: { fontFamily: "Poppins-SemiBold", fontSize: 11 * scaleX, width: 38 * scaleX, textAlign: "right", color: "#555" },
  // Uncertainty warning
  uncertainBox: { backgroundColor: "#fff8e1", borderRadius: 8, padding: 10, marginBottom: 10 },
  uncertainText: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#f57c00" },
  // Unclear audio card
  unclearCard: { 
    width: "100%", 
    backgroundColor: "#fff", 
    borderRadius: 16, 
    padding: 24 * scaleX, 
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#ff6b6b",
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 10, 
    elevation: 5 
  },
  unclearEmoji: { fontSize: 64, marginBottom: 12 },
  unclearTitle: { 
    fontFamily: "Poppins-Bold", 
    fontSize: 20 * scaleX, 
    color: "#ff6b6b", 
    marginBottom: 8 
  },
  unclearMessage: { 
    fontFamily: "Poppins-Regular", 
    fontSize: 14 * scaleX, 
    color: "#555", 
    textAlign: "center",
    lineHeight: 20 * scaleY,
    marginBottom: 20 
  },
  recordAgainBtn: {
    backgroundColor: "#e64980",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    shadowColor: "#e64980",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6
  },
  recordAgainBtnText: {
    fontFamily: "Poppins-SemiBold",
    fontSize: 15 * scaleX,
    color: "#fff"
  },
  // Behavior / Mood detection card
  behaviorCard: {
    width: "100%",
    backgroundColor: "#fafafa",
    borderRadius: 14,
    padding: 14 * scaleX,
    marginBottom: 12,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  behaviorHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  behaviorEmoji: { fontSize: 32 },
  behaviorLabel: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#888" },
  behaviorName: { fontFamily: "Poppins-Bold", fontSize: 15 * scaleX, marginTop: 1 },
  behaviorBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  behaviorBadgeText: { fontFamily: "Poppins-Bold", fontSize: 11 * scaleX },
  behaviorDesc: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#555", lineHeight: 19 },
  // Mood card (prominent)
  moodCard: {
    width: "100%",
    borderRadius: 18,
    padding: 18 * scaleX,
    marginBottom: 12,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  },
  moodHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  moodIconCircle: {
    width: 56 * scaleX,
    height: 56 * scaleX,
    borderRadius: 28 * scaleX,
    alignItems: "center",
    justifyContent: "center",
  },
  moodIconEmoji: { fontSize: 30 },
  moodSectionLabel: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#888", marginBottom: 2 },
  moodName: { fontFamily: "Poppins-Bold", fontSize: 17 * scaleX },
  moodConfidenceBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  moodConfidenceText: { fontFamily: "Poppins-Bold", fontSize: 12 * scaleX },
  moodDescription: {
    fontFamily: "Poppins-Regular",
    fontSize: 13 * scaleX,
    color: "#444",
    lineHeight: 20,
    marginBottom: 12,
  },
  moodBarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  moodBarLabel: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#888", width: 72 * scaleX },
  moodBarBg: { flex: 1, height: 8, backgroundColor: "#e0e0e0", borderRadius: 4, overflow: "hidden" },
  moodBarFill: { height: 8, borderRadius: 4 },
  moodBarPct: { fontFamily: "Poppins-Bold", fontSize: 11 * scaleX, width: 36 * scaleX, textAlign: "right" },
});
