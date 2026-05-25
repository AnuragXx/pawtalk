import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

export default function GetStartedScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>

      {/* ── Decorative blobs — top area ── */}
      <View style={styles.blobTopLeft} />
      <View style={styles.blobTopRight} />
      <View style={styles.circleTopRight} />
      <View style={styles.circleTopCenter} />

      {/* ── Decorative blobs — bottom area ── */}
      <View style={styles.blobBottomLeft} />
      <View style={styles.blobBottomRight} />
      <View style={styles.blobBottomCenter} />

      {/* ── Logo ── */}
      <Image
        source={require("../assets/images/logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* ── Text ── */}
      <Text style={styles.title}>Get Started</Text>
      <Text style={styles.subtitle}>Understand what your pet{"\n"}is trying to say</Text>

      {/* ── Buttons ── */}
      <View style={styles.btnContainer}>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => navigation.navigate("SignIn")}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnOutline]}
          onPress={() => navigation.navigate("SignUp")}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Sign Up</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },

  // ── Top blobs ──
  blobTopLeft: {
    position: "absolute",
    top: -80 * scaleY,
    left: -60 * scaleX,
    width: 260 * scaleX,
    height: 260 * scaleY,
    borderRadius: 9999,
    backgroundColor: "#ffb6c8",
  },
  blobTopRight: {
    position: "absolute",
    top: -50 * scaleY,
    left: 220 * scaleX,
    width: 220 * scaleX,
    height: 220 * scaleY,
    borderRadius: 9999,
    backgroundColor: "#ff6b9a",
  },
  circleTopRight: {
    position: "absolute",
    top: 80 * scaleY,
    left: 300 * scaleX,
    width: 140 * scaleX,
    height: 140 * scaleY,
    borderRadius: 9999,
    backgroundColor: "#e64980",
  },
  circleTopCenter: {
    position: "absolute",
    top: 30 * scaleY,
    left: 140 * scaleX,
    width: 100 * scaleX,
    height: 100 * scaleY,
    borderRadius: 9999,
    backgroundColor: "#ffd6e3",
  },

  // ── Bottom blobs ──
  blobBottomLeft: {
    position: "absolute",
    bottom: -80 * scaleY,
    left: -80 * scaleX,
    width: 340 * scaleX,
    height: 340 * scaleY,
    borderRadius: 9999,
    backgroundColor: "#ff6b9a",
  },
  blobBottomRight: {
    position: "absolute",
    bottom: -60 * scaleY,
    left: 200 * scaleX,
    width: 280 * scaleX,
    height: 280 * scaleY,
    borderRadius: 9999,
    backgroundColor: "#e64980",
  },
  blobBottomCenter: {
    position: "absolute",
    bottom: 60 * scaleY,
    left: 60 * scaleX,
    width: 300 * scaleX,
    height: 200 * scaleY,
    borderRadius: 9999,
    backgroundColor: "#ffb6c8",
    opacity: 0.6,
  },

  // ── Logo ──
  logo: {
    position: "absolute",
    top: 170 * scaleY,
    alignSelf: "center",
    width: 110 * scaleX,
    height: 110 * scaleX,
  },

  // ── Text ──
  title: {
    position: "absolute",
    top: 300 * scaleY,
    left: 27 * scaleX,
    fontFamily: "Poppins-SemiBold",
    fontSize: 52 * scaleX,
    color: "#000",
    lineHeight: 60 * scaleX,
  },
  subtitle: {
    position: "absolute",
    top: 390 * scaleY,
    left: 27 * scaleX,
    width: 340 * scaleX,
    fontFamily: "Poppins-SemiBold",
    fontSize: 20 * scaleX,
    color: "#333",
    lineHeight: 30 * scaleX,
  },

  // ── Buttons ──
  btnContainer: {
    position: "absolute",
    bottom: 80 * scaleY,
    left: 27 * scaleX,
    right: 27 * scaleX,
    gap: 14,
  },
  btn: {
    width: "100%",
    height: 65 * scaleY,
    backgroundColor: "#fff",
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  btnOutline: {
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  btnText: {
    fontFamily: "Poppins-Bold",
    fontSize: 20 * scaleX,
    color: "#000",
  },
});
