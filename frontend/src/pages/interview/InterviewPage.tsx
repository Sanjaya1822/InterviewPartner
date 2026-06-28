import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Loader2, Brain, Code2, Mic, MicOff,
  CheckCircle2, ChevronDown, ChevronUp, Video,
  Clock, Target, ArrowRight, Keyboard, AlertTriangle, HelpCircle, SkipForward, MessageSquare,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useInterviewStore } from "@/stores/interview.store";
import { interviewApi } from "@/services/api";
import { cn, scoreToColor, interviewTypeLabel } from "@/lib/utils";
import CodeEditor from "@/components/interview/CodeEditor";
import FeedbackPanel from "@/components/interview/FeedbackPanel";
import TypingIndicator from "@/components/interview/TypingIndicator";
import VoiceInterface from "@/components/interview/VoiceInterface";
import VirtualInterface from "@/components/interview/VirtualInterface";
import { useInterviewTimer } from "@/hooks/useInterviewTimer";

// Interview mode: text vs voice vs virtual
type InterviewMode = "text" | "voice" | "virtual";

export default function InterviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    session, messages, currentFeedback, isProcessing, streamingContent, isStreaming,
    setSession, addMessage, finalizeStreamingMessage, setCurrentFeedback, setIsProcessing,
    setIsStreaming, updateStreamingMessage, resetInterview,
  } = useInterviewStore();

  const [answer, setAnswer] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [activeTab, setActiveTab] = useState("text");
  const [showFeedback, setShowFeedback] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [mode, setMode] = useState<InterviewMode>("text"); // will be overridden in useEffect
  const [showSilenceDialog, setShowSilenceDialog] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(1800); // 30 min default
  const [timeBudget, setTimeBudget] = useState(1800);
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [warningText, setWarningText] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const questionStartTime = useRef(Date.now());

  // ── Countdown timer ──────────────────────────────────────────────────────────
  const timer = useInterviewTimer({
    durationSeconds,
    autoStart: false,
    onTimeWarning: (secondsLeft) => {
      const minutes = Math.ceil(secondsLeft / 60);
      setWarningText(`⏱️ ${minutes} minute${minutes > 1 ? "s" : ""} remaining!`);
      setShowTimeWarning(true);
      toast(`${minutes} minute${minutes > 1 ? "s" : ""} remaining`, {
        icon: "⏱️",
        duration: 4000,
      });
      setTimeout(() => setShowTimeWarning(false), 6000);
    },
    onTimeUp: async () => {
      toast("⏰ Time's up! Interview ended.", { duration: 5000 });
      setIsComplete(true);
      try {
        await interviewApi.end(sessionId!);
      } catch { /* best effort */ }
    },
  });

  // ── Initialize session from navigation state ─────────────────────────────────
  useEffect(() => {
    // Reset stale interview state from any previous session
    resetInterview();

    if (location.state) {
      const { firstQuestion, questionNumber, totalQuestions, sessionInfo } = location.state as any;
      const budgetSecs = (sessionInfo?.duration_minutes || 30) * 60;
      const timeBudgetSecs = sessionInfo?.time_budget_seconds || budgetSecs;

      setDurationSeconds(timeBudgetSecs);
      setTimeBudget(timeBudgetSecs);

      // Apply interview mode chosen by user on setup page
      if (sessionInfo?.interview_mode) {
        setMode(sessionInfo.interview_mode as InterviewMode);
      }

      setSession({
        sessionId: sessionId!,
        jobRole: sessionInfo?.job_role || "",
        experienceLevel: sessionInfo?.experience_level || "",
        difficulty: sessionInfo?.difficulty || "medium",
        interviewType: sessionInfo?.interview_type || "technical",
        companyName: sessionInfo?.company_name,
        personality: sessionInfo?.personality || "professional",
        questionNumber,
        totalQuestions,
        currentQuestionId: sessionInfo?.question_id,
        currentQuestionType: sessionInfo?.question_type,
        currentCategory: sessionInfo?.category,
        isComplete: false,
        startedAt: new Date().toISOString(),
      });
      addMessage({
        id: `ai_init`,
        role: "ai",
        content: firstQuestion,
        questionId: sessionInfo?.question_id,
        timestamp: new Date().toISOString(),
      });

      // Start countdown
      setTimeout(() => timer.start(), 500);
    } else if (sessionId) {
      // Page was refreshed — redirect to report/history for this session
      navigate(`/history/${sessionId}`, { replace: true });
    }
    questionStartTime.current = Date.now();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // ── Current question text (last AI message) ──────────────────────────────────
  const currentQuestion = messages.filter((m) => m.role === "ai").at(-1)?.content || "";

  // ── Submit answer (shared between text and voice modes) ──────────────────────
  const handleSubmit = useCallback(async (answerContent?: string) => {
    const content = answerContent ?? (activeTab === "code" ? code : answer);
    if (!content.trim()) {
      toast.error("Please provide an answer");
      return;
    }

    const timeTaken = Math.round((Date.now() - questionStartTime.current) / 1000);

    addMessage({
      id: `human_${Date.now()}`,
      role: "human",
      content:
        activeTab === "code"
          ? `[Code: ${language}]\n\`\`\`${language}\n${code}\n\`\`\``
          : content,
      timestamp: new Date().toISOString(),
    });

    setAnswer("");
    setCode("");
    setIsProcessing(true);
    setShowFeedback(false);

    try {
      const { data: feedback } = await interviewApi.submitAnswer(sessionId!, {
        answer_text:
          activeTab === "code" ? `Code submission in ${language}` : content,
        code_snippet: activeTab === "code" ? code : undefined,
        language: activeTab === "code" ? language : undefined,
        time_taken_seconds: timeTaken,
      });

      setIsProcessing(false);
      setCurrentFeedback({
        questionId: feedback.question_id || "",
        answerId: feedback.answer_id || "",
        score: feedback.score,
        technicalScore: feedback.technical_score,
        communicationScore: feedback.communication_score,
        confidenceScore: feedback.confidence_score,
        codeQualityScore: feedback.code_quality_score,
        feedback: feedback.feedback,
        strengths: feedback.strengths || [],
        improvements: feedback.improvements || [],
        timeComplexity: feedback.time_complexity,
        spaceComplexity: feedback.space_complexity,
      });
      setShowFeedback(true);

      if (feedback.session_complete) {
        setIsComplete(true);
        timer.stop();
        const currentSession = useInterviewStore.getState().session;
        if (currentSession) setSession({ ...currentSession, isComplete: true });
      } else if (feedback.next_question) {
        const nq = feedback.next_question;
        if (mode === "voice" || mode === "virtual") {
          finalizeStreamingMessage(nq.question_text.trim(), nq.question_id);
        } else {
          setIsStreaming(true);
          const words = nq.question_text.split(" ");
          for (const word of words) {
            updateStreamingMessage(word + " ");
            await sleep(12);
          }
          setIsStreaming(false);
          finalizeStreamingMessage(nq.question_text.trim(), nq.question_id);
        }

        const currentSession = useInterviewStore.getState().session;
        if (currentSession) {
          setSession({
            ...currentSession,
            questionNumber: nq.question_number,
            currentQuestionId: nq.question_id,
            currentQuestionType: nq.question_type,
            currentCategory: nq.category,
          });
        }
        questionStartTime.current = Date.now();
      }
    } catch (err: any) {
      setIsProcessing(false);
      toast.error(err?.response?.data?.detail || "Failed to process answer");
    }
  }, [activeTab, answer, code, language, mode, sessionId]);

  const handleEndInterview = async () => {
    timer.stop();
    try {
      await interviewApi.end(sessionId!);
      navigate(`/history/${sessionId}`, { state: { fromInterview: true } });
    } catch {
      navigate(`/history/${sessionId}`);
    }
  };

  // ── 90-second silence: show continue/skip dialog ────────────────────────────
  const handleSilenceMaxReached = useCallback(() => {
    if ((mode === "voice" || mode === "virtual") && !isProcessing && !isComplete) {
      setShowSilenceDialog(true);
    }
  }, [mode, isProcessing, isComplete]);

  // Called when user clicks "Skip to Next Question" in the dialog
  const handleSkipQuestion = useCallback(async () => {
    setShowSilenceDialog(false);
    await handleSubmit("[No response — candidate skipped this question]");
  }, [handleSubmit]);

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  const progress = (session.questionNumber / session.totalQuestions) * 100;

  return (
    <div className="max-w-5xl mx-auto space-y-4">

      {/* Time warning banner */}
      <AnimatePresence>
        {showTimeWarning && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
          >
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-300">{warningText}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10">
            <Brain className="h-5 w-5 text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-semibold">{session.jobRole}</p>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs h-5">{interviewTypeLabel(session.interviewType)}</Badge>
              <Badge variant="outline" className="text-xs h-5 capitalize">{session.difficulty}</Badge>
              {session.companyName && (
                <Badge variant="info" className="text-xs h-5">{session.companyName}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Question progress */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Target className="h-4 w-4" />
            <span className="font-medium text-foreground">{session.questionNumber}</span>/{session.totalQuestions}
          </div>

          {/* Countdown Timer */}
          <div className={cn(
            "flex items-center gap-1.5 text-sm font-mono font-semibold px-3 py-1 rounded-lg transition-colors",
            timer.isCritical
              ? "bg-red-500/10 text-red-400 border border-red-500/30"
              : timer.isWarning
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
              : "text-muted-foreground"
          )}>
            <Clock className={cn(
              "h-4 w-4",
              timer.isCritical ? "text-red-400 animate-pulse" : timer.isWarning ? "text-amber-400" : ""
            )} />
            <span>{timer.formattedTime}</span>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-border/60 p-1 bg-card/50 backdrop-blur-sm">
            <Button
              variant={mode === "text" ? "secondary" : "ghost"}
              size="sm"
              className={cn("h-7 gap-1.5 text-xs", mode === "text" && "bg-background shadow-sm")}
              onClick={() => setMode("text")}
            >
              <Keyboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Text</span>
            </Button>
            <Button
              variant={mode === "voice" ? "secondary" : "ghost"}
              size="sm"
              className={cn("h-7 gap-1.5 text-xs", mode === "voice" && "bg-background shadow-sm")}
              onClick={() => setMode("voice")}
            >
              <Mic className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Voice</span>
            </Button>
            <Button
              variant={mode === "virtual" ? "secondary" : "ghost"}
              size="sm"
              className={cn("h-7 gap-1.5 text-xs", mode === "virtual" && "bg-background shadow-sm")}
              onClick={() => setMode("virtual")}
            >
              <Video className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Virtual</span>
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={handleEndInterview} className="text-xs">
            End Interview
          </Button>
        </div>
      </div>

      {/* Progress bar (time-based) */}
      <Progress
        value={timer.progressPercent}
        className={cn(
          "h-1.5 transition-colors",
          timer.isCritical ? "[&>div]:bg-red-500" : timer.isWarning ? "[&>div]:bg-amber-500" : ""
        )}
      />

      {isComplete ? (
        <CompletionScreen sessionId={sessionId!} onViewReport={() => navigate(`/history/${sessionId}`)} />
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Chat / Question panel */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="min-h-[420px] flex flex-col">
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}

                  {/* Streaming token display */}
                  {isStreaming && streamingContent && (
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/10">
                        <Brain className="h-4 w-4 text-brand-400" />
                      </div>
                      <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3 max-w-[85%]">
                        <p className="text-sm leading-relaxed">
                          {streamingContent}
                          <span className="animate-blink inline-block w-0.5 h-4 bg-brand-400 ml-0.5 align-middle" />
                        </p>
                      </div>
                    </div>
                  )}

                  {isProcessing && !isStreaming && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
            </Card>

            {/* Answer input — text mode */}
            {mode === "text" && (
              <Card>
                <CardContent className="p-4">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="flex items-center justify-between mb-3">
                      <TabsList className="h-8">
                        <TabsTrigger value="text" className="text-xs h-7">Text Answer</TabsTrigger>
                        {(session.interviewType === "coding" || session.currentQuestionType === "coding") && (
                          <TabsTrigger value="code" className="text-xs h-7 gap-1">
                            <Code2 className="h-3 w-3" />Code
                          </TabsTrigger>
                        )}
                      </TabsList>
                      {session.currentCategory && (
                        <Badge variant="outline" className="text-xs">{session.currentCategory}</Badge>
                      )}
                    </div>

                    <TabsContent value="text" className="mt-0">
                      <Textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Type your answer here… Be detailed and specific."
                        className="min-h-[120px] resize-none text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && e.ctrlKey) handleSubmit();
                        }}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Ctrl+Enter to submit</p>
                    </TabsContent>

                    <TabsContent value="code" className="mt-0">
                      <CodeEditor
                        code={code}
                        onChange={setCode}
                        language={language}
                        onLanguageChange={setLanguage}
                        sessionId={sessionId!}
                      />
                    </TabsContent>
                  </Tabs>

                  <div className="flex justify-end mt-3">
                    <Button
                      onClick={() => handleSubmit()}
                      disabled={isProcessing || isStreaming}
                      className="gap-2"
                    >
                      {isProcessing ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Processing…</>
                      ) : (
                        <><Send className="h-4 w-4" />Submit Answer</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Answer input — voice mode */}
            {mode === "voice" && (
              <Card>
                <CardContent className="p-4">
                  <VoiceInterface
                    sessionId={sessionId!}
                    currentQuestion={currentQuestion}
                    isProcessing={isProcessing || isStreaming}
                    onAnswerSubmit={handleSubmit}
                    onToggleMode={() => setMode("text")}
                    onSilenceMaxReached={handleSilenceMaxReached}
                  />
                </CardContent>
              </Card>
            )}

            {/* Answer input — virtual mode */}
            {mode === "virtual" && (
              <Card>
                <CardContent className="p-4">
                  <VirtualInterface
                    sessionId={sessionId!}
                    currentQuestion={currentQuestion}
                    isProcessing={isProcessing || isStreaming}
                    onAnswerSubmit={handleSubmit}
                    onToggleMode={() => setMode("text")}
                    onSilenceMaxReached={handleSilenceMaxReached}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right sidebar — feedback + session info */}
          <div>
            <AnimatePresence>
              {showFeedback && currentFeedback ? (
                <FeedbackPanel feedback={currentFeedback} />
              ) : (
                <Card className="p-5">
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Session Info</p>
                    {[
                      ["Role", session.jobRole],
                      ["Level", session.experienceLevel],
                      ["Type", interviewTypeLabel(session.interviewType)],
                      ["Personality", session.personality],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium capitalize">{val}</span>
                      </div>
                    ))}

                    {/* Time remaining mini bar */}
                    <div className="pt-2 border-t border-border/40 space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Time Remaining</span>
                        <span className={cn(
                          "font-mono font-semibold",
                          timer.isCritical ? "text-red-400" : timer.isWarning ? "text-amber-400" : "text-foreground"
                        )}>{timer.formattedTime}</span>
                      </div>
                      <Progress
                        value={timer.progressPercent}
                        className={cn(
                          "h-1.5",
                          timer.isCritical ? "[&>div]:bg-red-500" : timer.isWarning ? "[&>div]:bg-amber-500" : ""
                        )}
                      />
                    </div>

                    <div className="pt-2 border-t border-border/40">
                      <p className="text-xs text-muted-foreground mb-1.5">Tips for better answers:</p>
                      <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                        <li>Be specific with examples</li>
                        <li>For behavioral: use STAR method</li>
                        <li>State assumptions for technical</li>
                        <li>Think aloud — explain your reasoning</li>
                      </ul>
                    </div>
                  </div>
                </Card>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ── 90-Second Silence Dialog ────────────────────────────────────────── */}
      <AnimatePresence>
        {showSilenceDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="w-full max-w-sm rounded-2xl border border-border/60 bg-card shadow-2xl p-6"
            >
              {/* Icon */}
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 mx-auto mb-4">
                <HelpCircle className="h-7 w-7 text-amber-400" />
              </div>

              {/* Content */}
              <div className="text-center mb-6">
                <h3 className="text-lg font-bold mb-1">Still there?</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  No response detected for <strong>90 seconds</strong>.
                  Would you like to keep answering, or move on to the next question?
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setShowSilenceDialog(false)}
                >
                  <MessageSquare className="h-4 w-4" />
                  Continue Answering
                </Button>
                <Button
                  variant="default"
                  className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={handleSkipQuestion}
                  disabled={isProcessing}
                >
                  <SkipForward className="h-4 w-4" />
                  {isProcessing ? "Skipping…" : "Skip to Next Question"}
                </Button>
              </div>

              {/* Dismiss note */}
              <p className="text-center text-xs text-muted-foreground mt-4">
                Pressing <strong>Continue</strong> keeps the microphone active.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React from "react";

const MessageBubble = React.memo(function MessageBubble({ message }: { message: any }) {
  const isAI = message.role === "ai";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-3", isAI ? "" : "flex-row-reverse")}
    >
      <div className={cn(
        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        isAI ? "bg-brand-500/10 text-brand-400" : "bg-secondary text-secondary-foreground"
      )}>
        {isAI ? <Brain className="h-4 w-4" /> : "You"}
      </div>
      <div className={cn(
        "rounded-2xl px-4 py-3 max-w-[85%] text-sm leading-relaxed",
        isAI ? "rounded-tl-sm bg-muted/60" : "rounded-tr-sm bg-brand-500/10 text-foreground"
      )}>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </motion.div>
  );
});

const CompletionScreen = React.memo(function CompletionScreen({ sessionId, onViewReport }: { sessionId: string; onViewReport: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 mb-6">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Interview Complete!</h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        Great job completing the interview. Your detailed performance report is ready with scores,
        feedback, and a personalized learning roadmap.
      </p>
      <Button variant="gradient" size="lg" className="gap-2" onClick={onViewReport}>
        View Full Report <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  );
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
