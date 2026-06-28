// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resume
// ─────────────────────────────────────────────────────────────────────────────

export type ResumeStatus = "pending" | "processing" | "ready" | "error";

export interface ResumeListItem {
  id: string;
  filename: string;
  file_size: number;
  status: ResumeStatus;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interview
// ─────────────────────────────────────────────────────────────────────────────

export type InterviewType = "hr" | "technical" | "mixed" | "company_specific" | "coding";
export type Difficulty = "easy" | "medium" | "hard";
export type ExperienceLevel = "fresher" | "1year" | "2years" | "senior";
export type SessionStatus = "active" | "completed" | "abandoned" | "paused";

export interface InterviewSessionDetail {
  id: string;
  user_id: string;
  job_role: string;
  experience_level: string;
  difficulty: string;
  interview_type: string;
  duration_minutes: number;
  company_name?: string;
  personality: string;
  status: SessionStatus;
  current_question_index: number;
  total_questions: number;
  overall_score?: number;
  technical_score?: number;
  communication_score?: number;
  confidence_score?: number;
  problem_solving_score?: number;
  code_quality_score?: number;
  grammar_score?: number;
  hiring_recommendation?: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
}

export interface QuestionResponse {
  question_id: string;
  question_text: string;
  question_number: number;
  total_questions: number;
  question_type: string;
  category?: string;
  is_follow_up: boolean;
  is_last_question: boolean;
}

export interface AnswerFeedback {
  question_id: string;
  answer_id: string;
  score: number;
  technical_score?: number;
  communication_score?: number;
  confidence_score?: number;
  code_quality_score?: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  time_complexity?: string;
  space_complexity?: string;
  next_question?: QuestionResponse;
  session_complete: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoreDataPoint {
  date: string;
  score: number;
  session_id: string;
}

export interface SkillScore {
  skill: string;
  score: number;
  max_score: number;
  level: string;
}

export interface DashboardStats {
  total_sessions: number;
  completed_sessions: number;
  average_score: number;
  total_practice_minutes: number;
  best_score: number;
  current_streak_days: number;
  score_trend: ScoreDataPoint[];
  skill_breakdown: SkillScore[];
  topic_performance: Array<{
    topic: string;
    sessions_count: number;
    average_score: number;
    trend: string;
  }>;
  recent_sessions: InterviewSessionDetail[];
  weekly_goal: number;
  weekly_completed: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket
// ─────────────────────────────────────────────────────────────────────────────

export type WsMessageType =
  | "connected" | "processing" | "question_start" | "token"
  | "question_end" | "feedback" | "session_complete" | "error" | "pong";

export interface WsMessage {
  type: WsMessageType;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string;
  status_code?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
