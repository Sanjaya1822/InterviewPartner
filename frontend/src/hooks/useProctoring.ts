import { useState, useEffect, useRef, useCallback } from "react";
import * as faceapi from "@vladmandic/face-api";

export type ProctoringWarningType =
  | "no_face"
  | "multiple_faces"
  | "tab_switched"
  | "window_unfocused";

export interface ProctoringWarning {
  id: string;
  type: ProctoringWarningType;
  timestamp: number;
  message: string;
}

export interface UseProctoringHook {
  isProctoring: boolean;
  isModelsLoaded: boolean;
  modelsLoadError: string | null;
  warnings: ProctoringWarning[];
  startProctoring: (videoElement: HTMLVideoElement) => void;
  stopProctoring: () => void;
  clearWarnings: () => void;
}

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";

export function useProctoring(): UseProctoringHook {
  const [isProctoring, setIsProctoring] = useState(false);
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [modelsLoadError, setModelsLoadError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ProctoringWarning[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addWarning = useCallback((type: ProctoringWarningType, message: string) => {
    setWarnings((prev) => {
      // Throttle warnings of the same type (1 per 3 seconds)
      const last = prev.filter(w => w.type === type).pop();
      if (last && Date.now() - last.timestamp < 3000) return prev;
      return [...prev, { id: Math.random().toString(36).substring(7), type, timestamp: Date.now(), message }];
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadModels = async () => {
      try {
        // Use a timeout so we don't hang forever if CDN is unreachable
        const loadPromise = faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Model load timed out after 3s")), 3000)
        );
        await Promise.race([loadPromise, timeoutPromise]);
        if (mounted) {
          setIsModelsLoaded(true);
          setModelsLoadError(null);
        }
      } catch (err: any) {
        console.warn("Face detection models failed to load:", err.message);
        if (mounted) {
          setModelsLoadError("Face detection unavailable. Proctoring will run in basic mode (tab/window monitoring only).");
          // Still mark as "loaded" so proctoring can start in degraded mode
          setIsModelsLoaded(true);
        }
      }
    };
    loadModels();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!isProctoring) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        addWarning("tab_switched", "Tab switched or minimized.");
      }
    };

    const handleBlur = () => {
      addWarning("window_unfocused", "Browser window lost focus.");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isProctoring, addWarning]);

  const startProctoring = useCallback((videoElement: HTMLVideoElement) => {
    videoRef.current = videoElement;
    setIsProctoring(true);

    if (intervalRef.current) clearInterval(intervalRef.current);
    
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      // If models failed to load (CDN error), skip face detection — just rely on tab/blur events
      if (!isModelsLoaded || modelsLoadError) return;

      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
      try {
        const detections = await faceapi.detectAllFaces(videoRef.current, options);
        
        if (detections.length === 0) {
          addWarning("no_face", "No face detected. Please stay in frame.");
        } else if (detections.length > 1) {
          addWarning("multiple_faces", "Multiple faces detected.");
        }
      } catch (err) {
        // Silently ignore individual detection errors
      }
    }, 2000);
  }, [isModelsLoaded, modelsLoadError, addWarning]);

  const stopProctoring = useCallback(() => {
    setIsProctoring(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    videoRef.current = null;
  }, []);

  const clearWarnings = useCallback(() => {
    setWarnings([]);
  }, []);

  useEffect(() => {
    return () => stopProctoring();
  }, [stopProctoring]);

  return {
    isProctoring,
    isModelsLoaded,
    modelsLoadError,
    warnings,
    startProctoring,
    stopProctoring,
    clearWarnings,
  };
}
