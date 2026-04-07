import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Power, PowerOff, Globe, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { AudioStreamer } from "@/src/lib/audio-streamer";
import { AudioPlayer } from "@/src/lib/audio-player";
import { LiveSession, SessionState } from "@/src/lib/live-session";

export default function App() {
  const [state, setState] = useState<SessionState>("disconnected");
  const [isPowerOn, setIsPowerOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const liveSessionRef = useRef<LiveSession | null>(null);

  const handleAudioData = useCallback((base64Data: string) => {
    if (liveSessionRef.current) {
      liveSessionRef.current.sendAudio(base64Data);
    }
  }, []);

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

  const handleError = useCallback((err: any) => {
    let message = err.message || "An unexpected error occurred.";
    
    if (err.name === "NotAllowedError" || message.toLowerCase().includes("permission denied")) {
      message = "Microphone access denied. Please enable it in your browser settings to talk to Inya.";
    } else if (err.name === "NotFoundError") {
      message = "No microphone found. Please connect one to talk to Inya.";
    }

    setError(message);
    setIsPowerOn(false);
  }, []);

  const togglePower = async () => {
    if (isPowerOn) {
      // Disconnect
      liveSessionRef.current?.disconnect();
      audioStreamerRef.current?.stop();
      audioPlayerRef.current?.stop();
      setIsPowerOn(false);
    } else {
      // Connect
      setError(null);
      setIsPowerOn(true);
      
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Your browser doesn't support microphone access or it's blocked.");
        }

        if (!audioPlayerRef.current) {
          audioPlayerRef.current = new AudioPlayer();
        }
        await audioPlayerRef.current.start();

        if (!liveSessionRef.current) {
          liveSessionRef.current = new LiveSession({
            onStateChange: setState,
            onAudioOutput: handleAudioOutput,
            onInterruption: handleInterruption,
            onError: handleError,
          });
        }
        await liveSessionRef.current.connect();

        if (!audioStreamerRef.current) {
          audioStreamerRef.current = new AudioStreamer(handleAudioData);
        }
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

  const getStatusText = () => {
    switch (state) {
      case "disconnected": return "Ready to tease you...";
      case "connecting": return "Getting ready for you...";
      case "listening": return "I'm listening, babe...";
      case "speaking": return "Listen to me...";
      case "error": return "Something went wrong, darling.";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 font-sans overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] transition-all duration-1000 opacity-20",
          state === "listening" ? "bg-pink-500 opacity-30" : 
          state === "speaking" ? "bg-purple-500 opacity-40" : 
          state === "connecting" ? "bg-blue-500 opacity-30" : "bg-zinc-800"
        )} />
      </div>

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-12 text-center z-10"
      >
        <h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent mb-2">
          INYA
        </h1>
        <p className="text-zinc-500 text-sm font-medium tracking-widest uppercase">
          Your Sassy AI Companion
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
                    state === "listening" ? "border-pink-500" : "border-purple-500"
                  )}
                />
                <motion.div
                  initial={{ scale: 1, opacity: 0.3 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                  className={cn(
                    "absolute inset-0 rounded-full border-2",
                    state === "listening" ? "border-pink-400" : "border-purple-400"
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
                ? "bg-zinc-900 border-4 border-pink-500/50 shadow-pink-500/20" 
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
                    <Mic className="w-16 h-16 text-purple-400" />
                  </motion.div>
                ) : (
                  <Mic className="w-16 h-16 text-pink-400" />
                )}
              </div>
            ) : (
              <Power className="w-16 h-16 text-zinc-500" />
            )}

            {/* Inner Glow */}
            <div className={cn(
              "absolute inset-2 rounded-full blur-md transition-opacity duration-500",
              isPowerOn ? "opacity-40 bg-pink-500" : "opacity-0"
            )} />
          </motion.button>
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
                state === "speaking" ? "bg-purple-500" : 
                state === "listening" ? "bg-pink-500" : "bg-zinc-800"
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

      {/* Footer Info */}
      <div className="absolute bottom-8 text-zinc-600 text-xs font-medium tracking-widest uppercase flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", isPowerOn ? "bg-green-500 animate-pulse" : "bg-zinc-800")} />
          {isPowerOn ? "Online" : "Offline"}
        </div>
        <div className="flex items-center gap-2">
          <Globe className="w-3 h-3" />
          Web Enabled
        </div>
      </div>
    </div>
  );
}
