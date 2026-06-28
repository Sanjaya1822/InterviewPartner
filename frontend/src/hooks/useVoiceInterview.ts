/**
 * useVoiceInterview — Voice interview management hook.
 *
 * Key design decisions:
 * - SpeechRecognition handles its own voice detection — we trust its `onresult`
 *   for transcript and silence tracking, NOT the VAD volume level.
 * - VAD (AudioContext) is used ONLY to interrupt AI speech when the user starts
 *   talking (barge-in detection). It does NOT reset silence timers.
 * - Auto-submit fires after 2.5s of silence following the LAST FINAL transcript.
 * - isSubmittingRef prevents the duplicate-key database error on double-fire.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import api from "@/services/api";

// ─── Types ───────────────────────────────────────────────────────────────────

export type VoiceState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "paused"
  | "error";

export interface VoiceInterviewConfig {
  sessionId: string;
  onTranscriptReady: (transcript: string) => void | Promise<void>;
  onHintReceived: (hint: string, type: string) => void;
  onSilenceMaxReached?: () => void;
  onError?: (error: string) => void;
  autoSubmitAfterSilenceMs?: number; // ms after last final word → auto submit
  nudgeSilenceMs?: number;
  rephraseSilenceMs?: number;
  partialAnswerSilenceMs?: number;
  maxSilenceMs?: number;
  lang?: string;
}

export interface VoiceInterviewHook {
  voiceState: VoiceState;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  silenceSeconds: number;
  volume: number;

  startListening: () => void;
  stopListening: () => void;
  speakText: (text: string, onEnd?: () => void) => void;
  stopSpeaking: () => void;
  pauseInterview: () => void;
  resumeInterview: () => void;
  toggleMute: () => void;
  clearTranscript: () => void;
  submitCurrentTranscript: () => void;
}

// ─── Browser support ─────────────────────────────────────────────────────────

function checkSpeechSupport(): { stt: boolean; tts: boolean } {
  const stt =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const tts = typeof window !== "undefined" && "speechSynthesis" in window;
  return { stt, tts };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceInterview(config: VoiceInterviewConfig): VoiceInterviewHook {
  const {
    sessionId,
    onTranscriptReady,
    onHintReceived,
    onSilenceMaxReached,
    onError,
    autoSubmitAfterSilenceMs = 2500,
    nudgeSilenceMs = 15000,
    rephraseSilenceMs = 30000,
    partialAnswerSilenceMs = 60000,
    maxSilenceMs = 90000,
    lang = "en-US",
  } = config;

  const support = checkSpeechSupport();

  // ── State ───────────────────────────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceSeconds, setSilenceSeconds] = useState(0);
  const [volume, setVolume] = useState(0);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpeechRef = useRef(Date.now());   // set on each FINAL transcript result
  const isPausedRef = useRef(false);
  const isMutedRef = useRef(false);
  const isListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const hintLevelRef = useRef(0);
  const transcriptRef = useRef("");
  const isSubmittingRef = useRef(false);

  // VAD — barge-in only
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadStreamRef = useRef<MediaStream | null>(null);
  const vadFrameRef = useRef<number | null>(null);

  // ── VAD: barge-in detection ──────────────────────────────────────────────
  // Only purpose: cancel AI speech when user starts talking.
  // Does NOT touch silence timers — that is handled by onresult alone.
  const startVAD = useCallback(async () => {
    try {
      if (!vadStreamRef.current) {
        vadStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      }
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }

      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      analyserRef.current = analyser;

      const source = audioCtxRef.current.createMediaStreamSource(
        vadStreamRef.current
      );
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        vadFrameRef.current = requestAnimationFrame(tick);
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        setVolume(avg);

        // Barge-in: stop AI TTS if user is clearly speaking (high threshold)
        if (avg > 35 && isSpeakingRef.current) {
          window.speechSynthesis.cancel();
          setIsSpeaking(false);
          isSpeakingRef.current = false;
          setVoiceState("listening");
          // Re-start recognition if it dropped
          if (!isPausedRef.current && !isMutedRef.current) {
            isListeningRef.current = true;
            try { recognitionRef.current?.start(); } catch (_) {}
          }
        }
      };
      tick();
    } catch (err) {
      console.warn("VAD setup failed (non-critical):", err);
    }
  }, []);

  const stopVAD = useCallback(() => {
    if (vadFrameRef.current) cancelAnimationFrame(vadFrameRef.current);
    vadFrameRef.current = null;
    if (audioCtxRef.current) audioCtxRef.current.suspend();
  }, []);

  // ── Silence tracking ────────────────────────────────────────────────────────
  // Called on every FINAL transcript result — resets the silence clock.
  const resetSilenceTracking = useCallback(() => {
    lastSpeechRef.current = Date.now();
    hintLevelRef.current = 0;
    setSilenceSeconds(0);
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
  }, []);

  const submitTranscript = useCallback(async (text: string) => {
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }

    try {
      setTranscript("");
      transcriptRef.current = "";
      setInterimTranscript("");
      resetSilenceTracking();
      await onTranscriptReady(text);
    } finally {
      isSubmittingRef.current = false;
    }
  }, [onTranscriptReady, resetSilenceTracking]);

  // Schedule auto-submit 2.5s after the last final word.
  const scheduleAutoSubmit = useCallback(() => {
    if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
    autoSubmitTimerRef.current = setTimeout(() => {
      const text = transcriptRef.current.trim();
      if (text.length > 3) {
        void submitTranscript(text);
      }
    }, autoSubmitAfterSilenceMs);
  }, [autoSubmitAfterSilenceMs, submitTranscript]);

  // ── TTS ref (avoids stale closure in setInterval) ─────────────────────────
  const speakTextInternalRef = useRef<(text: string, onEnd?: () => void) => void>(
    () => {}
  );
  // Ref for startSilenceMonitor — avoids stale closure in speakTextInternal.onend
  const startSilenceMonitorRef = useRef<() => void>(() => {});

  // ── Silence monitor: runs every 500ms while listening ─────────────────────
  const startSilenceMonitor = useCallback(() => {
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);

    silenceTimerRef.current = setInterval(async () => {
      // Do nothing while AI is speaking or interview is paused/muted
      if (isPausedRef.current || isMutedRef.current || isSpeakingRef.current) return;

      const elapsed = Date.now() - lastSpeechRef.current;
      setSilenceSeconds(Math.floor(elapsed / 1000));

      if (elapsed >= nudgeSilenceMs && hintLevelRef.current < 1) {
        hintLevelRef.current = 1;
        try {
          const { data } = await api.get(
            `/interviews/${sessionId}/hint?hint_level=1`
          );
          onHintReceived(data.hint, "nudge");
          speakTextInternalRef.current(data.hint);
        } catch {}
      }

      if (elapsed >= rephraseSilenceMs && hintLevelRef.current < 2) {
        hintLevelRef.current = 2;
        try {
          const { data } = await api.get(
            `/interviews/${sessionId}/hint?hint_level=2`
          );
          onHintReceived(data.hint, "rephrase");
          speakTextInternalRef.current(data.hint);
        } catch {}
      }

      if (elapsed >= partialAnswerSilenceMs && hintLevelRef.current < 3) {
        hintLevelRef.current = 3;
        try {
          const { data } = await api.get(
            `/interviews/${sessionId}/hint?hint_level=3`
          );
          onHintReceived(data.hint, "partial_answer");
          speakTextInternalRef.current(data.hint);
        } catch {}
      }

      if (elapsed >= maxSilenceMs && hintLevelRef.current < 4) {
        hintLevelRef.current = 4;
        onSilenceMaxReached?.();
      }
    }, 500);
  }, [
    nudgeSilenceMs,
    rephraseSilenceMs,
    partialAnswerSilenceMs,
    maxSilenceMs,
    sessionId,
    onHintReceived,
    onSilenceMaxReached,
  ]);

  // ── Initialize SpeechRecognition ──────────────────────────────────────────
  const initRecognition = useCallback(() => {
    if (!support.stt) return null;

    const SpeechRecognitionImpl =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const rec: SpeechRecognition =
      new SpeechRecognitionImpl() as SpeechRecognition;

    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      isListeningRef.current = true;
      isSubmittingRef.current = false; // reset guard on new question
      setVoiceState("listening");
      // Don't reset silence here — the question was just spoken by TTS
    };

    rec.onend = () => {
      // Auto-restart to stay continuously listening
      if (
        !isPausedRef.current &&
        isListeningRef.current &&
        !isSpeakingRef.current
      ) {
        try { rec.start(); } catch (_) {}
      }
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      // Show interim immediately so user sees they are being heard
      setInterimTranscript(interimText);

      if (finalText) {
        // Append to running transcript
        setTranscript((prev) => {
          const updated = (prev + " " + finalText).trim();
          transcriptRef.current = updated;
          return updated;
        });
        // Reset silence clock on final word
        resetSilenceTracking();
        // Restart auto-submit countdown
        scheduleAutoSubmit();
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return;  // common, ignore
      if (event.error === "aborted") return;     // we stopped it, ignore
      if (event.error === "network") {
        // Network error mid-session — try to restart
        setTimeout(() => {
          if (isListeningRef.current && !isPausedRef.current) {
            try { rec.start(); } catch (_) {}
          }
        }, 1000);
        return;
      }
      console.error("Speech recognition error:", event.error);
      setVoiceState("error");
      onError?.(`Speech recognition error: ${event.error}`);
    };

    return rec;
  }, [lang, support.stt, resetSilenceTracking, scheduleAutoSubmit]);

  // ── Internal TTS ────────────────────────────────────────────────────────────
  const speakTextInternal = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!support.tts || !text.trim()) return;

      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.93;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Pick a natural English voice
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find(
          (v) =>
            v.lang.startsWith("en") &&
            (v.name.includes("Google") ||
              v.name.includes("Natural") ||
              v.name.includes("Samantha") ||
              v.name.includes("Daniel"))
        ) || voices.find((v) => v.lang.startsWith("en"));
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => {
        setIsSpeaking(true);
        isSpeakingRef.current = true;
        setVoiceState("speaking");
        // Stop STT while AI is speaking (prevents feedback loop)
        isListeningRef.current = false;
        try { recognitionRef.current?.stop(); } catch (_) {}
        // Reset silence clock — interviewer is speaking, not silence
        lastSpeechRef.current = Date.now();
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setVoiceState("listening");
        onEnd?.();
        // Resume listening after AI finishes
        if (!isPausedRef.current && !isMutedRef.current) {
          isListeningRef.current = true;
          lastSpeechRef.current = Date.now(); // fresh silence clock for the new question
          hintLevelRef.current = 0;
          setSilenceSeconds(0);
          try {
            recognitionRef.current?.start();
          } catch (_) {}
          // CRITICAL: restart silence monitor so hints + auto-skip work for this question
          startSilenceMonitorRef.current();
        }
      };

      utterance.onerror = (e) => {
        if (e.error === "interrupted") return; // user barged in — fine
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setVoiceState("listening");
        // Resume listening even after TTS error
        if (!isPausedRef.current && !isMutedRef.current) {
          isListeningRef.current = true;
          try { recognitionRef.current?.start(); } catch (_) {}
        }
      };

      window.speechSynthesis.speak(utterance);
    },
    [support.tts, lang]
  );

  // Keep refs current every render — breaks stale closures in setInterval/utterance callbacks
  useEffect(() => {
    speakTextInternalRef.current = speakTextInternal;
    startSilenceMonitorRef.current = startSilenceMonitor;
  });

  // ── Public API ───────────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!support.stt) {
      toast.error(
        "Speech recognition not supported. Use Chrome or Edge.",
        { duration: 5000 }
      );
      return;
    }
    if (isMutedRef.current) {
      toast("Mic is muted. Tap Unmute first.", { icon: "🎤" });
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = initRecognition();
    }

    isPausedRef.current = false;
    isListeningRef.current = true;
    lastSpeechRef.current = Date.now();
    hintLevelRef.current = 0;
    setSilenceSeconds(0);

    try { recognitionRef.current?.start(); } catch (_) {}

    startVAD();
    startSilenceMonitor();
  }, [support.stt, initRecognition, startVAD, startSilenceMonitor]);

  const stopListening = useCallback(() => {
    isPausedRef.current = true;
    isListeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch (_) {}
    stopVAD();
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
    setVoiceState("idle");
  }, [stopVAD]);

  const speakText = useCallback(
    (text: string, onEnd?: () => void) => {
      speakTextInternal(text, onEnd);
    },
    [speakTextInternal]
  );

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    setVoiceState("listening");
    if (!isPausedRef.current && !isMutedRef.current) {
      isListeningRef.current = true;
      try { recognitionRef.current?.start(); } catch (_) {}
    }
  }, []);

  const pauseInterview = useCallback(() => {
    isPausedRef.current = true;
    isListeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch (_) {}
    window.speechSynthesis.cancel();
    stopVAD();
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
    setVoiceState("paused");
    setSilenceSeconds(0);
  }, [stopVAD]);

  const resumeInterview = useCallback(() => {
    isPausedRef.current = false;
    isListeningRef.current = true;
    lastSpeechRef.current = Date.now();
    setVoiceState("listening");
    try { recognitionRef.current?.start(); } catch (_) {}
    startVAD();
    startSilenceMonitor();
  }, [startVAD, startSilenceMonitor]);

  const toggleMute = useCallback(() => {
    isMutedRef.current = !isMutedRef.current;
    setIsMuted(isMutedRef.current);
    if (isMutedRef.current) {
      isListeningRef.current = false;
      try { recognitionRef.current?.stop(); } catch (_) {}
      toast("Microphone muted", { icon: "🔇" });
    } else {
      toast("Microphone active", { icon: "🎤" });
      isListeningRef.current = true;
      lastSpeechRef.current = Date.now();
      try { recognitionRef.current?.start(); } catch (_) {}
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    transcriptRef.current = "";
    setInterimTranscript("");
    resetSilenceTracking();
  }, [resetSilenceTracking]);

  const submitCurrentTranscript = useCallback(() => {
    const text = transcriptRef.current.trim();
    if (text) {
      void submitTranscript(text);
    }
  }, [submitTranscript]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      try { recognitionRef.current?.stop(); } catch (_) {}
      window.speechSynthesis?.cancel();
      stopVAD();
      // Release mic stream
      vadStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
      if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
    };
  }, [stopVAD]);

  return {
    voiceState,
    transcript,
    interimTranscript,
    isSupported: support.stt && support.tts,
    isMuted,
    isSpeaking,
    silenceSeconds,
    volume,
    startListening,
    stopListening,
    speakText,
    stopSpeaking,
    pauseInterview,
    resumeInterview,
    toggleMute,
    clearTranscript,
    submitCurrentTranscript,
  };
}
