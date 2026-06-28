import React, { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Video, UserCheck, ShieldAlert, Wifi } from "lucide-react";
import { useProctoring } from "@/hooks/useProctoring";
import { useCameraPreview } from "@/hooks/useCameraPreview";
import { VoiceInterface } from "./VoiceInterface";
import { cn } from "@/lib/utils";

interface VirtualInterfaceProps {
  sessionId: string;
  currentQuestion: string;
  isProcessing: boolean;
  onAnswerSubmit: (answer: string) => void | Promise<void>;
  onToggleMode: () => void;
  onSilenceMaxReached?: () => void;
  className?: string;
}

export const VirtualInterface = React.memo(function VirtualInterface({
  sessionId,
  currentQuestion,
  isProcessing,
  onAnswerSubmit,
  onToggleMode,
  onSilenceMaxReached,
  className,
}: VirtualInterfaceProps) {
  const { stream, videoRef, startCamera, stopCamera, error: cameraError } = useCameraPreview();
  const {
    isProctoring,
    isModelsLoaded,
    modelsLoadError,
    warnings,
    startProctoring,
    stopProctoring,
    clearWarnings,
  } = useProctoring();

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Callback ref: fires the instant the <video> element mounts in the DOM.
  // This guarantees srcObject is set even if the stream arrived before mount.
  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    // Keep the hook's ref in sync
    (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
    if (node && stream) {
      node.srcObject = stream;
      node.play().catch(() => {});
    }
  }, [stream, videoRef]);

  // Start basic proctoring as soon as the camera is ready; face detection upgrades when models load.
  useEffect(() => {
    if (stream && videoRef.current) {
      // Small delay to ensure video element has loaded the stream
      const t = setTimeout(() => {
        if (videoRef.current) startProctoring(videoRef.current);
      }, 800);
      return () => clearTimeout(t);
    }
    return () => stopProctoring();
  }, [stream, isModelsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn("flex flex-col lg:flex-row gap-4", className)}>

      {/* ── Left: Voice Interface ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <VoiceInterface
          sessionId={sessionId}
          currentQuestion={currentQuestion}
          isProcessing={isProcessing}
          onAnswerSubmit={onAnswerSubmit}
          onToggleMode={onToggleMode}
          onSilenceMaxReached={onSilenceMaxReached}
        />
      </div>

      {/* ── Right: Camera + Proctoring ────────────────────────────────────── */}
      <div className="w-full lg:w-[340px] flex flex-col gap-3 shrink-0">

        {/* Camera Feed */}
        <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10 shadow-xl aspect-video flex-shrink-0">
          <video
            ref={videoCallbackRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />

          {/* Loading state */}
          {!stream && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Video className="h-6 w-6 animate-pulse text-brand-400" />
              <span className="text-xs">Starting camera...</span>
            </div>
          )}

          {/* Camera error state */}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-red-950/60 backdrop-blur-sm">
              <AlertCircle className="h-6 w-6 text-red-400 mb-2" />
              <p className="text-xs text-red-200 leading-relaxed">{cameraError}</p>
              <button
                onClick={startCamera}
                className="mt-3 text-xs underline text-red-300 hover:text-red-100"
              >
                Retry
              </button>
            </div>
          )}

          {/* Proctoring active badge */}
          {isProctoring && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                {modelsLoadError ? "Basic" : "Full"} Proctoring
              </span>
            </div>
          )}

          {/* Models degraded banner */}
          {modelsLoadError && isProctoring && (
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1.5 bg-amber-950/80 backdrop-blur-sm px-3 py-1.5">
              <Wifi className="h-3 w-3 text-amber-400 shrink-0" />
              <span className="text-[10px] text-amber-300 leading-tight">
                Face detection offline — tab monitoring active
              </span>
            </div>
          )}
        </div>

        {/* Proctoring Flags Panel */}
        <div className="flex-1 bg-card/40 border border-border/50 rounded-2xl p-4 flex flex-col backdrop-blur-sm min-h-[160px]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-brand-400" />
              Proctoring Flags
              {warnings.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                  {warnings.length}
                </span>
              )}
            </h4>
            {warnings.length > 0 && (
              <button
                onClick={clearWarnings}
                className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            <AnimatePresence mode="popLayout">
              {warnings.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-6 text-muted-foreground/60"
                >
                  <UserCheck className="h-7 w-7 mb-2" />
                  <p className="text-xs text-center leading-relaxed">
                    Looking good. Maintain eye contact and focus on the interview.
                  </p>
                </motion.div>
              ) : (
                [...warnings].reverse().slice(0, 10).map((warning) => (
                  <motion.div
                    key={warning.id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    className="bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs px-3 py-2 rounded-lg"
                  >
                    <div className="flex items-start gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-400 mt-1 shrink-0" />
                      <span className="leading-relaxed">{warning.message}</span>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
});

export default VirtualInterface;
