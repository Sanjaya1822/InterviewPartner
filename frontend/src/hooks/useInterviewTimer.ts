/**
 * useInterviewTimer — Countdown timer for the interview session.
 *
 * - Counts DOWN from duration_minutes
 * - Fires onTimeWarning at 2 minutes remaining
 * - Fires onTimeUp when countdown hits zero
 * - Supports pause/resume
 */
import { useState, useRef, useEffect, useCallback } from "react";

interface UseInterviewTimerOptions {
  durationSeconds: number;
  onTimeWarning?: (secondsLeft: number) => void;  // fired at 120s and 60s remaining
  onTimeUp?: () => void;
  warningThresholds?: number[];  // default [120, 60, 30]
  autoStart?: boolean;
}

interface UseInterviewTimerReturn {
  secondsLeft: number;
  isRunning: boolean;
  isPaused: boolean;
  isWarning: boolean;      // true when <2 min remaining
  isCritical: boolean;     // true when <30s remaining
  formattedTime: string;   // "MM:SS"
  progressPercent: number; // 0-100 (100 = full time, 0 = time up)
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export function useInterviewTimer({
  durationSeconds,
  onTimeWarning,
  onTimeUp,
  warningThresholds = [120, 60, 30],
  autoStart = false,
}: UseInterviewTimerOptions): UseInterviewTimerReturn {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedThresholdsRef = useRef<Set<number>>(new Set());

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const start = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    firedThresholdsRef.current.clear();

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1;

        // Fire warning callbacks at thresholds
        for (const threshold of warningThresholds) {
          if (next === threshold && !firedThresholdsRef.current.has(threshold)) {
            firedThresholdsRef.current.add(threshold);
            onTimeWarning?.(next);
          }
        }

        if (next <= 0) {
          clearTimer();
          setIsRunning(false);
          onTimeUp?.();
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [warningThresholds, onTimeWarning, onTimeUp]);

  const pause = useCallback(() => {
    clearTimer();
    setIsPaused(true);
    setIsRunning(false);
  }, []);

  const resume = useCallback(() => {
    if (secondsLeft <= 0) return;
    setIsRunning(true);
    setIsPaused(false);

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearTimer();
          setIsRunning(false);
          onTimeUp?.();
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [secondsLeft, onTimeUp]);

  const stop = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    setIsPaused(false);
  }, []);

  useEffect(() => {
    if (autoStart) start();
    return () => clearTimer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const progressPercent = Math.round((secondsLeft / durationSeconds) * 100);

  return {
    secondsLeft,
    isRunning,
    isPaused,
    isWarning: secondsLeft <= 120 && secondsLeft > 30,
    isCritical: secondsLeft <= 30,
    formattedTime,
    progressPercent,
    start,
    pause,
    resume,
    stop,
  };
}
