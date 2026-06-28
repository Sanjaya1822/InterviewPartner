import { create } from "zustand";

export interface Message {
  id: string;
  role: "ai" | "human";
  content: string;
  questionId?: string;
  timestamp: string;
  isStreaming?: boolean;
}

export interface QuestionFeedback {
  questionId: string;
  answerId: string;
  score: number;
  technicalScore?: number;
  communicationScore?: number;
  confidenceScore?: number;
  codeQualityScore?: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  timeComplexity?: string;
  spaceComplexity?: string;
}

interface InterviewSession {
  sessionId: string;
  jobRole: string;
  experienceLevel: string;
  difficulty: string;
  interviewType: string;
  companyName?: string;
  personality: string;
  questionNumber: number;
  totalQuestions: number;
  currentQuestionId?: string;
  currentQuestionType?: string;
  currentCategory?: string;
  isComplete: boolean;
  startedAt: string;
}

interface InterviewState {
  session: InterviewSession | null;
  messages: Message[];
  currentFeedback: QuestionFeedback | null;
  isProcessing: boolean;
  streamingContent: string;
  isStreaming: boolean;
  wsConnected: boolean;
  
  // Actions
  setSession: (session: InterviewSession) => void;
  addMessage: (message: Message) => void;
  updateStreamingMessage: (content: string) => void;
  finalizeStreamingMessage: (finalContent: string, questionId?: string) => void;
  setCurrentFeedback: (feedback: QuestionFeedback | null) => void;
  setIsProcessing: (v: boolean) => void;
  setIsStreaming: (v: boolean) => void;
  setWsConnected: (v: boolean) => void;
  completeSession: () => void;
  resetInterview: () => void;
}

export const useInterviewStore = create<InterviewState>((set, get) => ({
  session: null,
  messages: [],
  currentFeedback: null,
  isProcessing: false,
  streamingContent: "",
  isStreaming: false,
  wsConnected: false,

  setSession: (session) => set({ session }),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateStreamingContent: (content: string) =>
    set((state) => ({ streamingContent: state.streamingContent + content })),

  updateStreamingMessage: (token: string) =>
    set((state) => ({ streamingContent: state.streamingContent + token })),

  finalizeStreamingMessage: (finalContent, questionId) => {
    const message: Message = {
      id: `ai_${Date.now()}`,
      role: "ai",
      content: finalContent,
      questionId,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      messages: [...state.messages, message],
      streamingContent: "",
      isStreaming: false,
    }));
  },

  setCurrentFeedback: (feedback) => set({ currentFeedback: feedback }),
  setIsProcessing: (v) => set({ isProcessing: v }),
  setIsStreaming: (v) => set({ isStreaming: v, streamingContent: v ? "" : get().streamingContent }),
  setWsConnected: (v) => set({ wsConnected: v }),

  completeSession: () =>
    set((state) => ({
      session: state.session ? { ...state.session, isComplete: true } : null,
    })),

  resetInterview: () =>
    set({
      session: null,
      messages: [],
      currentFeedback: null,
      isProcessing: false,
      streamingContent: "",
      isStreaming: false,
      wsConnected: false,
    }),
}));
