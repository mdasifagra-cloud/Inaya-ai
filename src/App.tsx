import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Power, PowerOff, Globe, AlertCircle, Loader2, ExternalLink, X, LogOut, User as UserIcon, LayoutDashboard, MessageSquare, Settings, Users, BarChart3, ShieldCheck, Clock, Calendar, Search, Filter, Smile, Send, Paperclip, FileText, Image as ImageIcon } from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";
import { cn } from "@/src/lib/utils";
import { AudioStreamer } from "@/src/lib/audio-streamer";
import { AudioPlayer } from "@/src/lib/audio-player";
import { LiveSession, SessionState } from "@/src/lib/live-session";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  User,
  doc,
  setDoc,
  getDoc,
  getDocs,
  limit,
  Timestamp
} from "@/src/lib/firebase";

type Theme = {
  name: string;
  id: string;
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  titleGradient: string;
};

const THEMES: Theme[] = [
  {
    name: "Cyberpunk",
    id: "cyberpunk",
    primary: "bg-pink-500",
    secondary: "bg-purple-500",
    accent: "bg-blue-500",
    bg: "bg-[#050505]",
    titleGradient: "from-pink-400 to-purple-500"
  },
  {
    name: "Midnight",
    id: "midnight",
    primary: "bg-blue-600",
    secondary: "bg-indigo-600",
    accent: "bg-cyan-500",
    bg: "bg-[#020617]",
    titleGradient: "from-blue-400 to-indigo-500"
  },
  {
    name: "Rose",
    id: "rose",
    primary: "bg-rose-500",
    secondary: "bg-orange-500",
    accent: "bg-pink-400",
    bg: "bg-[#0c0a09]",
    titleGradient: "from-rose-400 to-orange-500"
  },
  {
    name: "Ocean",
    id: "ocean",
    primary: "bg-teal-500",
    secondary: "bg-emerald-500",
    accent: "bg-sky-400",
    bg: "bg-[#020617]",
    titleGradient: "from-teal-400 to-emerald-500"
  },
  {
    name: "Sunset",
    id: "sunset",
    primary: "bg-orange-500",
    secondary: "bg-amber-500",
    accent: "bg-red-500",
    bg: "bg-[#0c0a09]",
    titleGradient: "from-orange-400 to-red-500"
  },
  {
    name: "Forest",
    id: "forest",
    primary: "bg-green-600",
    secondary: "bg-lime-500",
    accent: "bg-emerald-400",
    bg: "bg-[#050505]",
    titleGradient: "from-green-400 to-emerald-500"
  },
  {
    name: "Lavender",
    id: "lavender",
    primary: "bg-purple-400",
    secondary: "bg-violet-500",
    accent: "bg-fuchsia-400",
    bg: "bg-[#0c0a09]",
    titleGradient: "from-purple-300 to-fuchsia-500"
  },
  {
    name: "Gold",
    id: "gold",
    primary: "bg-yellow-500",
    secondary: "bg-amber-400",
    accent: "bg-orange-400",
    bg: "bg-[#050505]",
    titleGradient: "from-yellow-400 to-orange-500"
  }
];

export default function App() {
  const [state, setState] = useState<SessionState>("disconnected");
  const [isPowerOn, setIsPowerOn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<Theme>(THEMES[0]);
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [messages, setMessages] = useState<{ text: string; isModel: boolean; id: string; reactions?: { emoji: string; count: number; users: string[] }[] }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "user" | "model">("all");
  const [sensitivity, setSensitivity] = useState(1.5);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "user-dashboard" | "admin-dashboard">("chat");
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [systemStats, setSystemStats] = useState<any>({ totalUsers: 0, totalMessages: 0 });
  const [memories, setMemories] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [textInput, setTextInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const liveSessionRef = useRef<LiveSession | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const modelResponseBufferRef = useRef<string>("");

  const scrollToBottom = () => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-reconnect logic for Live Session
  useEffect(() => {
    let timeoutId: any;
    if (isPowerOn && state === "disconnected") {
      // If power is on but session disconnected (e.g. timeout), try to reconnect
      if (!liveSessionRef.current) {
        liveSessionRef.current = new LiveSession({
          onStateChange: setState,
          onAudioOutput: handleAudioOutput,
          onInterruption: handleInterruption,
          onTranscription: handleTranscription,
          onTurnComplete: handleTurnComplete,
          onError: handleError,
          onToolCall: handleToolCall
        });
      }
      timeoutId = setTimeout(() => {
        console.log("Attempting auto-reconnect...");
        liveSessionRef.current?.connect().catch(err => {
          console.error("Auto-reconnect failed:", err);
        });
      }, 2000);
    }
    return () => clearTimeout(timeoutId);
  }, [isPowerOn, state]);

  useEffect(() => {
    if (showHistory) {
      scrollToBottom();
    }
  }, [messages, showHistory]);

  const handleAudioData = useCallback((base64Data: string) => {
    if (liveSessionRef.current && !isMuted) {
      liveSessionRef.current.sendAudio(base64Data);
    }
  }, [isMuted]);

  const handleAudioOutput = useCallback((base64Data: string) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playChunk(base64Data);
    }
  }, []);

  const handleInterruption = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.clearQueue();
    }
    // If interrupted, save what the model said so far
    if (modelResponseBufferRef.current) {
      saveMessage(modelResponseBufferRef.current + " [Interrupted]", true);
      modelResponseBufferRef.current = "";
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Sync user profile
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          const newProfile = {
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            role: currentUser.email === "mdasifagra@gmail.com" ? "admin" : "user",
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp()
          };
          await setDoc(userRef, newProfile);
          setUserProfile(newProfile);
        } else {
          await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
          setUserProfile(userSnap.data());
        }
      } else {
        setUserProfile(null);
      }
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Admin: Fetch all users and stats
  useEffect(() => {
    if (userProfile?.role === "admin" && activeView === "admin-dashboard") {
      const fetchAdminData = async () => {
        const usersSnap = await getDocs(collection(db, "users"));
        const usersList = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllUsers(usersList);

        const messagesSnap = await getDocs(collection(db, "conversations"));
        setSystemStats({
          totalUsers: usersList.length,
          totalMessages: messagesSnap.size
        });
      };
      fetchAdminData();
    }
  }, [userProfile, activeView]);

  useEffect(() => {
    if (!user || !isAuthReady) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, "conversations"),
      where("userId", "==", user.uid),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        text: doc.data().text,
        isModel: doc.data().isModel,
        reactions: doc.data().reactions || []
      }));
      setMessages(loadedMessages);
    }, (error) => {
      console.error("Firestore Error: ", error);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Fetch memories and schedules for dashboard
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const memQuery = query(collection(db, "memories"), where("userId", "==", user.uid), orderBy("timestamp", "desc"));
    const schedQuery = query(collection(db, "schedules"), where("userId", "==", user.uid), orderBy("time", "asc"));

    const unsubMem = onSnapshot(memQuery, (snap) => {
      setMemories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubSched = onSnapshot(schedQuery, (snap) => {
      setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubMem();
      unsubSched();
    };
  }, [user, isAuthReady]);

  const handleToolCall = useCallback(async (call: any) => {
    if (!user) return { error: "User not authenticated" };

    console.log("Tool call received:", call.name, call.args);

    try {
      switch (call.name) {
        case "saveMemory": {
          const { content, category } = call.args;
          await addDoc(collection(db, "memories"), {
            userId: user.uid,
            content,
            category: category || "general",
            timestamp: serverTimestamp()
          });
          return { success: true, message: "Memory saved" };
        }
        case "getMemories": {
          const q = query(collection(db, "memories"), where("userId", "==", user.uid), orderBy("timestamp", "desc"), limit(50));
          const snap = await getDocs(q);
          const memories = snap.docs.map(d => {
            const data = d.data();
            return {
              ...data,
              timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : data.timestamp
            };
          });
          console.log("Retrieved memories:", memories);
          return memories;
        }
        case "setSchedule": {
          const { title, time } = call.args;
          await addDoc(collection(db, "schedules"), {
            userId: user.uid,
            title,
            time: Timestamp.fromDate(new Date(time)),
            status: "pending",
            notified: false,
            timestamp: serverTimestamp()
          });
          return { success: true, message: "Schedule set" };
        }
        case "getSchedules": {
          const q = query(collection(db, "schedules"), where("userId", "==", user.uid), where("status", "==", "pending"), orderBy("time", "asc"));
          const snap = await getDocs(q);
          const schedules = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              time: data.time instanceof Timestamp ? data.time.toDate().toISOString() : data.time,
              timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate().toISOString() : data.timestamp
            };
          });
          console.log("Retrieved schedules:", schedules);
          return schedules;
        }
        default:
          return { error: "Unknown tool" };
      }
    } catch (err: any) {
      console.error(`Tool call error (${call.name}):`, err);
      return { error: err.message || "Internal tool error" };
    }
  }, [user]);

  // Schedule Checker
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      const now = new Date();
      const q = query(
        collection(db, "schedules"),
        where("userId", "==", user.uid),
        where("status", "==", "pending"),
        where("notified", "==", false)
      );
      
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const schedule = d.data();
        const scheduleTime = schedule.time.toDate();
        
        if (now >= scheduleTime) {
          const message = `Honey, it's time for: ${schedule.title}. You scheduled this for ${scheduleTime.toLocaleTimeString()}. Chalo ab taiyari karo aur nikal jao!`;
          
          if (liveSessionRef.current && isPowerOn) {
            liveSessionRef.current.sendText(message);
          } else {
            setError(`Schedule Alert: ${schedule.title}`);
          }
          
          await setDoc(doc(db, "schedules", d.id), { notified: true, status: "completed" }, { merge: true });
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [user, isPowerOn]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError("Login failed: " + err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      if (isPowerOn) togglePower();
    } catch (err: any) {
      setError("Logout failed: " + err.message);
    }
  };

  const saveMessage = async (text: string, isModel: boolean) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "conversations"), {
        userId: user.uid,
        text,
        isModel,
        timestamp: serverTimestamp()
      });
    } catch (err: any) {
      console.error("Error saving message:", err);
    }
  };

  const handleTranscription = useCallback((text: string, isModel: boolean) => {
    if (isModel) {
      modelResponseBufferRef.current += text;
    } else {
      saveMessage(text, false);
    }
  }, [user]);

  const handleTurnComplete = useCallback(() => {
    if (modelResponseBufferRef.current) {
      saveMessage(modelResponseBufferRef.current, true);
      modelResponseBufferRef.current = "";
    }
  }, [user]);

  const handleError = useCallback((err: any) => {
    setError(err.message || "An unexpected error occurred.");
    setIsPowerOn(false);
  }, []);

  const togglePower = async () => {
    if (isPowerOn) {
      // Disconnect
      liveSessionRef.current?.disconnect();
      audioStreamerRef.current?.stop();
      audioPlayerRef.current?.stop();
      setIsPowerOn(false);
      setIsMuted(false);
    } else {
      // Connect
      setError(null);
      setIsPowerOn(true);
      
      try {
        if (!audioPlayerRef.current) {
          audioPlayerRef.current = new AudioPlayer();
        }
        await audioPlayerRef.current.start();

        if (!liveSessionRef.current) {
          liveSessionRef.current = new LiveSession({
            onStateChange: setState,
            onAudioOutput: handleAudioOutput,
            onInterruption: handleInterruption,
            onTranscription: handleTranscription,
            onTurnComplete: handleTurnComplete,
            onError: handleError,
            onToolCall: handleToolCall
          });
        }
        await liveSessionRef.current.connect();

        if (!audioStreamerRef.current) {
          audioStreamerRef.current = new AudioStreamer(handleAudioData);
        }
        audioStreamerRef.current.setGain(sensitivity);
        await audioStreamerRef.current.start();
      } catch (err: any) {
        handleError(err);
      }
    }
  };

  useEffect(() => {
    return () => {
      liveSessionRef.current?.disconnect();
      audioStreamerRef.current?.stop();
      audioPlayerRef.current?.stop();
    };
  }, []);

  const handleOpenWebsite = () => {
    if (urlInput) {
      let url = urlInput;
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }
      window.open(url, "_blank");
      setShowUrlModal(false);
      setUrlInput("");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSendMessage = async () => {
    if (!textInput && !selectedFile) return;
    if (!user) return;

    let finalMessage = textInput;

    if (selectedFile) {
      setIsAnalyzing(true);
      try {
        const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

        const reader = new FileReader();
        const fileDataPromise = new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(selectedFile);
        });

        const base64Data = await fileDataPromise;
        
        const prompt = `Analyze this file and provide a concise but detailed summary in Hindi. 
        If it's an image, describe the visual elements, mood, and any text. 
        If it's a document, summarize the key points.
        Format the output as: [FILE ANALYSIS] <Your detailed summary here>`;

        const result = await client.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { data: base64Data, mimeType: selectedFile.type } }
              ]
            }
          ]
        });

        const analysis = result.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis available.";
        finalMessage = `${analysis}\n\n${textInput}`.trim();
        setSelectedFile(null);
      } catch (err) {
        console.error("File analysis failed:", err);
        setError("File analysis failed. Please try again.");
      } finally {
        setIsAnalyzing(false);
      }
    }

    if (liveSessionRef.current && isPowerOn) {
      liveSessionRef.current.sendText(finalMessage);
      saveMessage(textInput || "Shared a file", false);
      setTextInput("");
    } else {
      setError("Please turn on Inya to send messages.");
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const reactions = [...(msg.reactions || [])];
    const existingIndex = reactions.findIndex(r => r.emoji === emoji);
    
    let newReactions;
    if (existingIndex > -1) {
      const existing = reactions[existingIndex];
      if (existing.users.includes(user.uid)) {
        // Remove reaction
        const updatedUsers = existing.users.filter(u => u !== user.uid);
        if (updatedUsers.length === 0) {
          newReactions = reactions.filter((_, i) => i !== existingIndex);
        } else {
          newReactions = reactions.map((r, i) => 
            i === existingIndex 
              ? { ...r, count: r.count - 1, users: updatedUsers }
              : r
          );
        }
      } else {
        // Add to existing
        newReactions = reactions.map((r, i) => 
          i === existingIndex 
            ? { ...r, count: r.count + 1, users: [...r.users, user.uid] }
            : r
        );
      }
    } else {
      // New reaction
      newReactions = [...reactions, { emoji, count: 1, users: [user.uid] }];
    }

    try {
      await setDoc(doc(db, "conversations", messageId), { reactions: newReactions }, { merge: true });
    } catch (err) {
      console.error("Error updating reaction:", err);
    }
  };

  const filteredMessages = messages.filter(msg => {
    const matchesSearch = msg.text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === "all" || 
                         (filterType === "user" && !msg.isModel) || 
                         (filterType === "model" && msg.isModel);
    return matchesSearch && matchesFilter;
  });
  const getStatusText = () => {
    switch (state) {
      case "disconnected": return "तुम्हें छेड़ने के लिए तैयार हूँ...";
      case "connecting": return "तुम्हारे लिए तैयार हो रही हूँ...";
      case "listening": return "मैं सुन रही हूँ, जान...";
      case "processing": return "जवाब सोच रही हूँ...";
      case "speaking": return "मुझे सुनो...";
      case "error": return "कुछ गलत हो गया, डार्लिंग।";
      default: return "";
    }
  };

  return (
    <div className={cn("min-h-screen text-white flex font-sans overflow-hidden transition-colors duration-1000", currentTheme.bg)}>
      {/* Sidebar Navigation */}
      <AnimatePresence>
        {user && (
          <motion.aside
            initial={{ x: -80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="w-20 bg-zinc-900/40 backdrop-blur-xl border-r border-zinc-800/50 flex flex-col items-center py-8 gap-8 z-50"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <span className="font-black text-xl">I</span>
            </div>

            <div className="flex flex-col gap-4 flex-1">
              <NavButton 
                active={activeView === "chat"} 
                onClick={() => setActiveView("chat")} 
                icon={<MessageSquare className="w-5 h-5" />} 
                label="चैट"
              />
              <NavButton 
                active={activeView === "user-dashboard"} 
                onClick={() => setActiveView("user-dashboard")} 
                icon={<LayoutDashboard className="w-5 h-5" />} 
                label="डैशबोर्ड"
              />
              {userProfile?.role === "admin" && (
                <NavButton 
                  active={activeView === "admin-dashboard"} 
                  onClick={() => setActiveView("admin-dashboard")} 
                  icon={<ShieldCheck className="w-5 h-5" />} 
                  label="एडमिन"
                />
              )}
            </div>

            <button onClick={handleLogout} className="p-3 rounded-2xl text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-all">
              <LogOut className="w-5 h-5" />
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 relative flex flex-col items-center justify-center p-6">
        {/* Background Glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] transition-all duration-1000 opacity-20",
            state === "listening" ? currentTheme.primary + " opacity-30" : 
            state === "speaking" ? currentTheme.secondary + " opacity-40" : 
            state === "processing" ? currentTheme.accent + " opacity-20" :
            state === "connecting" ? "bg-blue-500 opacity-30" : "bg-zinc-800"
          )} />
        </div>

        {activeView === "chat" ? (
          <>
            {/* Header */}
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-12 text-center z-10"
            >
              <h1 className={cn("text-5xl font-bold tracking-tighter bg-clip-text text-transparent mb-2 transition-all duration-500 bg-gradient-to-r", 
                currentTheme.titleGradient
              )}>
                INYA
              </h1>
              <p className="text-zinc-500 text-sm font-medium tracking-widest uppercase">
                आपकी सजीली AI साथी
              </p>
            </motion.div>

            {/* Main Interaction Area */}
            <div className="relative flex flex-col items-center justify-center gap-12 z-10">
              {/* Status Indicator */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={state}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  className="text-xl font-medium text-zinc-300 h-8 text-center"
                >
                  {getStatusText()}
                </motion.div>
              </AnimatePresence>

              {/* Central Button */}
              <div className="relative">
                {/* Typing Indicator */}
                <AnimatePresence>
                  {state === "processing" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute -top-16 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-zinc-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-zinc-800"
                    >
                      <span className="text-xs font-medium text-zinc-400 mr-1">इन्या सोच रही है</span>
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="w-1.5 h-1.5 bg-pink-500 rounded-full"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                        className="w-1.5 h-1.5 bg-pink-500 rounded-full"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                        className="w-1.5 h-1.5 bg-pink-500 rounded-full"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Animated Rings */}
                <AnimatePresence>
                  {(state === "listening" || state === "speaking") && (
                    <>
                      <motion.div
                        initial={{ scale: 1, opacity: 0.5 }}
                        animate={{ scale: 1.8, opacity: 0 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                        className={cn(
                          "absolute inset-0 rounded-full border-2",
                          state === "listening" ? currentTheme.primary.replace('bg-', 'border-') : currentTheme.secondary.replace('bg-', 'border-')
                        )}
                      />
                      <motion.div
                        initial={{ scale: 1, opacity: 0.3 }}
                        animate={{ scale: 2.2, opacity: 0 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                        className={cn(
                          "absolute inset-0 rounded-full border-2",
                          state === "listening" ? currentTheme.primary.replace('bg-', 'border-').replace('-500', '-400') : currentTheme.secondary.replace('bg-', 'border-').replace('-500', '-400')
                        )}
                      />
                    </>
                  )}
                </AnimatePresence>

                {/* Main Button */}
                {!user ? (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleLogin}
                    className={cn(
                      "relative w-40 h-40 rounded-full flex flex-col items-center justify-center transition-all duration-500 shadow-2xl bg-zinc-900 border-4 border-zinc-800"
                    )}
                  >
                    <UserIcon className="w-12 h-12 text-zinc-500 mb-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">लॉगिन करें</span>
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={togglePower}
                    className={cn(
                      "relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl",
                      isPowerOn 
                        ? cn("bg-zinc-900 border-4 shadow-2xl", currentTheme.primary.replace('bg-', 'border-').replace('-500', '-500/50'), currentTheme.primary.replace('bg-', 'shadow-').replace('-500', '-500/20')) 
                        : "bg-zinc-800 border-4 border-zinc-700 shadow-black"
                    )}
                  >
                    {state === "connecting" ? (
                      <Loader2 className="w-16 h-16 text-blue-400 animate-spin" />
                    ) : isPowerOn ? (
                      <div className="flex flex-col items-center gap-2">
                        {state === "speaking" ? (
                          <motion.div 
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                          >
                            {isMuted ? (
                              <MicOff className="w-16 h-16 text-zinc-500" />
                            ) : (
                              <Mic className={cn("w-16 h-16", currentTheme.secondary.replace('bg-', 'text-').replace('-500', '-400'))} />
                            )}
                          </motion.div>
                        ) : (
                          isMuted ? (
                            <MicOff className="w-16 h-16 text-zinc-500" />
                          ) : (
                            <Mic className={cn("w-16 h-16", currentTheme.primary.replace('bg-', 'text-').replace('-500', '-400'))} />
                          )
                        )}
                      </div>
                    ) : (
                      <Power className="w-16 h-16 text-zinc-500" />
                    )}

                    {/* Inner Glow */}
                    <div className={cn(
                      "absolute inset-2 rounded-full blur-md transition-opacity duration-500",
                      isPowerOn ? cn("opacity-40", currentTheme.primary) : "opacity-0"
                    )} />
                  </motion.button>
                )}

                {/* Mute Toggle Button */}
                <AnimatePresence>
                  {isPowerOn && state !== "connecting" && (
                    <motion.button
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setIsMuted(!isMuted)}
                      className={cn(
                        "absolute -right-20 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 border shadow-lg",
                        isMuted 
                          ? "bg-red-500/20 border-red-500/50 text-red-500" 
                          : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-pink-400"
                      )}
                    >
                      {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Waveform Visualization (Simulated for UI) */}
              <div className="flex items-center gap-1 h-12">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      height: state === "speaking" ? [12, 48, 12] : 
                              state === "listening" ? [12, 24, 12] : 12
                    }}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      delay: i * 0.05,
                      ease: "easeInOut"
                    }}
                    className={cn(
                      "w-1.5 rounded-full",
                      state === "speaking" ? currentTheme.secondary : 
                      state === "listening" ? currentTheme.primary : "bg-zinc-800"
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Chat Input Bar */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 z-20">
              <div className="relative group">
                {/* File Preview */}
                <AnimatePresence>
                  {selectedFile && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      className="absolute bottom-full mb-4 left-0 bg-zinc-900 border border-zinc-800 p-3 rounded-2xl flex items-center gap-3 shadow-2xl"
                    >
                      <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                        {selectedFile.type.startsWith('image/') ? (
                          <ImageIcon className="w-5 h-5 text-pink-400" />
                        ) : (
                          <FileText className="w-5 h-5 text-blue-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{selectedFile.name}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-tighter">Ready to share</p>
                      </div>
                      <button 
                        onClick={() => setSelectedFile(null)}
                        className="p-1 hover:bg-white/5 rounded-full transition-colors"
                      >
                        <X className="w-4 h-4 text-zinc-500" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative flex items-center gap-2 bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/50 p-2 rounded-3xl shadow-2xl focus-within:border-pink-500/50 transition-all">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*,.pdf"
                  />
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                  >
                    <Paperclip className="w-5 h-5" />
                  </motion.button>
                  
                  <input
                    type="text"
                    placeholder={isAnalyzing ? "Analyzing file..." : "Inya से कुछ पूछें या फाइल शेयर करें..."}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    disabled={isAnalyzing}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-white placeholder:text-zinc-600 px-2"
                  />

                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleSendMessage}
                    disabled={(!textInput && !selectedFile) || isAnalyzing}
                    className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center transition-all",
                      (textInput || selectedFile) && !isAnalyzing
                        ? cn("text-white shadow-lg", currentTheme.primary)
                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                    )}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </motion.button>
                </div>
              </div>
            </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-12 bg-red-500/10 border border-red-500/20 px-6 py-3 rounded-2xl flex items-center gap-3 text-red-400 max-w-md mx-auto z-50"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Actions */}
        <div className="absolute top-8 right-8 z-20 flex flex-col gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowThemeSelector(!showThemeSelector)}
            className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <Globe className="w-5 h-5" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "w-10 h-10 rounded-full border flex items-center justify-center transition-all duration-300",
              showHistory ? "bg-white text-black border-white" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
            )}
          >
            <motion.div animate={{ rotate: showHistory ? 180 : 0 }}>
              <MessageSquare className="w-5 h-5" />
            </motion.div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowUrlModal(true)}
            className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
          </motion.button>

          <AnimatePresence>
            {showThemeSelector && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-44 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-2xl min-w-[160px]"
              >
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 px-2">Themes</h3>
                <div className="flex flex-col gap-1">
                  {THEMES.map((theme) => (
                    <motion.button
                      key={theme.id}
                      whileHover={{ scale: 1.02, x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setCurrentTheme(theme);
                        setShowThemeSelector(false);
                      }}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-2.5 rounded-xl transition-all group",
                        currentTheme.id === theme.id 
                          ? "bg-white/10 text-white shadow-inner" 
                          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-1.5">
                          <div className={cn("w-3.5 h-3.5 rounded-full border border-zinc-900 z-30", theme.primary)} />
                          <div className={cn("w-3.5 h-3.5 rounded-full border border-zinc-900 z-20", theme.secondary)} />
                          <div className={cn("w-3.5 h-3.5 rounded-full border border-zinc-900 z-10", theme.accent)} />
                        </div>
                        <span className="text-sm font-medium">{theme.name}</span>
                      </div>
                      {currentTheme.id === theme.id && (
                        <motion.div 
                          layoutId="activeTheme"
                          className={cn("w-1.5 h-1.5 rounded-full", theme.primary)} 
                        />
                      )}
                    </motion.button>
                  ))}
                </div>

                <div className="mt-6 px-2">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Sensitivity</h3>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="4" 
                    step="0.1" 
                    value={sensitivity} 
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setSensitivity(val);
                      audioStreamerRef.current?.setGain(val);
                    }}
                    className={cn(
                      "w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-zinc-800",
                      currentTheme.id === "cyberpunk" ? "accent-pink-500" :
                      currentTheme.id === "midnight" ? "accent-blue-500" :
                      currentTheme.id === "rose" ? "accent-rose-500" :
                      "accent-teal-500"
                    )}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-zinc-600 uppercase font-bold tracking-tighter">Low</span>
                    <span className="text-[10px] text-zinc-600 uppercase font-bold tracking-tighter">High</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Conversation History Panel */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, x: -100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="absolute left-24 top-32 bottom-32 w-80 bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-3xl overflow-hidden flex flex-col z-20 shadow-2xl shadow-black"
            >
              <div className="p-4 border-b border-zinc-800/50 flex flex-col gap-3 bg-zinc-900/60">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">बातचीत</h3>
                </div>
                
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <input 
                      type="text"
                      placeholder="खोजें..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-black/20 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-pink-500/50 transition-all"
                    />
                  </div>
                  <div className="flex gap-1">
                    {(["all", "user", "model"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setFilterType(type)}
                        className={cn(
                          "flex-1 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tighter transition-all",
                          filterType === type ? "bg-white text-black" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        {type === "all" ? "सब" : type === "user" ? "आप" : "इन्या"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
                {filteredMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-center px-4">
                    <Mic className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-xs italic">
                      {searchQuery ? "कोई परिणाम नहीं मिला, जान।" : "अभी तक कोई बात नहीं हुई... शर्माओ मत, जान।"}
                    </p>
                  </div>
                ) : (
                  filteredMessages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex flex-col max-w-[90%] group",
                        msg.isModel ? "items-start" : "items-end ml-auto"
                      )}
                    >
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-tighter mb-1",
                        msg.isModel ? "text-pink-400" : "text-zinc-500"
                      )}>
                        {msg.isModel ? "इन्या" : "आप"}
                      </span>
                      <div className="relative">
                        <div className={cn(
                          "px-3 py-2 rounded-2xl text-sm leading-relaxed",
                          msg.isModel 
                            ? "bg-zinc-800/80 text-zinc-200 rounded-tl-none" 
                            : cn("text-white rounded-tr-none", currentTheme.primary)
                        )}>
                          {msg.text}
                        </div>
                        
                        {/* Reaction Button */}
                        <div className={cn(
                          "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1",
                          msg.isModel ? "-right-12" : "-left-12"
                        )}>
                          {["❤️", "🔥", "😂", "😍"].map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => handleReaction(msg.id, emoji)}
                              className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs hover:scale-110 transition-transform"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>

                        {/* Display Reactions */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className={cn(
                            "flex flex-wrap gap-1 mt-1",
                            msg.isModel ? "justify-start" : "justify-end"
                          )}>
                            {msg.reactions.map(r => (
                              <button
                                key={r.emoji}
                                onClick={() => handleReaction(msg.id, r.emoji)}
                                className={cn(
                                  "flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] transition-all",
                                  r.users.includes(user?.uid || "") 
                                    ? "bg-pink-500/20 border-pink-500/50 text-pink-400" 
                                    : "bg-zinc-800 border-zinc-700 text-zinc-400"
                                )}
                              >
                                <span>{r.emoji}</span>
                                <span className="font-bold">{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))
                )}
                <div ref={historyEndRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* URL Input Modal */}
        <AnimatePresence>
          {showUrlModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-8 shadow-2xl"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight">वेबसाइट खोलें</h3>
                  <button 
                    onClick={() => setShowUrlModal(false)}
                    className="text-zinc-500 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <p className="text-zinc-400 text-sm">
                    वह URL दर्ज करें जिसे आप खोलना चाहते हैं। इन्या इसे आपके लिए एक नए टैब में खोल देगी।
                  </p>
                  <div className="relative">
                    <input
                      autoFocus
                      type="text"
                      placeholder="google.com"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleOpenWebsite()}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all"
                    />
                  </div>
                  <button
                    onClick={handleOpenWebsite}
                    disabled={!urlInput}
                    className={cn(
                      "w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-widest transition-all",
                      urlInput 
                        ? cn("text-white shadow-lg", currentTheme.primary) 
                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                    )}
                  >
                    खोलें
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

          </>
        ) : activeView === "user-dashboard" ? (
          <DashboardView 
            user={user} 
            profile={userProfile} 
            messages={messages} 
            memories={memories}
            schedules={schedules}
            theme={currentTheme} 
          />
        ) : (
          <AdminDashboardView 
            users={allUsers} 
            stats={systemStats} 
            theme={currentTheme} 
          />
        )}

        {/* Footer Info */}
        <div className="absolute bottom-8 text-zinc-600 text-xs font-medium tracking-widest uppercase flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", isPowerOn ? "bg-green-500 animate-pulse" : "bg-zinc-800")} />
            {isPowerOn ? "ऑनलाइन" : "ऑफलाइन"}
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-3 h-3" />
            Android असिस्टेंट सक्रिय
          </div>
        </div>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative p-3 rounded-2xl transition-all group",
        active ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
      )}
    >
      {icon}
      <span className="absolute left-full ml-4 px-2 py-1 bg-zinc-800 text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-widest">
        {label}
      </span>
    </button>
  );
}

function DashboardView({ user, profile, messages, memories, schedules, theme }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6 z-10 pb-20"
    >
      {/* Profile Card */}
      <div className="md:col-span-1 space-y-6">
        <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-3xl p-6 flex flex-col items-center text-center">
          <div className="relative mb-4">
            <img src={user?.photoURL || ""} alt={user?.displayName || ""} className="w-24 h-24 rounded-full border-4 border-zinc-800" referrerPolicy="no-referrer" />
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 border-4 border-zinc-900 rounded-full" />
          </div>
          <h2 className="text-xl font-bold mb-1">{user?.displayName}</h2>
          <p className="text-zinc-500 text-xs mb-4">{user?.email}</p>
          <div className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest", theme.primary)}>
            {profile?.role || "USER"}
          </div>
        </div>

        {/* Stats Bento */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard icon={<MessageSquare className="w-4 h-4 text-pink-400" />} label="संदेश" value={messages.length} />
          <StatCard icon={<Clock className="w-4 h-4 text-blue-400" />} label="सक्रिय" value={profile?.lastLogin?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
        </div>
      </div>

      {/* Main Dashboard Content */}
      <div className="md:col-span-2 space-y-6">
        {/* Schedules Section */}
        <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-4 h-4" /> आगामी शेड्यूल
            </h3>
          </div>
          <div className="space-y-3">
            {schedules.filter((s: any) => s.status === "pending").length > 0 ? (
              schedules.filter((s: any) => s.status === "pending").slice(0, 3).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div>
                    <p className="text-sm font-bold">{s.title}</p>
                    <p className="text-[10px] text-zinc-500">{s.time.toDate().toLocaleString()}</p>
                  </div>
                  <div className="px-2 py-1 bg-blue-500/20 text-blue-400 text-[8px] font-bold rounded-full uppercase">Pending</div>
                </div>
              ))
            ) : (
              <p className="text-zinc-600 text-xs italic">कोई आगामी शेड्यूल नहीं है।</p>
            )}
          </div>
        </div>

        {/* Memories Section */}
        <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> मेरी यादें (Memories)
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {memories.length > 0 ? (
              memories.slice(0, 4).map((m: any) => (
                <div key={m.id} className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-sm text-zinc-300">{m.content}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-tighter bg-zinc-800 px-1.5 py-0.5 rounded">{m.category}</span>
                    <span className="text-[8px] text-zinc-600">{m.timestamp.toDate().toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-zinc-600 text-xs italic">इन्या के पास अभी आपकी कोई यादें नहीं हैं।</p>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-3xl p-6">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">हाल की गतिविधि</h3>
          <div className="space-y-3">
            {messages.slice(-3).reverse().map((msg: any) => (
              <div key={msg.id} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", msg.isModel ? "bg-pink-500/20 text-pink-400" : "bg-blue-500/20 text-blue-400")}>
                  {msg.isModel ? "I" : "U"}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm text-zinc-300 truncate">{msg.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AdminDashboardView({ users, stats, theme }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-5xl space-y-6 z-10"
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={<Users className="w-5 h-5 text-blue-400" />} label="कुल उपयोगकर्ता" value={stats.totalUsers} />
        <StatCard icon={<MessageSquare className="w-5 h-5 text-pink-400" />} label="कुल संदेश" value={stats.totalMessages} />
        <StatCard icon={<BarChart3 className="w-5 h-5 text-green-400" />} label="सक्रिय आज" value={users.length} />
        <StatCard icon={<ShieldCheck className="w-5 h-5 text-purple-400" />} label="एडमिन" value={users.filter((u: any) => u.role === "admin").length} />
      </div>

      <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-zinc-800/50">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">उपयोगकर्ता प्रबंधन</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-zinc-500 uppercase tracking-widest bg-white/5">
                <th className="px-6 py-4 font-bold">उपयोगकर्ता</th>
                <th className="px-6 py-4 font-bold">भूमिका</th>
                <th className="px-6 py-4 font-bold">अंतिम लॉगिन</th>
                <th className="px-6 py-4 font-bold">कार्रवाई</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={u.photoURL} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                      <div>
                        <p className="text-sm font-bold">{u.displayName}</p>
                        <p className="text-[10px] text-zinc-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", u.role === "admin" ? "bg-purple-500/20 text-purple-400" : "bg-zinc-800 text-zinc-500")}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-zinc-400">
                    {u.lastLogin?.toDate().toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <button className="text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest">विवरण</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-3xl p-6 flex flex-col gap-2">
      <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center mb-2">
        {icon}
      </div>
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}
