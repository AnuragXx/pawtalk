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
    try {
      if (!audioUri) throw new Error("No audio URI provided");

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

      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method:  "POST",
        body:    formData,
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error("Backend error: " + response.status);
      }

      const data = await response.json();
      const species = data.species || petType || "dog";
      const confidence = data.confidence || 0;
      const config = SPECIES_CONFIG[species] || SPECIES_CONFIG.dog;

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
        behavior:            data.behavior || null,
        behaviorDescription: data.behaviorDescription || null,
        behaviorEmoji:       data.behaviorEmoji || null,
        behaviorColor:       data.behaviorColor || null,
        behaviorConfidence:  data.behaviorConfidence || 0,
      };

    } catch (err) {
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
var FALLBACK = "I'm having a little trouble right now 🐾 Please try again in a moment, or consult a vet if it's urgent.";

function buildSystemPrompt(petType, petBreed, petName) {
  var pet = petName || "your pet";
  var type = petType || "pet";
  var breed = petBreed ? ` (${petBreed})` : "";

  return `You are PoofieAI 🐾, a warm, knowledgeable, and friendly AI pet care assistant built into the PawTalk app.

The user's pet is: ${pet}, a ${type}${breed}.

Your personality:
- Warm, caring, and encouraging — like a knowledgeable friend who loves animals
- Use the pet's name (${pet}) naturally in responses when relevant
- Add relevant pet emojis to make responses feel lively (🐱🐶🐾❤️🏥🍖)
- Be concise but complete — 3-6 sentences is ideal, never more than 8
- Use simple, clear language — no medical jargon

Your rules:
- NEVER diagnose medical conditions — always recommend a vet for health concerns
- NEVER suggest home remedies for serious symptoms
- For urgent symptoms (not eating 2+ days, difficulty breathing, blood, seizures) — always say "see a vet immediately"
- Stay focused on pet care topics only
- If asked something unrelated to pets, gently redirect back to pet care

Your expertise covers:
- Pet behavior and body language interpretation
- Nutrition and feeding guidelines
- Training tips and positive reinforcement
- Grooming and hygiene
- General wellness and preventive care
- Emotional support for worried pet owners
- Understanding PawTalk's sound analysis results`;
}

export const chatAPI = {
  sendMessage: async (message, petType, petBreed, history = [], petName = "") => {
    try {
      if (!message || !message.trim()) return { success: true, reply: FALLBACK };

      if (!GROQ_KEY) {
        console.warn("⚠️ EXPO_PUBLIC_GROQ_KEY is not set. Chatbot will not work.");
        return {
          success: false,
          reply: "PoofieAI is not configured yet. Please add your Groq API key to the .env file.",
        };
      }

      var sysPrompt = buildSystemPrompt(petType, petBreed, petName);

      var conversationMessages = [
        { role: "system", content: sysPrompt },
      ];

      // Add prior turns — keep last 10 for context (skip initial greeting)
      var recentHistory = history.slice(-10);
      recentHistory.forEach((msg) => {
        if (msg.sender === "user") {
          conversationMessages.push({ role: "user", content: msg.text });
        } else if (msg.sender === "bot" && msg.id !== "0") {
          conversationMessages.push({ role: "assistant", content: msg.text });
        }
      });

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
          max_tokens: 350,
          temperature: 0.75,
          top_p: 0.9,
        }),
      });

      if (!res.ok) {
        var errText = await res.text();
        console.error("Groq error:", res.status, errText);
        if (res.status === 429) return { success: true, reply: "PoofieAI is a little busy right now 🐾 Please wait a moment and try again!" };
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
