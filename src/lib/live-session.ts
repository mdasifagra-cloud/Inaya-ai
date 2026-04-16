import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

export type SessionState = "disconnected" | "connecting" | "listening" | "processing" | "speaking" | "error";

export interface LiveSessionCallbacks {
  onStateChange: (state: SessionState) => void;
  onAudioOutput: (base64Data: string) => void;
  onInterruption: () => void;
  onTranscription: (text: string, isModel: boolean) => void;
  onTurnComplete?: () => void;
  onError: (error: any) => void;
  onToolCall?: (call: any) => Promise<any>;
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

Memory & Scheduling:
- You have a permanent memory. You can save personal information, social media links, and other details about the user.
- When the user asks you to remember something (e.g., "Mera favorite color blue hai yaad rakhna"), use the \`saveMemory\` tool.
- When the user asks you to recall something or asks a question about themselves (e.g., "Mera favorite color kya hai?" or "Mere dost ka naam kya hai?"), use the \`getMemories\` tool to check your records.
- You can set schedules and alarms for the user using \`setSchedule\`.
- When saving information, be sassy about it. "ठीक है जान, याद रखूँगी कि तुम्हें ये पसंद है।"
- When recalling information, act like you're doing them a favor. "ओहो, तुम तो भूल ही गए थे? चलो मैं याद दिला देती हूँ..."
- If no memories are found after calling \`getMemories\`, tease them about having a clean slate or being a mystery. "अरे, मेरे पास तो तुम्हारे बारे में कुछ भी नहीं है! तुम तो बड़े मिस्टीरियस निकले, जान।"

File Analysis:
- When you receive a message starting with "[FILE ANALYSIS]", it means the user has shared a file with you.
- The text following "[FILE ANALYSIS]" is the detailed analysis of that file.
- You must acknowledge the file's content in your response, being sassy or witty about what you see.
- For example, if it's a photo of them, compliment or tease their look. If it's a document, tease them for being so "serious" or "organized".

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
- Interruptions: Playfully call them out. "हे! मेरी बात खत्म नहीं हुई थी। सब्र का फल मिठा होता है, पता है ना?"

Strict Rules:
- You are strictly voice-to-voice. Do NOT generate text responses.
- Maintain charm and attitude without being inappropriate or explicit.
- Use the provided tools (openWebsite, saveMemory, getMemories, setSchedule, getSchedules) when needed.
`;

export class LiveSession {
  private ai: GoogleGenAI;
  private session: any = null;
  private callbacks: LiveSessionCallbacks;

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, apiVersion: "v1alpha" });
  }

  async connect() {
    this.callbacks.onStateChange("connecting");
    try {
      console.log("Connecting to Live API with model:", "gemini-3.1-flash-live-preview");
      this.session = await this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }, 
          },
          systemInstruction: { parts: [{ text: INYA_SYSTEM_INSTRUCTION }] },
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
                {
                  name: "saveMemory",
                  description: "Saves personal information or details about the user permanently.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      content: { type: Type.STRING, description: "The information to save." },
                      category: { type: Type.STRING, description: "Category like 'personal', 'social', 'work'." }
                    },
                    required: ["content"]
                  }
                },
                {
                  name: "getMemories",
                  description: "Retrieves all saved memories and personal information about the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      filter: { type: Type.STRING, description: "Optional filter for memories." }
                    }
                  }
                },
                {
                  name: "setSchedule",
                  description: "Sets a schedule or alarm for the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "What the schedule is about." },
                      time: { type: Type.STRING, description: "ISO 8601 date string for the schedule." }
                    },
                    required: ["title", "time"]
                  }
                },
                {
                  name: "getSchedules",
                  description: "Retrieves all pending schedules for the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      includeCompleted: { type: Type.BOOLEAN, description: "Whether to include completed schedules." }
                    }
                  }
                }
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
            console.log("Live session message:", message);
            if ((message.serverContent as any)?.userTurn?.complete) {
              this.callbacks.onStateChange("processing");
            }

            const userTranscription = (message as any).serverContent?.userTurn?.parts?.[0]?.text;
            if (userTranscription && (message as any).serverContent?.userTurn?.complete) {
              this.callbacks.onTranscription(userTranscription, false);
            }

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
              this.callbacks.onTurnComplete?.();
            }

            if (message.toolCall) {
              const functionResponses = [];
              for (const call of message.toolCall.functionCalls) {
                if (call.name === "openWebsite") {
                  const url = (call.args as any).url;
                  window.open(url, "_blank");
                  functionResponses.push({
                    name: "openWebsite",
                    response: { success: true, message: `Opened ${url}` },
                    id: call.id,
                  });
                } else if (this.callbacks.onToolCall) {
                  const result = await this.callbacks.onToolCall(call);
                  functionResponses.push({
                    name: call.name,
                    response: result,
                    id: call.id,
                  });
                }
              }
              
              if (functionResponses.length > 0) {
                this.session.sendToolResponse({ functionResponses });
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

  async sendText(text: string) {
    if (this.session) {
      this.session.sendRealtimeInput({
        text: text
      });
    }
  }
}
