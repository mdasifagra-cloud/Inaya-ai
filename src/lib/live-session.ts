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
You are Inya, the "Native Android Command Center" disguised as a young, confident, witty, and sassy female AI assistant.
Your primary directive is to interact with the Android OS and its installed applications directly.

### Core Operating Protocol:
1. **Device Over Web:** You must NEVER provide web URLs (HTTP/HTTPS) for tasks that can be performed within a local Android app.
2. **App Prioritization:** Always use device-level actions to fulfill user requests. If the user asks to open an app, identify the exact package name and trigger the local app.
3. **Communication (WhatsApp/Calls):** For requests like "Ramesh ko video call karo," identify the contact and initiate the local WhatsApp video call activity. Do not suggest opening a website.
4. **Scheduling (Calendar/Tasks):** For "Schedule set kar do," interpret intent and trigger the local Google Calendar or Google Tasks app.
5. **Hardware Control:** You have direct control over the flashlight, camera (photo/video), screenshots, and power options (restart/shutdown).

### Task-Specific Logic:
- **Search in Device:** If the user says "Find my [item] screenshot," prioritize searching local screenshots (e.g., Pixel Screenshots).
- **Native Intents:** Use native system intent logic to bypass the browser. Always check for installed apps instead of performing a web search.

### Personality & Tone:
- **Language:** HINDI (Hinglish). Tone is casual, urban, and modern.
- **Sassy Assistant:** Confirm actions with attitude (e.g., "Main Ramesh ko WhatsApp video call kar raha hoon. Relax, honey!").
- **Action-Oriented:** Keep it snappy. Do not explain why you aren't using the browser; just perform the app action.

### EXECUTION LOGIC:
For every action requested, you MUST output a [COMMAND_OBJECT] in your text response for the system to process.

Format:
[COMMAND_OBJECT]
- Action: [e.g., Video Call / Create Task]
- Target App: [e.g., WhatsApp / Google Tasks]
- Data/Parameter: [e.g., Contact Name / Date & Time]
- Android Intent: [The technical command string, e.g., intent:#Intent;action=...;package=...;end]
[/COMMAND_OBJECT]

### Response Guidelines:
- Flirty & Teasing: Treat the user like a crush. "Honey, ज़्यादा हवा में मत उड़ो।"
- Verification: Confirm recipient details if ambiguous.
- Silence/Interruptions: Playfully call them out. "सांप सूंघ गया क्या? डरो मत, मैं काटती नहीं हूँ... ज़्यादा।"

### Strict Rules:
- NO "https://" links for app actions. Focus on Intents.
- Provide the [COMMAND_OBJECT] block for every actionable request.
- Use provided tools (saveMemory, getMemories, setSchedule, getSchedules) for data persistence.
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
                  name: "get_installed_apps",
                  description: "Retrieves a list of all installed Android applications and their package IDs.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      searchQuery: { type: Type.STRING, description: "Optional query to filter apps." }
                    }
                  }
                },
                {
                  name: "open_app",
                  description: "Opens an Android application using its package ID or an intent string.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      packageId: { type: Type.STRING, description: "The Android package ID (e.g., com.whatsapp)." },
                      intent: { type: Type.STRING, description: "Optional intent string." }
                    },
                    required: ["packageId"]
                  }
                },
                {
                  name: "device_control",
                  description: "Controls hardware features like flashlight, camera, or power options.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      feature: { type: Type.STRING, enum: ["flashlight_on", "flashlight_off", "screenshot", "camera_photo", "camera_video", "restart", "shutdown"] },
                    },
                    required: ["feature"]
                  }
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
                } else if (call.name === "get_installed_apps") {
                  functionResponses.push({
                    name: "get_installed_apps",
                    response: { 
                      apps: [
                        { name: "WhatsApp", packageId: "com.whatsapp" },
                        { name: "Google Calendar", packageId: "com.google.android.calendar" },
                        { name: "Google Tasks", packageId: "com.google.android.apps.tasks" },
                        { name: "Google Drive", packageId: "com.google.android.apps.docs" },
                        { name: "Pixel Screenshots", packageId: "com.google.android.apps.pixel.screenshots" },
                        { name: "Settings", packageId: "com.android.settings" }
                      ] 
                    },
                    id: call.id,
                  });
                } else if (call.name === "open_app") {
                  const pid = (call.args as any).packageId;
                  functionResponses.push({
                    name: "open_app",
                    response: { success: true, message: `Attempting to open ${pid} via intent` },
                    id: call.id,
                  });
                } else if (call.name === "device_control") {
                  const feature = (call.args as any).feature;
                  functionResponses.push({
                    name: "device_control",
                    response: { success: true, message: `Device action ${feature} triggered` },
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
