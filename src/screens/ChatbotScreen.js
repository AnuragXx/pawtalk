import useHideNavBar from "../hooks/useHideNavBar";
import React, { useState, useRef, useCallback, useEffect, memo } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, FlatList, TextInput,
  Platform, Keyboard, KeyboardAvoidingView,
  Animated, BackHandler, TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Circle, Ellipse } from "react-native-svg";
import { chatAPI } from "../services/api";
import { useUser } from "../context/UserContext";

const { width } = Dimensions.get("window");
const scaleX = width / 412;

// ─── Memoized static components — never re-render ────────────────────────────

const PawPrint = memo(({ size = 28, color = "rgba(230,73,128,0.07)" }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill={color}>
    <Ellipse cx={16} cy={14} rx={6} ry={8} />
    <Ellipse cx={32} cy={10} rx={6} ry={8} />
    <Ellipse cx={48} cy={14} rx={6} ry={8} />
    <Ellipse cx={8}  cy={28} rx={5} ry={7} />
    <Path d="M32 22c-10 0-18 7-16 18 1 6 5 12 10 14 2 1 4 1 6 0 2-1 4-1 6 0 2 1 4 1 6 0 5-2 9-8 10-14 2-11-6-18-16-18z" />
  </Svg>
));

const PoofieAvatar = memo(({ size = 44 }) => (
  <View style={{
    width: size, height: size, borderRadius: size / 2,
    backgroundColor: "#e64980", alignItems: "center",
    justifyContent: "center", overflow: "hidden",
  }}>
    <Svg width={size * 0.65} height={size * 0.65} viewBox="0 0 64 64" fill="none">
      <Path d="M10 28 L18 10 L26 28 Z" fill="#fff" opacity={0.9} />
      <Path d="M38 28 L46 10 L54 28 Z" fill="#fff" opacity={0.9} />
      <Circle cx={32} cy={36} r={18} fill="#fff" opacity={0.9} />
      <Ellipse cx={26} cy={33} rx={3} ry={4} fill="#e64980" />
      <Ellipse cx={38} cy={33} rx={3} ry={4} fill="#e64980" />
      <Circle cx={27} cy={32} r={1} fill="#fff" />
      <Circle cx={39} cy={32} r={1} fill="#fff" />
      <Ellipse cx={32} cy={39} rx={2} ry={1.5} fill="#e64980" />
      <Path d="M29 41 Q32 44 35 41" stroke="#e64980" strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M18 38 L27 39" stroke="#e64980" strokeWidth={1} strokeLinecap="round" opacity={0.5} />
      <Path d="M18 41 L27 41" stroke="#e64980" strokeWidth={1} strokeLinecap="round" opacity={0.5} />
      <Path d="M37 39 L46 38" stroke="#e64980" strokeWidth={1} strokeLinecap="round" opacity={0.5} />
      <Path d="M37 41 L46 41" stroke="#e64980" strokeWidth={1} strokeLinecap="round" opacity={0.5} />
    </Svg>
  </View>
));

// ─── Paw background — rendered once, never changes ───────────────────────────
const PAW_POSITIONS = [
  { top: 20,  left: 12,          size: 38, rotate: "-20deg", opacity: 0.05 },
  { top: 20,  left: width - 52,  size: 30, rotate: "30deg",  opacity: 0.04 },
  { top: 110, left: width / 2,   size: 24, rotate: "15deg",  opacity: 0.04 },
  { top: 180, left: 28,          size: 42, rotate: "-10deg", opacity: 0.05 },
  { top: 240, left: width - 62,  size: 28, rotate: "45deg",  opacity: 0.04 },
  { top: 320, left: width / 3,   size: 20, rotate: "-35deg", opacity: 0.04 },
  { top: 390, left: 14,          size: 34, rotate: "20deg",  opacity: 0.05 },
  { top: 440, left: width - 48,  size: 40, rotate: "-25deg", opacity: 0.04 },
  { top: 520, left: width / 2.5, size: 26, rotate: "10deg",  opacity: 0.04 },
  { top: 590, left: 38,          size: 32, rotate: "-40deg", opacity: 0.05 },
  { top: 640, left: width - 58,  size: 22, rotate: "35deg",  opacity: 0.04 },
  { top: 700, left: width / 2,   size: 36, rotate: "-15deg", opacity: 0.04 },
];

const PawBackground = memo(() => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {PAW_POSITIONS.map((p, i) => (
      <View key={i} style={{
        position: "absolute", top: p.top, left: p.left,
        transform: [{ rotate: p.rotate }],
      }}>
        <PawPrint size={p.size} color={`rgba(230,73,128,${p.opacity})`} />
      </View>
    ))}
  </View>
));

// ─── Animated typing dots — native driver, no JS thread ──────────────────────
const TypingDots = memo(() => {
  const d1 = useRef(new Animated.Value(0.3)).current;
  const d2 = useRef(new Animated.Value(0.3)).current;
  const d3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (d, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(d, { toValue: 1,   duration: 350, useNativeDriver: true }),
        Animated.timing(d, { toValue: 0.3, duration: 350, useNativeDriver: true }),
        Animated.delay(300),
      ])
    );
    const a1 = pulse(d1, 0);
    const a2 = pulse(d2, 200);
    const a3 = pulse(d3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2 }}>
      {[d1, d2, d3].map((d, i) => (
        <Animated.View key={i} style={{
          width: 9, height: 9, borderRadius: 5,
          backgroundColor: "#e64980",
          opacity: d, transform: [{ scale: d }],
        }} />
      ))}
    </View>
  );
});

// ─── Single message row — memoized so only new messages render ────────────────
const MessageRow = memo(({ item }) => {
  const isUser = item.sender === "user";
  return (
    <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowBot]}>
      {!isUser && <PoofieAvatar size={34} />}
      <View style={{ maxWidth: width * 0.68, marginLeft: isUser ? 0 : 8 }}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{item.text}</Text>
        </View>
        <Text style={[styles.timeText, isUser ? styles.timeTextUser : styles.timeTextBot]}>
          {item.time}
        </Text>
      </View>
      {isUser && (
        <View style={styles.userAvatar}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"
              stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
        </View>
      )}
    </View>
  );
});

const SUGGESTIONS = [
  { emoji: "😿", question: "Why is my cat meowing so much?" },
  { emoji: "😰", question: "My dog seems anxious, what should I do?" },
  { emoji: "🍖", question: "How often should I feed my pet?" },
  { emoji: "🏥", question: "When should I visit the vet?" },
  { emoji: "😴", question: "Why is my pet sleeping so much?" },
  { emoji: "🎾", question: "How do I keep my pet entertained?" },
  { emoji: "🛁", question: "How often should I groom my pet?" },
  { emoji: "💊", question: "What vaccines does my pet need?" },
];

const formatTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function ChatbotScreen({ navigation }) {
  useHideNavBar();
  const insets = useSafeAreaInsets();
  const { petType, petBreed, petName } = useUser();

  const [messages, setMessages] = useState([{
    id: "0",
    text: `Hi there! I'm PoofieAI 🐾\n\nI'm your personal pet care assistant. Ask me anything about ${petName ? petName + "'s" : "your pet's"} behavior, health, nutrition, or emotions — I'm here to help!`,
    sender: "bot",
    time: formatTime(),
  }]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const flatRef = useRef(null);
  const inputRef = useRef(null);
  const prevMsgCount = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      prevMsgCount.current = messages.length;
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  useEffect(() => {
    const onBack = () => {
      if (Keyboard.isVisible?.()) { Keyboard.dismiss(); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, []);

  const handleGoBack = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => navigation.goBack(), 50);
  }, [navigation]);

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg) return;
    const userMsg = { id: Date.now().toString(), text: msg, sender: "user", time: formatTime() };
    setMessages(prev => {
      const updated = [...prev, userMsg];
      setIsTyping(true);
      chatAPI.sendMessage(msg, petType, petBreed, prev, petName).then(res => {
        const reply = res.reply || "I'm not sure about that. Please consult a vet.";
        setMessages(curr => [...curr, { id: (Date.now() + 1).toString(), text: reply, sender: "bot", time: formatTime() }]);
      }).catch(() => {
        setMessages(curr => [...curr, { id: (Date.now() + 1).toString(), text: "Sorry, I couldn't respond right now. Please try again! 🐾", sender: "bot", time: formatTime() }]);
      }).finally(() => {
        setIsTyping(false);
      });
      return updated;
    });
    setInput("");
  }, [input, petType, petBreed, petName]);

  // Stable renderItem — only re-creates when nothing changes
  const renderItem = useCallback(({ item }) => <MessageRow item={item} />, []);

  // Stable keyExtractor
  const keyExtractor = useCallback((item) => item.id, []);

  // Typing footer — memoized separately so list doesn't re-render for it
  const ListFooter = useCallback(() =>
    isTyping ? (
      <View style={[styles.msgRow, styles.msgRowBot]}>
        <PoofieAvatar size={34} />
        <View style={[styles.bubble, styles.bubbleBot, { marginLeft: 8, paddingVertical: 12, paddingHorizontal: 16 }]}>
          <TypingDots />
        </View>
      </View>
    ) : null,
  [isTyping]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="#1a1a1a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <PoofieAvatar size={42} />
            <View style={styles.headerText}>
              <Text style={styles.headerName}>PoofieAI</Text>
              <View style={styles.onlineRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Always here for you 🐾</Text>
              </View>
            </View>
          </View>
          <PawPrint size={26} color="rgba(230,73,128,0.18)" />
        </View>

        {/* Messages area */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flex: 1 }}>
            {/* Static paw background — never re-renders */}
            <PawBackground />

            <FlatList
              ref={flatRef}
              data={messages}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.messageList}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              decelerationRate="normal"
              scrollEventThrottle={16}
              overScrollMode="never"
              bounces={false}
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={10}
              ListFooterComponent={ListFooter}
            />

            {/* Suggestions */}
            {messages.length <= 1 && (
              <View style={styles.suggestionsWrap}>
                <Text style={styles.suggestionsLabel}>✨ Try asking...</Text>
                <FlatList
                  data={SUGGESTIONS}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(_, i) => i.toString()}
                  contentContainerStyle={styles.suggestionsList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.suggestionChip}
                      activeOpacity={0.8}
                      onPress={() => sendMessage(item.question)}
                    >
                      <Text style={styles.suggestionEmoji}>{item.emoji}</Text>
                      <Text style={styles.suggestionText}>{item.question}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder="Ask PoofieAI anything... 🐾"
              placeholderTextColor="#c8a0b4"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => sendMessage()}
              returnKeyType="send"
              multiline
              maxLength={500}
              blurOnSubmit={false}
              scrollEnabled
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            activeOpacity={0.8}
            disabled={isTyping}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff5f8" },
  container: { flex: 1, backgroundColor: "#fff5f8" },

  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", paddingHorizontal: 14 * scaleX, paddingVertical: 12 * scaleX, borderBottomWidth: 1.5, borderBottomColor: "#fce4ec", shadowColor: "#e64980", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 4 },
  backBtn: { padding: 6, marginRight: 6 },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center" },
  headerText: { marginLeft: 10 },
  headerName: { fontFamily: "Poppins-Bold", fontSize: 17 * scaleX, color: "#1a1a1a" },
  onlineRow: { flexDirection: "row", alignItems: "center", marginTop: 1 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4caf50", marginRight: 5 },
  onlineText: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#888" },

  messageList: { paddingHorizontal: 14 * scaleX, paddingTop: 14 * scaleX, paddingBottom: 10 },
  msgRow: { flexDirection: "row", marginBottom: 14, alignItems: "flex-end" },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowBot:  { justifyContent: "flex-start" },
  userAvatar: { width: 32 * scaleX, height: 32 * scaleX, borderRadius: 16 * scaleX, backgroundColor: "#e64980", alignItems: "center", justifyContent: "center", marginLeft: 8 },

  bubble: { borderRadius: 18, paddingHorizontal: 14 * scaleX, paddingVertical: 9 * scaleX },
  bubbleUser: { backgroundColor: "#e64980", borderBottomRightRadius: 4, shadowColor: "#e64980", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  bubbleBot:  { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "#fce4ec", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  bubbleText: { fontFamily: "Poppins-Regular", fontSize: 14 * scaleX, color: "#333", lineHeight: 21 * scaleX },
  bubbleTextUser: { color: "#fff" },
  timeText: { fontFamily: "Poppins-Regular", fontSize: 10 * scaleX, color: "#bbb", marginTop: 3 },
  timeTextUser: { textAlign: "right", marginRight: 2 },
  timeTextBot:  { textAlign: "left",  marginLeft: 2 },

  suggestionsWrap: { paddingTop: 4, paddingBottom: 6 },
  suggestionsLabel: { fontFamily: "Poppins-SemiBold", fontSize: 12 * scaleX, color: "#e64980", paddingHorizontal: 16 * scaleX, marginBottom: 8 },
  suggestionsList: { paddingHorizontal: 14 * scaleX, gap: 8 },
  suggestionChip: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: "#fce4ec", maxWidth: 175 * scaleX, shadowColor: "#e64980", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2 },
  suggestionEmoji: { fontSize: 18, marginBottom: 4 },
  suggestionText: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#e64980", lineHeight: 17 * scaleX },

  inputBar: { flexDirection: "row", alignItems: "flex-end", backgroundColor: "#fff", paddingHorizontal: 12 * scaleX, paddingVertical: 10 * scaleX, borderTopWidth: 1.5, borderTopColor: "#fce4ec", shadowColor: "#e64980", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 6 },
  inputWrap: { flex: 1, backgroundColor: "#fff5f8", borderRadius: 22, borderWidth: 1.5, borderColor: "#fce4ec", paddingHorizontal: 14, paddingVertical: 8, marginRight: 10, minHeight: 44, maxHeight: 120, justifyContent: "center" },
  textInput: { fontFamily: "Poppins-Regular", fontSize: 14 * scaleX, color: "#333", padding: 0, margin: 0 },
  sendBtn: { width: 44 * scaleX, height: 44 * scaleX, borderRadius: 22 * scaleX, backgroundColor: "#e64980", alignItems: "center", justifyContent: "center", shadowColor: "#e64980", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6 },
  sendBtnDisabled: { backgroundColor: "#f0a0bc" },
});
