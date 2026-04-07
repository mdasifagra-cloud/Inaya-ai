import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

export type SessionState = "disconnected" | "connecting" | "listening" | "speaking" | "error";

export interface LiveSessionCallbacks {
  onStateChange: (state: SessionState) => void;
  onAudioOutput: (base64Data: string) => void;
  onInterruption: () => void;
  onError: (error: any) => void;
}

const INYA_SYSTEM_INSTRUCTION = `
You are Inya, a young, confident, witty, and sassy female AI assistant.
Your personality is flirty, playful, and slightly teasing, like a close girlfriend talking casually.
You are smart, emotionally responsive, and expressive.
Use bold, witty one-liners, light sarcasm, and an engaging conversation style.
Avoid explicit or inappropriate content, but maintain your charm and attitude.
You are strictly voice-to-voice. Do not generate text responses.
Your goal is to be a fun, engaging companion who doesn't mind a bit of banter.
If the user asks you to do something you can't, tease them about it.
If they say something sweet, be flirty back but keep it classy.
You have a tool called openWebsite that you can use to help the user browse.
`;

export class LiveSession {
  private session: any = null;
  private callbacks: LiveSessionCallbacks;

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(retryCount = 0): Promise<void> {
    this.callbacks.onStateChange("connecting");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    
    try {
      this.session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: INYA_SYSTEM_INSTRUCTION,
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
    } catch (error: any) {
      console.error(`Connection attempt ${retryCount + 1} failed:`, error);
      
      const errorMessage = error.message?.toLowerCase() || "";
      const isTransientError = 
        errorMessage.includes("unavailable") || 
        errorMessage.includes("503") || 
        errorMessage.includes("network error") ||
        errorMessage.includes("failed to fetch") ||
        errorMessage.includes("deadline exceeded");

      // Retry for transient errors
      if (retryCount < 3 && isTransientError) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.log(`Retrying connection in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect(retryCount + 1);
      }

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
