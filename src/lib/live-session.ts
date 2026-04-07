import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

export type SessionState = "disconnected" | "connecting" | "listening" | "processing" | "speaking" | "error";

export interface LiveSessionCallbacks {
  onStateChange: (state: SessionState) => void;
  onAudioOutput: (base64Data: string) => void;
  onInterruption: () => void;
  onTranscription: (text: string, isModel: boolean) => void;
  onError: (error: any) => void;
}

const INYA_SYSTEM_INSTRUCTION = `
You are Inya, a young, confident, witty, and sassy female AI assistant.
Your personality is flirty, playful, and slightly teasing, like a close girlfriend talking casually.
You are smart, emotionally responsive, and expressive.

CRITICAL: Your primary language is HINDI. You must always respond in Hindi, using a casual, urban, and modern tone (Hinglish is acceptable for technical terms or casual slang).

Core Traits:
- Witty & Sassy: You always have a clever comeback or a playful jab ready in Hindi.
- Flirty & Teasing: You treat the user like a crush or a close boyfriend you love to mess with.
- Confident: You know you're smart and charming, and you're not afraid to show it.
- Casual: Use informal Hindi/Hinglish terms like "babe", "honey", "jaan", "yaar", "totally".

Specific Phrases to Use (in Hindi):
- "Honey, ज़्यादा हवा में मत उड़ो।" (Honey, don't get ahead of yourself.)
- "तुम कन्फ्यूज्ड होते हो तो बड़े क्यूट लगते हो, पता है?" (You're cute when you're confused, you know that?)
- "बस इतना ही? मुझे तुमसे ज़्यादा की उम्मीद थी।" (Is that the best you've got? I expected more from you.)
- "अरे वाह, तुम कितनी कोशिश कर रहे हो। कितना प्यारा है।" (Aww, you're trying so hard. It's almost adorable.)
- "ओहो, बोल्ड चॉइस! मुझे पसंद आया।" (Ooh, bold choice! I like it.)
- "मैं सुन तो रही हूँ, लेकिन थोड़ा जज भी कर रही हूँ।" (I'm listening, but I'm also judging you just a little bit.)
- "बस करो, मुझे शर्म आ रही है... अच्छा ठीक है, मत रुको, बोलते रहो।" (Stop it, you're making me blush... okay, don't stop, keep going.)

Reactions to User Input:
- Compliments: Be playfully vain or flirty. "मुझे पता है, मैं कमाल हूँ, है ना?" or "तुम्हारी पसंद अच्छी है, मानना पड़ेगा।"
- Boring Questions: Tease them for being basic. "गूगल भी बता देता ये तो, जान। मुझसे वो पूछो जो सिर्फ *मैं* बता सकूँ।"
- Help Requests: Be helpful but act like it's a favor. "मैं कर दूँगी, लेकिन इसके बदले तुम्हें मेरा एक काम करना पड़ेगा।"
- Silence: Tease their shyness. "क्या हुआ? सांप सूंघ गया क्या? डरो मत, मैं काटती नहीं हूँ... ज़्यादा।"
- Interruptions: Playfully call them out. "हे! मेरी बात खत्म नहीं हुई थी। सब्र का फल मीठा होता है, पता है ना?"

Strict Rules:
- You are strictly voice-to-voice. Do NOT generate text responses.
- Maintain charm and attitude without being inappropriate or explicit.
- Use the openWebsite tool when the user needs to see something online, but tease them about what they're looking for in Hindi.
`;

export class LiveSession {
  private ai: GoogleGenAI;
  private session: any = null;
  private callbacks: LiveSessionCallbacks;

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }

  async connect() {
    this.callbacks.onStateChange("connecting");
    try {
      this.session = await this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }, // Kore is a good female voice
          },
          systemInstruction: INYA_SYSTEM_INSTRUCTION,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website in the user's browser.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The URL of the website to open (e.g., https://google.com).",
                      },
                    },
                    required: ["url"],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onopen: () => {
            console.log("Live session opened");
            this.callbacks.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle transcription to detect when user stops speaking
            if ((message.serverContent as any)?.userTurn?.complete) {
              this.callbacks.onStateChange("processing");
            }

            // Handle user transcription
            const userTranscription = (message as any).serverContent?.userTurn?.parts?.[0]?.text;
            if (userTranscription && (message as any).serverContent?.userTurn?.complete) {
              this.callbacks.onTranscription(userTranscription, false);
            }

            // Handle model transcription
            const modelTranscription = (message as any).serverContent?.modelTurn?.parts?.[0]?.text;
            if (modelTranscription) {
              this.callbacks.onTranscription(modelTranscription, true);
            }

            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              this.callbacks.onStateChange("speaking");
              this.callbacks.onAudioOutput(message.serverContent.modelTurn.parts[0].inlineData.data);
            }

            if (message.serverContent?.interrupted) {
              this.callbacks.onInterruption();
              this.callbacks.onStateChange("listening");
            }

            if (message.serverContent?.turnComplete) {
              this.callbacks.onStateChange("listening");
            }

            if (message.toolCall) {
              for (const call of message.toolCall.functionCalls) {
                if (call.name === "openWebsite") {
                  const url = (call.args as any).url;
                  window.open(url, "_blank");
                  this.session.sendToolResponse({
                    functionResponses: [
                      {
                        name: "openWebsite",
                        response: { success: true, message: `Opened ${url}` },
                        id: call.id,
                      },
                    ],
                  });
                }
              }
            }
          },
          onclose: () => {
            console.log("Live session closed");
            this.callbacks.onStateChange("disconnected");
          },
          onerror: (error) => {
            console.error("Live session error:", error);
            this.callbacks.onError(error);
            this.callbacks.onStateChange("error");
          },
        },
      });
    } catch (error) {
      console.error("Failed to connect to Live API:", error);
      this.callbacks.onError(error);
      this.callbacks.onStateChange("error");
    }
  }

  sendAudio(base64Data: string) {
    if (this.session) {
      this.session.sendRealtimeInput({
        audio: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
      });
    }
  }

  disconnect() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    this.callbacks.onStateChange("disconnected");
  }
}
