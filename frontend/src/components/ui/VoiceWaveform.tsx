/**
 * VoiceWaveform — Animated audio waveform visualization.
 * Shows different states: idle, listening, speaking, processing.
 */
import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface VoiceWaveformProps {
  isActive: boolean;
  isSpeaking?: boolean;
  isProcessing?: boolean;
  barCount?: number;
  className?: string;
  color?: string;
  volume?: number;
}

export function VoiceWaveform({
  isActive,
  isSpeaking = false,
  isProcessing = false,
  barCount = 12,
  className,
  color,
  volume = 0,
}: VoiceWaveformProps) {
  const bars = Array.from({ length: barCount }, (_, i) => i);

  const getBarAnimation = (index: number) => {
    if (isProcessing) {
      // Spinner-like wave during processing
      return {
        scaleY: [0.2, 1, 0.2],
        transition: {
          duration: 0.8,
          repeat: Infinity,
          delay: (index / barCount) * 0.8,
          ease: "easeInOut",
        },
      };
    }

    if (isSpeaking) {
      // Faster, more pronounced wave when AI is speaking
      const heights = [0.3, 0.7, 1.0, 0.8, 0.5, 0.9, 0.4, 0.8, 1.0, 0.6, 0.4, 0.3];
      return {
        scaleY: [0.2, heights[index % heights.length], 0.2],
        transition: {
          duration: 0.5 + (index % 3) * 0.15,
          repeat: Infinity,
          delay: (index * 0.06) % 0.5,
          ease: "easeInOut",
        },
      };
    }

    if (isActive && volume > 0) {
      // Real waveform based on volume
      // volume typically ranges 0-100 from average frequency data
      const normalizedVolume = Math.min(volume / 50, 1.5); 
      // Add some noise per bar for realistic effect
      const noise = Math.sin(index * 1.5 + Date.now() / 100) * 0.2;
      const height = Math.max(0.15, normalizedVolume + noise);
      return {
        scaleY: height,
        transition: { duration: 0.1, ease: "linear" },
      };
    }

    if (isActive) {
      // Natural breathing wave when listening
      const baseHeights = [0.2, 0.5, 0.8, 0.6, 0.9, 0.7, 0.4, 0.8, 0.5, 0.3, 0.7, 0.4];
      return {
        scaleY: [0.15, baseHeights[index % baseHeights.length], 0.15],
        transition: {
          duration: 0.7 + (index % 4) * 0.2,
          repeat: Infinity,
          delay: (index * 0.08) % 0.6,
          ease: "easeInOut",
        },
      };
    }

    // Idle — very low flat bars
    return {
      scaleY: 0.12,
      transition: { duration: 0.3 },
    };
  };

  const getColor = () => {
    if (color) return color;
    if (isProcessing) return "#a78bfa"; // violet
    if (isSpeaking) return "#34d399";   // emerald — AI speaking
    if (isActive) return "#6366f1";     // indigo — listening
    return "#4b5563";                   // gray — idle
  };

  return (
    <div
      className={cn("flex items-center justify-center gap-[3px]", className)}
      aria-label={
        isProcessing ? "Processing..." : isSpeaking ? "AI speaking" : isActive ? "Listening" : "Idle"
      }
    >
      {bars.map((i) => (
        <motion.div
          key={i}
          className="rounded-full origin-center"
          style={{
            width: 3,
            height: 28,
            backgroundColor: getColor(),
          }}
          animate={getBarAnimation(i)}
        />
      ))}
    </div>
  );
}

// ── Circular microphone pulse indicator ──────────────────────────────────────
interface MicPulseProps {
  isActive: boolean;
  isMuted?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function MicPulse({ isActive, isMuted = false, className, children }: MicPulseProps) {
  return (
    <div className={cn("relative inline-flex", className)}>
      {isActive && !isMuted && (
        <>
          <motion.div
            className="absolute inset-0 rounded-full bg-indigo-500/30"
            animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
          />
          <motion.div
            className="absolute inset-0 rounded-full bg-indigo-500/20"
            animate={{ scale: [1, 2.2], opacity: [0.4, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
          />
        </>
      )}
      <div
        className={cn(
          "relative z-10 flex items-center justify-center rounded-full transition-colors duration-300",
          isMuted ? "bg-red-500/10 border-2 border-red-500/50" : ""
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ── Silence countdown ring ────────────────────────────────────────────────────
interface SilenceRingProps {
  silenceSeconds: number;
  maxSeconds?: number;   // default 45
  className?: string;
}

export function SilenceRing({ silenceSeconds, maxSeconds = 45, className }: SilenceRingProps) {
  const progress = Math.min(silenceSeconds / maxSeconds, 1);
  const circumference = 2 * Math.PI * 20;
  const strokeDashoffset = circumference * (1 - progress);

  const getColor = () => {
    if (silenceSeconds >= 20) return "#ef4444";  // red — needs help
    if (silenceSeconds >= 8) return "#f59e0b";   // amber — thinking
    return "#6366f1";                             // indigo — normal
  };

  if (silenceSeconds < 3) return null;  // don't show ring for first 3s

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
        {/* Background track */}
        <circle
          cx="22" cy="22" r="20"
          fill="none" stroke="hsl(var(--border))"
          strokeWidth="3"
        />
        {/* Progress arc */}
        <motion.circle
          cx="22" cy="22" r="20"
          fill="none"
          stroke={getColor()}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.5 }}
        />
      </svg>
      <span
        className="absolute text-xs font-semibold tabular-nums"
        style={{ color: getColor() }}
      >
        {silenceSeconds}s
      </span>
    </div>
  );
}
