import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import NewInterviewPage from "@/pages/interview/NewInterviewPage";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

const InterviewPage = lazy(() => import("@/pages/interview/InterviewPage"));
const ReportPage = lazy(() => import("@/pages/ReportPage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
  </div>
);

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/interview/new" element={<NewInterviewPage />} />
          <Route path="/interview/:sessionId" element={
            <Suspense fallback={<PageLoader />}>
              <InterviewPage />
            </Suspense>
          } />
          <Route path="/history" element={
            <Suspense fallback={<PageLoader />}>
              <HistoryPage />
            </Suspense>
          } />
          <Route path="/history/:sessionId" element={
            <Suspense fallback={<PageLoader />}>
              <ReportPage />
            </Suspense>
          } />
          <Route path="/settings" element={
            <Suspense fallback={<PageLoader />}>
              <SettingsPage />
            </Suspense>
          } />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
