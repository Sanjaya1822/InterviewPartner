import { useEffect, useRef, useCallback } from "react";
import { useInterviewStore } from "@/stores/interview.store";
import { useAuthStore } from "@/stores/auth.store";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

interface UseInterviewWSOptions {
  sessionId: string;
  onFeedback?: (data: any) => void;
  onSessionComplete?: () => void;
  onError?: (msg: string) => void;
}

export function useInterviewWebSocket({
  sessionId,
  onFeedback,
  onSessionComplete,
  onError,
}: UseInterviewWSOptions) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const { accessToken } = useAuthStore();
  const {
    setWsConnected,
    setIsStreaming,
    updateStreamingMessage,
    finalizeStreamingMessage,
    setIsProcessing,
  } = useInterviewStore();

  const streamBuffer = useRef("");
  const currentQuestionId = useRef<string | undefined>(undefined);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(`${WS_URL}/ws/interview/${sessionId}`);
    ws.current = socket;

    socket.onopen = () => {
      // Send auth immediately
      socket.send(JSON.stringify({ type: "auth", token: accessToken }));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "connected":
            setWsConnected(true);
            break;

          case "processing":
            setIsProcessing(true);
            break;

          case "question_start":
            currentQuestionId.current = msg.question_id;
            streamBuffer.current = "";
            setIsStreaming(true);
            setIsProcessing(false);
            break;

          case "token":
            streamBuffer.current += msg.content;
            updateStreamingMessage(msg.content);
            break;

          case "question_end":
            finalizeStreamingMessage(streamBuffer.current, msg.question_id);
            streamBuffer.current = "";
            break;

          case "feedback":
            setIsProcessing(false);
            onFeedback?.(msg);
            break;

          case "session_complete":
            setIsProcessing(false);
            setWsConnected(false);
            onSessionComplete?.();
            break;

          case "error":
            setIsProcessing(false);
            onError?.(msg.message);
            break;

          case "pong":
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    socket.onclose = () => {
      setWsConnected(false);
      // Attempt reconnect after 3s
      reconnectTimer.current = setTimeout(() => {
        if (ws.current?.readyState !== WebSocket.OPEN) {
          connect();
        }
      }, 3000);
    };

    socket.onerror = () => {
      setWsConnected(false);
    };
  }, [sessionId, accessToken]);

  const sendAnswer = useCallback(
    (content: string, code?: string, language?: string, timeTaken = 0) => {
      if (ws.current?.readyState !== WebSocket.OPEN) return;
      ws.current.send(
        JSON.stringify({ type: "answer", content, code, language, time_taken: timeTaken })
      );
    },
    []
  );

  const ping = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "ping" }));
    }
  }, []);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    ws.current?.close();
    ws.current = null;
    setWsConnected(false);
  }, []);

  useEffect(() => {
    connect();
    const pingInterval = setInterval(ping, 25_000);
    return () => {
      clearInterval(pingInterval);
      disconnect();
    };
  }, [connect, disconnect, ping]);

  return { sendAnswer, disconnect };
}
