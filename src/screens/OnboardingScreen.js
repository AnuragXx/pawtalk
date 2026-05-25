import React, { useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Image, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

const SLIDES = [
  { key: "1" },
  { key: "2" },
  { key: "3" },
];

export default function OnboardingScreen({ navigation }) {
  const { completeOnboarding } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef(null);

  const handleNext = async () => {
    if (activeIndex < SLIDES.length - 1) {
      flatRef.current.scrollToIndex({ index: activeIndex + 1 });
      setActiveIndex(activeIndex + 1);
    } else {
      await completeOnboarding();
      navigation.replace("TermsAgreement");
    }
  };

  const renderSlide = ({ item, index }) => {
    if (index === 0) {
      return (
        <View style={styles.slide}>
          {/* Logo */}
          <Image
            source={require("../assets/images/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          {/* Title */}
          <Text style={styles.title}>Welcome to PawTalk</Text>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            Understand what your pet is trying to tell you.
          </Text>

          {/* Polygon background shape */}
          <Image
            source={require("../assets/images/polygon-2.png")}
            style={styles.polygon}
            resizeMode="stretch"
          />

          {/* Pet illustration */}
          <Image
            source={require("../assets/images/5531930-removebg-preview-1.png")}
            style={styles.illustration}
            resizeMode="contain"
          />
        </View>
      );
    }

    if (index === 1) {
      return (
        <View style={styles.slide}>
          <Text style={styles.title2}>Listen to Your Pet</Text>
          <Text style={styles.subtitle2}>
            Record and analyze your pet's sounds to discover their emotions.
          </Text>
          {/* polygon using polygon-2.png */}
          <Image
            source={require("../assets/images/polygon-2.png")}
            style={styles.polygon2}
            resizeMode="stretch"
          />
          <Image
            source={require("../assets/images/v872batch10Nunny03RemovebgPreview1.png")}
            style={styles.illustration2}
            resizeMode="contain"
          />
        </View>
      );
    }

    // Slide 3
    return (
      <View style={styles.slide}>
        <Text style={styles.title3}>Care Smarter{"\n"}for Your Pets</Text>
        <Text style={styles.subtitle3}>
          Manage pet profiles, reminders, and get help from the AI chatbot.
        </Text>
        <Image
          source={require("../assets/images/polygon-2.png")}
          style={styles.polygon3}
          resizeMode="stretch"
        />
        <Image
          source={require("../assets/images/5530053-1.png")}
          style={styles.illustration3}
          resizeMode="contain"
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ref={flatRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setActiveIndex(index);
        }}
      />

      {/* Pagination dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]} />
        ))}
      </View>

      {/* Buttons row */}
      <View style={styles.btnRow}>
        {activeIndex < SLIDES.length - 1 && (
          <TouchableOpacity style={styles.skipBtn} onPress={async () => { await completeOnboarding(); navigation.replace("TermsAgreement"); }}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.nextBtn, activeIndex === SLIDES.length - 1 && { flex: 1 }]} onPress={handleNext}>
          <Text style={styles.nextText}>{activeIndex === SLIDES.length - 1 ? "Get Started" : "Next"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff1f1" },

  slide: {
    width,
    height: height * 0.82,
    backgroundColor: "#fff1f1",
    position: "relative",
    overflow: "hidden",
  },
  logo: {
    position: "absolute",
    top: 0,
    left: 131 * scaleX,
    width: 134 * scaleX,
    height: 134 * scaleY,
  },
  title: {
    position: "absolute",
    top: 123 * scaleY,
    left: 11 * scaleX,
    width: 399 * scaleX,
    fontFamily: "Poppins-Bold",
    fontSize: 40 * scaleX,
    color: "#000",
    textAlign: "center",
  },
  subtitle: {
    position: "absolute",
    top: 257 * scaleY,
    left: 7 * scaleX,
    width: 399 * scaleX,
    fontFamily: "Poppins-SemiBold",
    fontSize: 24 * scaleX,
    color: "#000",
    textAlign: "center",
    lineHeight: 34 * scaleX,
  },
  polygon: {
    position: "absolute",
    top: 460 * scaleY,
    left: 0,
    width: 412 * scaleX,
    height: 205 * scaleY,
  },
  illustration: {
    position: "absolute",
    top: 362 * scaleY,
    left: 0,
    width: 410 * scaleX,
    height: 410 * scaleY,
  },

  // Slide 2
  title2: {
    position: "absolute",
    top: 126 * scaleY,
    left: 5 * scaleX,
    width: 399 * scaleX,
    fontFamily: "Poppins-Bold",
    fontSize: 40 * scaleX,
    color: "#000",
    textAlign: "center",
  },
  subtitle2: {
    position: "absolute",
    top: 206 * scaleY,
    left: 4 * scaleX,
    width: 399 * scaleX,
    fontFamily: "Poppins-SemiBold",
    fontSize: 24 * scaleX,
    color: "#000",
    textAlign: "center",
    lineHeight: 34 * scaleX,
  },
  polygon2: {
    position: "absolute",
    top: 467 * scaleY,
    left: 0,
    width: 412 * scaleX,
    height: 205 * scaleY,
  },
  illustration2: {
    position: "absolute",
    top: 320 * scaleY,
    left: 0,
    width: 412 * scaleX,
    height: 468 * scaleY,
  },

  // Slide 3
  title3: {
    position: "absolute",
    top: 119 * scaleY,
    left: 5 * scaleX,
    width: 399 * scaleX,
    fontFamily: "Poppins-Bold",
    fontSize: 40 * scaleX,
    color: "#000",
    textAlign: "center",
  },
  subtitle3: {
    position: "absolute",
    top: 243 * scaleY,
    left: 6 * scaleX,
    width: 399 * scaleX,
    fontFamily: "Poppins-SemiBold",
    fontSize: 24 * scaleX,
    color: "#000",
    textAlign: "center",
    lineHeight: 34 * scaleX,
  },
  polygon3: {
    position: "absolute",
    top: 460 * scaleY,
    left: 0,
    width: 412 * scaleX,
    height: 205 * scaleY,
  },
  illustration3: {
    position: "absolute",
    top: 377 * scaleY,
    left: 19 * scaleX,
    width: 371 * scaleX,
    height: 371 * scaleY,
  },

  // Dots
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
  },
  dot: {
    height: 16,
    marginHorizontal: 5,
    borderRadius: 10,
  },
  dotActive: {
    width: 43,
    backgroundColor: "#008080",
  },  dotInactive: {
    width: 24,
    height: 20,
    borderRadius: 12,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#008080",
  },

  // Next button
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 47 * scaleX,
    marginBottom: 16,
    gap: 12,
  },
  skipBtn: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 41,
    borderWidth: 1.5,
    borderColor: "#008080",
  },
  skipText: {
    fontFamily: "Poppins-SemiBold",
    fontSize: 16 * scaleX,
    color: "#008080",
  },
  nextBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 41,
    height: 65 * scaleY,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
  },
  nextText: {
    fontFamily: "Poppins-Bold",
    fontSize: 20 * scaleX,
    color: "#000",
  },
});
