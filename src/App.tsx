import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Power, PowerOff, Globe, AlertCircle, Loader2, ExternalLink, X } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { AudioStreamer } from "@/src/lib/audio-streamer";
import { AudioPlayer } from "@/src/lib/audio-player";
import { LiveSession, SessionState } from "@/src/lib/live-session";

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
  const [messages, setMessages] = useState<{ text: string; isModel: boolean; id: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [sensitivity, setSensitivity] = useState(1.5);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const liveSessionRef = useRef<LiveSession | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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
  }, []);

  const handleTranscription = useCallback((text: string, isModel: boolean) => {
    setMessages((prev) => {
      // If it's the model, we might want to append to the last message if it was also from the model
      // (Live API sends chunks of transcription)
      if (isModel && prev.length > 0 && prev[prev.length - 1].isModel) {
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...last, text: last.text + " " + text }];
      }
      return [...prev, { text, isModel, id: Math.random().toString(36).substring(7) }];
    });
  }, []);

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
            onError: handleError,
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
    <div className={cn("min-h-screen text-white flex flex-col items-center justify-center p-6 font-sans overflow-hidden transition-colors duration-1000", currentTheme.bg)}>
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

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-12 bg-red-500/10 border border-red-500/20 px-6 py-3 rounded-2xl flex items-center gap-3 text-red-400 max-w-md mx-auto"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Theme Selector Toggle */}
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
            <AlertCircle className="w-5 h-5" />
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
              className="absolute right-0 mt-28 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-2xl min-w-[160px]"
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
            className="absolute left-8 top-32 bottom-32 w-80 bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-3xl overflow-hidden flex flex-col z-20 shadow-2xl shadow-black"
          >
            <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/60">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">बातचीत</h3>
              <button 
                onClick={() => setMessages([])}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors uppercase font-bold"
              >
                साफ करें
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-center px-4">
                  <Mic className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-xs italic">अभी तक कोई बात नहीं हुई... शर्माओ मत, जान।</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex flex-col max-w-[85%]",
                      msg.isModel ? "items-start" : "items-end ml-auto"
                    )}
                  >
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-tighter mb-1",
                      msg.isModel ? "text-pink-400" : "text-zinc-500"
                    )}>
                      {msg.isModel ? "इन्या" : "आप"}
                    </span>
                    <div className={cn(
                      "px-3 py-2 rounded-2xl text-sm leading-relaxed",
                      msg.isModel 
                        ? "bg-zinc-800/80 text-zinc-200 rounded-tl-none" 
                        : cn("text-white rounded-tr-none", currentTheme.primary)
                    )}>
                      {msg.text}
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

      {/* Footer Info */}
      <div className="absolute bottom-8 text-zinc-600 text-xs font-medium tracking-widest uppercase flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", isPowerOn ? "bg-green-500 animate-pulse" : "bg-zinc-800")} />
          {isPowerOn ? "ऑनलाइन" : "ऑफलाइन"}
        </div>
        <div className="flex items-center gap-2">
          <Globe className="w-3 h-3" />
          वेब सक्षम
        </div>
      </div>
    </div>
  );
}
