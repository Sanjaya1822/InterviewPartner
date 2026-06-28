import axios, { AxiosInstance, AxiosError } from "axios";
import toast from "react-hot-toast";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 60000,
});

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value?: unknown) => void; reject: (reason?: any) => void }> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor — handle errors globally
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ detail: string }>) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes("/auth/refresh") || originalRequest.url?.includes("/auth/login")) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });
          localStorage.setItem("access_token", data.access_token);
          localStorage.setItem("refresh_token", data.refresh_token);
          
          processQueue(null, data.access_token);
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          return api(originalRequest);
        } catch (err) {
          processQueue(err as Error, null);
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
          return Promise.reject(err);
        } finally {
          isRefreshing = false;
        }
      }

      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Auth API
// ─────────────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: { email: string; username: string; full_name?: string; password: string }) =>
    api.post("/auth/register", data),

  login: (data: { email: string; password: string }) =>
    api.post("/auth/login", data),

  refresh: (refresh_token: string) =>
    api.post("/auth/refresh", { refresh_token }),

  googleLogin: (code: string) =>
    api.post("/auth/google", { code }),

  getMe: () =>
    api.get("/auth/me"),

  changePassword: (current_password: string, new_password: string) =>
    api.put("/auth/password", { current_password, new_password }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Resumes API
// ─────────────────────────────────────────────────────────────────────────────

export const resumeApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/resumes/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  list: () => api.get("/resumes/"),

  get: (id: string) => api.get(`/resumes/${id}`),

  delete: (id: string) => api.delete(`/resumes/${id}`),
};

// ─────────────────────────────────────────────────────────────────────────────
// Interviews API
// ─────────────────────────────────────────────────────────────────────────────

export const interviewApi = {
  start: (config: {
    job_role: string;
    experience_level: string;
    difficulty: string;
    interview_type: string;
    duration_minutes: number;
    company_name?: string;
    resume_id?: string;
    personality?: string;
  }) => api.post("/interviews/start", config),

  submitAnswer: (
    session_id: string,
    data: {
      answer_text: string;
      code_snippet?: string;
      language?: string;
      time_taken_seconds?: number;
    }
  ) => api.post(`/interviews/${session_id}/answer`, data),

  list: (status?: string, skip = 0, limit = 20) =>
    api.get("/interviews/", { params: { status_filter: status, skip, limit } }),

  get: (id: string) => api.get(`/interviews/${id}`),

  end: (id: string) => api.post(`/interviews/${id}/end`),

  getQuestions: (id: string) => api.get(`/interviews/${id}/questions`),

  executeCode: (data: {
    code: string;
    language: string;
    question_id?: string;
  }) => api.post("/interviews/code/execute", data),

  // Voice interview: get AI hint when user is silent
  getHint: (session_id: string, hint_level: 1 | 2 | 3) =>
    api.get(`/interviews/${session_id}/hint`, { params: { hint_level } }),

  // Get current timer state from backend (for sync)
  getTimer: (session_id: string) =>
    api.get(`/interviews/${session_id}/timer`),

  // Report proctoring violations
  reportViolations: (session_id: string, violations: any[]) =>
    api.post(`/interviews/${session_id}/violations`, violations),
};

// ─────────────────────────────────────────────────────────────────────────────
// Analytics API
// ─────────────────────────────────────────────────────────────────────────────

export const analyticsApi = {
  getDashboard: () => api.get("/analytics/dashboard"),

  getSessionReport: (session_id: string) =>
    api.get(`/analytics/sessions/${session_id}/report`),

  generatePdf: (report_id: string) =>
    api.post(`/analytics/reports/${report_id}/pdf`),

  downloadPdf: (report_id: string) =>
    `${BASE_URL}/api/v1/analytics/reports/${report_id}/pdf/download`,
};

export default api;
