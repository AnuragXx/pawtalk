// ─── Backend URL ─────────────────────────────────────────────────────────────
// LOCAL (same WiFi only):  "http://10.142.224.99:5000"
// CLOUD (works everywhere): set EXPO_PUBLIC_BACKEND_URL in .env, or falls back to Railway
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://backend-v3-production-7ca9.up.railway.app";

const SPECIES_CONFIG = {
  cat: { emoji: "🐱", color: "#e64980", label: "Cat Detected" },
  dog: { emoji: "🐶", color: "#ff9800", label: "Dog Detected" },
};

export const soundAPI = {
  analyze: async (audioUri, petType) => {
    console.log("🔍 soundAPI.analyze called");
    console.log("   Backend URL:", BACKEND_URL);
    console.log("   Audio URI:", audioUri);
    console.log("   Pet Type:", petType);
    
    try {
      if (!audioUri) throw new Error("No audio URI provided");

      // ── Build multipart form with the audio file ──────────────────────────
      const formData = new FormData();
      const filename = audioUri.split("/").pop() || "recording.m4a";
      const ext = filename.split(".").pop()?.toLowerCase() || "m4a";
      const mimeType = ext === "wav" ? "audio/wav"
                     : ext === "mp3" ? "audio/mpeg"
                     : ext === "ogg" ? "audio/ogg"
                     : "audio/m4a";

      formData.append("audio", {
        uri:  audioUri,
        name: filename,
        type: mimeType,
      });

      console.log("📤 Sending request to:", `${BACKEND_URL}/analyze`);
      console.log("   File:", filename, "Type:", mimeType);

      // ── Call Flask backend ────────────────────────────────────────────────
      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method:  "POST",
        body:    formData,
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn("❌ Backend /analyze error:", response.status, errText);
        throw new Error("Backend error: " + response.status);
      }

      const data = await response.json();
      console.log("✅ Backend response:", data);
      
      const species = data.species || petType || "dog";
      const confidence = data.confidence || 0;
      const config = SPECIES_CONFIG[species] || SPECIES_CONFIG.dog;

      // If model is very uncertain or audio is unclear, flag it
      if (data.isVeryUnclear) {
        console.log(`🔇 Audio unclear: cat=${data.cat_prob}% dog=${data.dog_prob}%`);
      } else if (data.isUncertain) {
        console.log(`⚠️ Low confidence: cat=${data.cat_prob}% dog=${data.dog_prob}%`);
      }

      return {
        success:             true,
        species,
        confidence,
        catProb:             data.cat_prob || 0,
        dogProb:             data.dog_prob || 0,
        isUncertain:         data.isUncertain || false,
        isVeryUnclear:       data.isVeryUnclear || false,
        label:               config.label,
        emoji:               config.emoji,
        color:               config.color,
        isMock:              data.isMock || false,
        // ── Behavior detection fields ──────────────────────────────────────
        behavior:            data.behavior || null,
        behaviorDescription: data.behaviorDescription || null,
        behaviorEmoji:       data.behaviorEmoji || null,
        behaviorColor:       data.behaviorColor || null,
        behaviorConfidence:  data.behaviorConfidence || 0,
      };

    } catch (err) {
      console.warn("⚠️ Sound analysis error (falling back to mock):", err.message);
      console.warn("   Error details:", err);
      
      // Graceful fallback — app still works if backend is unreachable
      const species = (petType === "cat" || petType === "dog") ? petType : "dog";
      const config = SPECIES_CONFIG[species] || SPECIES_CONFIG.dog;
      return {
        success:    true,
        species,
        confidence: 0,
        label:      config.label,
        emoji:      config.emoji,
        color:      config.color,
        isMock:     true,
        error:      err.message,
      };
    }
  },
};

// ─── Chatbot — powered by Groq API (llama-3.3-70b-versatile) ─────────────────

var GROQ_KEY = process.env.EXPO_PUBLIC_GROQ_KEY || "";
var GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
var SYS_PROMPT = "You are PoofieAI, a friendly pet care assistant. Answer simply and briefly. Do not give medical diagnosis. Keep answers to 3-4 lines maximum.";
var FALLBACK = "I am having trouble responding right now. Please try again later or consult a vet if urgent.";

export const chatAPI = {
  sendMessage: async (message, petType, petBreed, history = []) => {
    try {
      if (!message || !message.trim()) return { success: true, reply: FALLBACK };

      // Validate Groq key before attempting the request
      if (!GROQ_KEY) {
        console.warn("⚠️ EXPO_PUBLIC_GROQ_KEY is not set. Chatbot will not work.");
        return {
          success: false,
          reply: "PoofieAI is not configured yet. Please add your Groq API key to the .env file.",
        };
      }

      var context = "";
      if (petType) context += "User has a " + petType;
      if (petBreed) context += " (" + petBreed + ")";
      if (context) context += ". ";

      // Build full conversation history for Groq
      var conversationMessages = [
        { role: "system", content: SYS_PROMPT + (context ? " " + context : "") },
      ];

      // Add prior turns (skip the initial greeting bot message)
      history.forEach((msg) => {
        if (msg.sender === "user") {
          conversationMessages.push({ role: "user", content: msg.text });
        } else if (msg.sender === "bot" && msg.id !== "0") {
          conversationMessages.push({ role: "assistant", content: msg.text });
        }
      });

      // Add the current user message
      conversationMessages.push({ role: "user", content: message.trim() });

      var res = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + GROQ_KEY,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: conversationMessages,
          max_tokens: 200,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        var errText = await res.text();
        console.error("Groq error:", res.status, errText);
        if (res.status === 429) return { success: true, reply: "PoofieAI is busy right now. Please wait a moment and try again." };
        return { success: true, reply: FALLBACK };
      }

      var data = await res.json();
      var reply = data?.choices?.[0]?.message?.content?.trim();
      if (!reply) return { success: true, reply: FALLBACK };
      return { success: true, reply };
    } catch (e) {
      console.error("Chatbot error:", e.message);
      return { success: true, reply: FALLBACK };
    }
  },
};
