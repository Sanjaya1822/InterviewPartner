import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Brain, Upload, ChevronRight, Loader2, X, CheckCircle2, FileText, AlertCircle, Mic, Keyboard, Video } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import api, { interviewApi, resumeApi } from "@/services/api";
import { cn } from "@/lib/utils";

const schema = z.object({
  job_role: z.string().min(1, "Select a role"),
  experience_level: z.string().min(1, "Select experience"),
  difficulty: z.string().min(1),
  interview_type: z.string().min(1),
  duration_minutes: z.number().min(10).max(120),
  company_name: z.string().optional(),
  resume_id: z.string().optional(),
  personality: z.string().min(1),
  interview_mode: z.enum(["voice", "text", "virtual"]).default("voice"),});
type FormData = z.infer<typeof schema>;

const INTERVIEW_MODES = [
  {
    value: "voice",
    label: "Voice Assisted",
    description: "AI speaks questions aloud. You answer with your voice — just like a real interview.",
    icon: Mic,
  },
  {
    value: "text",
    label: "Text Interview",
    description: "Read questions on screen and type your answers at your own pace.",
    icon: Keyboard,
  },
  {
    value: "virtual",
    label: "Virtual Interview",
    description: "Full camera and microphone setup with AI proctoring, exactly like a real video interview.",
    icon: Video,
  },
];

const JOB_ROLES = [
  "Software Engineer", "Frontend Developer", "Backend Developer",
  "Full Stack Developer", "ML Engineer", "Data Scientist",
  "DevOps Engineer", "Cloud Engineer", "Java Developer",
  "Python Developer", "HR", "Marketing", "Sales", "Business Analyst",
];

const EXPERIENCE_LEVELS = [
  { value: "fresher", label: "Fresher (0-1 yr)" },
  { value: "1year", label: "1 Year" },
  { value: "2years", label: "2 Years" },
  { value: "senior", label: "Senior (3+ yrs)" },
];

const INTERVIEW_TYPES = [
  { value: "hr", label: "HR / Behavioral" },
  { value: "technical", label: "Technical" },
  { value: "mixed", label: "Mixed" },
  { value: "coding", label: "Coding" },
  { value: "company_specific", label: "Company Specific" },
];

const DIFFICULTIES = ["easy", "medium", "hard"];

const DURATIONS = [10, 20, 30, 45, 60];

const COMPANIES = [
  "Google", "Amazon", "Microsoft", "Meta", "Netflix",
  "Apple", "TCS", "Infosys", "Accenture", "Capgemini",
];

const PERSONALITIES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "strict", label: "Strict" },
  { value: "google_style", label: "Google Style" },
  { value: "amazon_style", label: "Amazon Style" },
  { value: "startup_style", label: "Startup Style" },
];

export default function NewInterviewPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isStarting, setIsStarting] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [uploadedResume, setUploadedResume] = useState<{ id: string; name: string } | null>(null);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "processing" | "ready" | "error">("idle");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeApi.list().then((r) => r.data),
  });

  const {
    setValue, watch, handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      difficulty: "medium",
      duration_minutes: 30,
      personality: "professional",
      interview_mode: "voice",
    },
  });

  const interviewType = watch("interview_type");
  const difficulty = watch("difficulty");
  const personality = watch("personality");
  const duration = watch("duration_minutes");
  const interviewMode = watch("interview_mode");

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Max 10MB.");
      return;
    }

    setUploadingResume(true);
    setUploadStatus("uploading");
    setUploadProgress(5);

    try {
      const { data } = await resumeApi.upload(file);
      setUploadedResume({ id: data.id, name: file.name });
      setValue("resume_id", data.id);
      setUploadProgress(10);
      setUploadStatus("processing");
      toast.success("Resume uploaded! Processing resume...");

      // Poll for processing completion
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(async () => {
        try {
          const { data: status } = await api.get(`/resumes/status/${data.id}`);
          setUploadProgress(status.progress);
          if (status.status === "ready") {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            setUploadStatus("ready");
            setUploadingResume(false);
            toast.success("Resume processed and ready!");
          } else if (status.status === "error") {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            setUploadStatus("error");
            setUploadingResume(false);
            toast.error("Resume processing failed. You can still continue.");
          }
        } catch { /* ignore polling errors */ }
      }, 2000);

    } catch {
      toast.error("Resume upload failed");
      setUploadStatus("error");
      setUploadingResume(false);
    }
  };


  const onSubmit = async (data: FormData) => {
    // Block submission if resume is still being processed
    if (uploadStatus === "processing") {
      toast.error("Please wait for your resume to finish processing.");
      return;
    }

    setIsStarting(true);
    try {
      // Only send resume_id if it's ready
      const resumeId = uploadStatus === "ready"
        ? (uploadedResume?.id || data.resume_id)
        : data.resume_id;  // might be from previously-uploaded ready resume

      const { data: session } = await interviewApi.start({
        ...data,
        resume_id: resumeId,
      });
      navigate(`/interview/${session.session_id}`, {
        state: {
          firstQuestion: session.first_question,
          questionNumber: session.question_number,
          totalQuestions: session.total_questions,
          sessionInfo: {
            ...session.session_info,
            duration_minutes: data.duration_minutes,
            time_budget_seconds: session.time_budget_seconds,
            interview_mode: data.interview_mode,
          },
        },
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to start interview");
      setIsStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 rounded-lg border border-[#ded0ec] bg-[#fffaf1]/75 px-6 py-6 shadow-[0_18px_48px_rgba(97,63,139,0.08)] backdrop-blur">
        <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/10 text-primary">
          Interview setup
        </Badge>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#281c3a] mb-2">Configure Your Interview</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Customize your practice session to match your target role, timing, and preferred interview format.</p>
      </div>

      {/* Steps indicator */}
      <div className="mb-8 flex flex-wrap items-center gap-2 rounded-lg border border-[#e1d5ec] bg-white/55 p-2 shadow-sm">
        {["Role & Type", "Difficulty & Duration", "Resume & Style"].map((label, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                step > i + 1 ? "bg-primary text-white" : step === i + 1 ? "bg-primary text-white shadow-[0_8px_18px_rgba(132,87,211,0.26)]" : "bg-[#f1eadf] text-muted-foreground"
              )}
            >
              {step > i + 1 ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn("text-xs hidden sm:block", step === i + 1 ? "text-foreground font-semibold" : "text-muted-foreground")}>
              {label}
            </span>
            {i < 2 && <ChevronRight className="h-3 w-3 text-muted-foreground mx-1" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <AnimatePresence mode="wait">
          {/* Step 1 */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* ── Interview Mode Selection ── */}
              <div>
                <p className="text-sm font-semibold mb-3 text-[#281c3a]">How would you like to be interviewed?</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {INTERVIEW_MODES.map(({ value, label, description, icon: Icon }) => {
                    const isSelected = interviewMode === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setValue("interview_mode", value as "voice" | "text" | "virtual")}
                        className={cn(
                          "relative flex min-h-[164px] flex-col items-start gap-4 rounded-lg border p-5 text-left transition-all duration-200 shadow-sm",
                          isSelected
                            ? "border-primary bg-primary/10 shadow-[0_14px_34px_rgba(132,87,211,0.16)]"
                            : "border-[#e1d5ec] bg-white/65 hover:border-primary/35 hover:bg-white"
                        )}
                      >
                        <div className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
                          isSelected ? "bg-primary text-white" : "bg-[#f3ecfb] text-primary"
                        )}>
                          <Icon className={cn(
                            "h-5 w-5 transition-colors",
                            isSelected ? "text-white" : "text-primary"
                          )} />
                        </div>
                        <div>
                          <p className={cn(
                            "text-sm font-semibold",
                            isSelected ? "text-primary" : "text-foreground"
                          )}>
                            {label}
                          </p>
                          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                            {description}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                            <CheckCircle2 className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {interviewMode === "voice" && (
                  <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                    <Mic className="h-3 w-3 text-primary" />
                    Requires Chrome or Edge browser with microphone access
                  </p>
                )}
                {interviewMode === "virtual" && (
                  <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                    <Video className="h-3 w-3 text-primary" />
                    Requires camera + microphone access. Use Chrome or Edge.
                  </p>
                )}
              </div>

              <Card className="border-[#ded0ec] bg-white/72 shadow-[0_18px_48px_rgba(97,63,139,0.08)]">
                <CardContent className="p-6 space-y-5">
                  <div>
                    <Label>Job Role *</Label>
                    <Select onValueChange={(v) => setValue("job_role", v)}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {JOB_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.job_role && <p className="text-xs text-destructive mt-1">{errors.job_role.message}</p>}
                  </div>

                  <div>
                    <Label>Experience Level *</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                      {EXPERIENCE_LEVELS.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setValue("experience_level", value)}
                          className={cn(
                            "rounded-lg border p-3 text-sm text-left transition-colors",
                            watch("experience_level") === value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/70 bg-white/45 hover:border-primary/45"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {errors.experience_level && <p className="text-xs text-destructive">{errors.experience_level.message}</p>}
                  </div>

                  <div>
                    <Label>Interview Type *</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                      {INTERVIEW_TYPES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setValue("interview_type", value)}
                          className={cn(
                            "rounded-lg border p-3 text-sm text-left transition-colors",
                            interviewType === value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/70 bg-white/45 hover:border-primary/45"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {errors.interview_type && <p className="text-xs text-destructive">{errors.interview_type.message}</p>}
                  </div>

                  {interviewType === "company_specific" && (
                    <div>
                      <Label>Target Company</Label>
                      <Select onValueChange={(v) => setValue("company_name", v)}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Select company" />
                        </SelectTrigger>
                        <SelectContent>
                          {COMPANIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  if (!watch("job_role") || !watch("experience_level") || !watch("interview_type")) {
                    toast.error("Please fill in all required fields");
                    return;
                  }
                  setStep(2);
                }}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <Card className="border-[#ded0ec] bg-white/72 shadow-[0_18px_48px_rgba(97,63,139,0.08)]">
                <CardContent className="p-6 space-y-5">
                  <div>
                    <Label>Difficulty</Label>
                    <div className="flex gap-2 mt-1.5">
                      {DIFFICULTIES.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setValue("difficulty", d)}
                          className={cn(
                            "flex-1 rounded-lg border py-2.5 text-sm font-medium capitalize transition-colors",
                            difficulty === d
                              ? d === "easy" ? "border-green-500 bg-green-500/10 text-green-500"
                                : d === "medium" ? "border-yellow-500 bg-yellow-500/10 text-yellow-500"
                                : "border-red-500 bg-red-500/10 text-red-500"
                              : "border-border/70 bg-white/45 hover:border-primary/45"
                          )}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>Duration</Label>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {DURATIONS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setValue("duration_minutes", d)}
                          className={cn(
                            "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                            duration === d
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/70 bg-white/45 hover:border-primary/45"
                          )}
                        >
                          {d}m
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>Interviewer Personality</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                      {PERSONALITIES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setValue("personality", value)}
                          className={cn(
                            "rounded-lg border p-2.5 text-sm text-left transition-colors",
                            personality === value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/70 bg-white/45 hover:border-primary/45"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="button" className="flex-1" onClick={() => setStep(3)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <Card className="border-[#ded0ec] bg-white/72 shadow-[0_18px_48px_rgba(97,63,139,0.08)]">
                <CardContent className="p-6 space-y-5">
                  {/* Resume upload */}
                  <div>
                    <Label className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      Resume <span className="text-muted-foreground text-xs">(optional — personalizes questions)</span>
                    </Label>

                    {uploadedResume ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                          {uploadStatus === "processing" ? (
                            <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
                          ) : uploadStatus === "error" ? (
                            <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm truncate block">{uploadedResume.name}</span>
                            {uploadStatus === "processing" && (
                              <div className="mt-1.5 space-y-1">
                                <Progress value={uploadProgress} className="h-1.5" />
                                <p className="text-xs text-muted-foreground">
                                  Analyzing resume… {uploadProgress}%
                                </p>
                              </div>
                            )}
                            {uploadStatus === "error" && (
                              <p className="text-xs text-amber-400 mt-0.5">
                                Processing failed — interview will proceed without resume context
                              </p>
                            )}
                            {uploadStatus === "ready" && (
                              <p className="text-xs text-green-500 mt-0.5">Ready ✓</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setUploadedResume(null);
                              setValue("resume_id", undefined);
                              setUploadStatus("idle");
                              setUploadProgress(0);
                            }}
                            className="ml-auto text-muted-foreground hover:text-foreground flex-shrink-0"
                            disabled={uploadStatus === "processing"}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="mt-2 flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border/70 bg-white/45 hover:border-primary/45 p-6 cursor-pointer transition-colors">
                        {uploadingResume ? (
                          <Loader2 className="h-6 w-6 text-primary animate-spin" />
                        ) : (
                          <Upload className="h-6 w-6 text-muted-foreground" />
                        )}
                        <span className="text-sm text-muted-foreground text-center">
                          {uploadingResume ? "Uploading…" : "Click to upload PDF or DOCX (max 10MB)"}
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.docx,.doc"
                          className="hidden"
                          onChange={handleResumeUpload}
                          disabled={uploadingResume}
                        />
                      </label>
                    )}

                    {/* Or select existing */}
                    {(resumes?.length ?? 0) > 0 && !uploadedResume && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-2">Or select a previous resume:</p>
                        <Select onValueChange={(v) => setValue("resume_id", v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose resume" />
                          </SelectTrigger>
                          <SelectContent>
                            {resumes!.map((r: any) => (
                              <SelectItem key={r.id} value={r.id} disabled={r.status !== "ready"}>
                                {r.filename} {r.status !== "ready" ? `(${r.status})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Summary */}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Interview Summary</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {[
                        ["Mode", interviewMode === "voice" ? "🎤 Voice Assisted" : interviewMode === "virtual" ? "🎥 Virtual Interview" : "⌨️ Text Interview"],
                        ["Role", watch("job_role")],
                        ["Experience", watch("experience_level")],
                        ["Type", watch("interview_type")],
                        ["Difficulty", watch("difficulty")],
                        ["Duration", `${watch("duration_minutes")}m`],
                        ["Personality", watch("personality")],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <span className="text-muted-foreground">{label}: </span>
                          <span className="font-medium capitalize">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button type="submit" variant="gradient" className="flex-1 gap-2" disabled={isStarting}>
                  {isStarting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Starting…</>
                  ) : (
                    <><Brain className="h-4 w-4" />Start Interview</>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
