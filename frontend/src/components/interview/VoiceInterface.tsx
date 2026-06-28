/**
 * VoiceInterface — Complete voice mode UI for the interview.
 *
 * Features:
 * - Microphone button with animated pulse ring
 * - Live transcript display with interim (gray) + final (white) text
 * - AI hint display when silence is detected
 * - Silence progress ring (shows time elapsed since last speech)
 * - Waveform visualization
 * - Mute / pause / replay question buttons
 * - Browser compatibility warning
 * - 60-90s countdown ring with "Still here?" prompt
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Volume2, VolumeX, Pause, Play,
  RotateCcw, Send, AlertCircle, Lightbulb, Brain,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceWaveform, MicPulse, SilenceRing } from "@/components/ui/VoiceWaveform";
import { useVoiceInterview } from "@/hooks/useVoiceInterview";
import { cn } from "@/lib/utils";

interface VoiceInterfaceProps {
  sessionId: string;
  currentQuestion: string;
  isProcessing: boolean;
  onAnswerSubmit: (answer: string) => void | Promise<void>;
  onToggleMode: () => void;
  onSilenceMaxReached?: () => void;  // called at 90s — parent shows continue/skip dialog
  className?: string;
}

interface HintMessage {
  text: string;
  type: "nudge" | "rephrase" | "partial_answer";
  id: number;
}

import React from "react";

export const VoiceInterface = React.memo(function VoiceInterface({
  sessionId,
  currentQuestion,
  isProcessing,
  onAnswerSubmit,
  onToggleMode,
  onSilenceMaxReached,
  className,
}: VoiceInterfaceProps) {
  const [hints, setHints] = useState<HintMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const lastSpokenQuestionRef = useRef("");

  // Stable callback refs to avoid stale closures
  const onTranscriptReadyRef = useRef<(t: string) => void | Promise<void>>(onAnswerSubmit);
  useEffect(() => { onTranscriptReadyRef.current = onAnswerSubmit; }, [onAnswerSubmit]);

  // ── Voice hook ───────────────────────────────────────────────────────────────
  const voice = useVoiceInterview({
    sessionId,
    onTranscriptReady: useCallback(
      (transcript) => {
        return onTranscriptReadyRef.current(transcript);
      },
      []  // stable — uses ref to avoid stale closure
    ),
    onHintReceived: useCallback((hint, type) => {
      const id = Date.now();
      setHints((prev) => [
        ...prev.slice(-2),  // keep last 3 hints
        { text: hint, type: type as HintMessage["type"], id },
      ]);
    }, []),
    onSilenceMaxReached: useCallback(() => {
      onSilenceMaxReached?.();
    }, [onSilenceMaxReached]),
    onError: useCallback((err: string) => {
      console.error("Voice error:", err);
    }, []),
  });

  // Read question aloud when a new question arrives
  useEffect(() => {
    const question = currentQuestion.trim();
    if (!hasStarted || !question || question === lastSpokenQuestionRef.current || isProcessing) {
      return;
    }

    lastSpokenQuestionRef.current = question;
    voice.clearTranscript();

    if (!voice.isSupported || !isTtsEnabled) {
      voice.startListening();
      return;
    }

    voice.stopListening();
    const timer = setTimeout(() => {
      voice.speakText(question, () => {
        voice.startListening();
      });
    }, 120);

    return () => clearTimeout(timer);
  }, [currentQuestion, hasStarted, isProcessing, isTtsEnabled, voice.isSupported]);

  // Clear hints when new question arrives
  useEffect(() => {
    setHints([]);
  }, [currentQuestion]);

  const handleStartVoice = () => {
    setHasStarted(true);
    lastSpokenQuestionRef.current = currentQuestion.trim();
    if (isTtsEnabled) {
      voice.speakText(currentQuestion, () => {
        voice.startListening();
      });
    } else {
      voice.startListening();
    }
  };

  const handleReplayQuestion = () => {
    lastSpokenQuestionRef.current = currentQuestion.trim();
    voice.stopListening();
    voice.speakText(currentQuestion, () => {
      voice.startListening();
    });
  };

  const handleManualSubmit = () => {
    if (voice.transcript.trim()) {
      voice.submitCurrentTranscript();
    }
  };

  if (!voice.isSupported) {
    return (
      <div className={cn("flex flex-col items-center gap-4 p-6 text-center", className)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
          <AlertCircle className="h-6 w-6 text-yellow-500" />
        </div>
        <div>
          <p className="font-semibold">Voice Not Supported</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your browser doesn't support the Web Speech API.
            Please use Chrome or Microsoft Edge for voice interviews.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onToggleMode}>
          Switch to Text Mode
        </Button>
      </div>
    );
  }

  const isListening = voice.voiceState === "listening";
  const isSpeaking = voice.voiceState === "speaking";
  const isPaused = voice.voiceState === "paused";

  // Countdown display: show at 60s+
  const showCountdown = isListening && !isProcessing && voice.silenceSeconds >= 60;
  const countdownSeconds = Math.max(0, 90 - voice.silenceSeconds);

  return (
    <div className={cn("flex flex-col gap-5", className)}>

      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              isListening ? "bg-indigo-500 animate-pulse" :
              isSpeaking ? "bg-emerald-500 animate-pulse" :
              isPaused ? "bg-amber-500" :
              isProcessing ? "bg-violet-500 animate-pulse" :
              "bg-muted-foreground"
            )}
          />
          <span className="text-sm font-medium capitalize">
            {isProcessing ? "Processing answer..." :
             isSpeaking ? "AI is speaking..." :
             isListening ? "Listening to you..." :
             isPaused ? "Interview paused" :
             hasStarted ? "Ready" : "Click mic to start"}
          </span>
        </div>

        {/* Toggle TTS */}
        <Button
          variant="ghost" size="sm"
          onClick={() => setIsTtsEnabled((v) => !v)}
          className="gap-1.5 text-xs"
        >
          {isTtsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          {isTtsEnabled ? "AI Voice On" : "AI Voice Off"}
        </Button>
      </div>

      {/* Main waveform area */}
      <div className="relative flex flex-col items-center justify-center gap-6 rounded-2xl border border-border/50 bg-card/40 p-8 backdrop-blur-sm min-h-[220px]">

        {/* Silence ring (shows when listening and silence >= 3s) */}
        {isListening && !isProcessing && (
          <div className="absolute top-4 right-4">
            <SilenceRing silenceSeconds={voice.silenceSeconds} />
          </div>
        )}

        {/* 60-90s countdown overlay */}
        <AnimatePresence>
          {showCountdown && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1"
            >
              <Clock className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
              <span className="text-xs font-mono font-semibold text-amber-400">
                {countdownSeconds}s
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Waveform */}
        <VoiceWaveform
          isActive={isListening}
          isSpeaking={isSpeaking}
          isProcessing={isProcessing}
          barCount={16}
          className="h-12"
        />

        {/* Big Microphone Button */}
        <div className="relative">
          <MicPulse isActive={isListening} isMuted={voice.isMuted}>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-20 w-20 rounded-full text-white transition-all duration-300 shadow-xl",
                isListening && !voice.isMuted
                  ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/40"
                  : isSpeaking
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/40"
                  : isProcessing
                  ? "bg-violet-600 cursor-wait shadow-violet-500/40"
                  : "bg-muted hover:bg-accent"
              )}
              onClick={
                !hasStarted
                  ? handleStartVoice
                  : isListening
                  ? voice.stopListening
                  : voice.startListening
              }
              disabled={isProcessing || isSpeaking}
            >
              {voice.isMuted ? (
                <MicOff className="h-8 w-8 text-red-400" />
              ) : (
                <Mic className={cn(
                  "h-8 w-8",
                  isListening ? "text-white" : "text-muted-foreground"
                )} />
              )}
            </Button>
          </MicPulse>
        </div>

        {/* Action buttons row */}
        <div className="flex items-center gap-3">
          {/* Mute */}
          <Button
            variant="outline" size="sm"
            onClick={voice.toggleMute}
            className={cn("gap-2", voice.isMuted && "border-red-500/50 text-red-400")}
          >
            {voice.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {voice.isMuted ? "Unmute" : "Mute"}
          </Button>

          {/* Pause / Resume */}
          {hasStarted && (
            <Button
              variant="outline" size="sm"
              onClick={isPaused ? voice.resumeInterview : voice.pauseInterview}
              className="gap-2"
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {isPaused ? "Resume" : "Pause"}
            </Button>
          )}

          {/* Replay question */}
          {hasStarted && isTtsEnabled && (
            <Button
              variant="outline" size="sm"
              onClick={handleReplayQuestion}
              className="gap-2"
              disabled={isSpeaking}
            >
              <RotateCcw className="h-4 w-4" />
              Replay Q
            </Button>
          )}
        </div>
      </div>

      {/* Live transcript */}
      <AnimatePresence>
        {(voice.transcript || voice.interimTranscript) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border border-border/50 bg-muted/30 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Your Answer (Live)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost" size="sm"
                  onClick={voice.clearTranscript}
                  className="h-7 text-xs text-muted-foreground"
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleManualSubmit}
                  disabled={!voice.transcript.trim() || isProcessing}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Send className="h-3.5 w-3.5" />
                  Submit Answer
                </Button>
              </div>
            </div>
            <p className="text-sm leading-relaxed">
              <span className="text-foreground">{voice.transcript}</span>
              {voice.interimTranscript && (
                <span className="text-muted-foreground/70 italic">
                  {voice.transcript ? " " : ""}{voice.interimTranscript}
                </span>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Hints */}
      <AnimatePresence mode="popLayout">
        {hints.map((hint) => (
          <motion.div
            key={hint.id}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className={cn(
              "rounded-xl border p-4 flex gap-3",
              hint.type === "nudge"
                ? "border-blue-500/20 bg-blue-500/5"
                : hint.type === "rephrase"
                ? "border-amber-500/20 bg-amber-500/5"
                : "border-violet-500/20 bg-violet-500/5"
            )}
          >
            <div className="flex-shrink-0 mt-0.5">
              {hint.type === "nudge" ? (
                <Brain className="h-4 w-4 text-blue-400" />
              ) : (
                <Lightbulb className={cn(
                  "h-4 w-4",
                  hint.type === "rephrase" ? "text-amber-400" : "text-violet-400"
                )} />
              )}
            </div>
            <div>
              <p className={cn(
                "text-xs font-semibold uppercase tracking-wide mb-1",
                hint.type === "nudge" ? "text-blue-400" :
                hint.type === "rephrase" ? "text-amber-400" : "text-violet-400"
              )}>
                {hint.type === "nudge" ? "AI Encouragement" :
                 hint.type === "rephrase" ? "Question Rephrased" : "Helpful Hint"}
              </p>
              <p className="text-sm text-foreground/90">{hint.text}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Silence guidance bar */}
      {isListening && voice.silenceSeconds >= 5 && voice.silenceSeconds < 60 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-xs text-muted-foreground"
        >
          {voice.silenceSeconds < 8
            ? "Speak your answer or take a moment to think..."
            : voice.silenceSeconds < 20
            ? "Still listening... Take your time."
            : "I can rephrase the question if that helps."}
        </motion.div>
      )}

      {/* 60-89s — gentle warning */}
      {isListening && voice.silenceSeconds >= 60 && voice.silenceSeconds < 90 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-400"
        >
          <Clock className="h-4 w-4" />
          <span>
            No response detected. A prompt will appear in{" "}
            <strong>{Math.max(0, 90 - voice.silenceSeconds)}s</strong>.
          </span>
        </motion.div>
      )}

    </div>
  );
});

export default VoiceInterface;
