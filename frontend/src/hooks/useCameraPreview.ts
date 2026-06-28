import { useState, useEffect, useCallback, useRef } from "react";

export function useCameraPreview() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
        audio: false, // Audio handled by useVoiceInterview — no dual-stream conflict
      });
      setStream(mediaStream);
      setError(null);
    } catch (err: any) {
      console.error("Camera error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Camera permission denied. Click the camera icon in your browser's address bar and allow access.");
      } else if (err.name === "NotFoundError") {
        setError("No camera found. Please connect a camera and reload.");
      } else if (err.name === "NotReadableError") {
        setError("Camera is in use by another application. Close it and try again.");
      } else if (err.name === "OverconstrainedError") {
        // Retry without constraints
        try {
          const fallback = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          setStream(fallback);
          setError(null);
        } catch {
          setError("Could not start camera.");
        }
      } else {
        setError(err.message || "Could not access camera.");
      }
    }
  }, []);

  // KEY FIX: Attach stream to video element whenever EITHER becomes available.
  // startCamera() resolves async — the video element may not be mounted yet when
  // the stream arrives. This effect re-runs whenever stream or videoRef changes
  // and attaches srcObject as soon as both are present.
  useEffect(() => {
    if (!stream) return;

    // Immediate attach if ref already available
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {}); // Autoplay may need a nudge
      return;
    }

    // Ref not yet available — poll briefly (max 2s) for the element to mount
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        clearInterval(interval);
      } else if (attempts > 20) {
        clearInterval(interval); // Give up after 2s
      }
    }, 100);

    return () => clearInterval(interval);
  }, [stream]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
  }, [stream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  return { stream, error, videoRef, startCamera, stopCamera };
}
