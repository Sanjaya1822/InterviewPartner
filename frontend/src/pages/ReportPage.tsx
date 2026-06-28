import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Trophy, TrendingUp, AlertCircle, BookOpen, Download, Loader2,
  CheckCircle2, Target, Brain, ArrowLeft, Calendar, Map, BarChart2
} from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
} from "recharts";
import toast from "react-hot-toast";
import { analyticsApi, interviewApi } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  scoreToColor, scoreToLabel, scoreToBgColor, recommendationToLabel,
  recommendationToColor, interviewTypeLabel, formatDate, formatDuration,
} from "@/lib/utils";

export default function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => interviewApi.get(sessionId!).then((r) => r.data),
    enabled: !!sessionId,
  });

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["report", sessionId],
    queryFn: () => analyticsApi.getSessionReport(sessionId!).then((r) => r.data),
    enabled: !!sessionId,
    retry: 2,
  });

  const { data: questions } = useQuery({
    queryKey: ["session-questions", sessionId],
    queryFn: () => interviewApi.getQuestions(sessionId!).then((r) => r.data),
    enabled: !!sessionId,
  });

  const handleDownloadPdf = async () => {
    if (!report?.pdf_url && session) {
      toast.loading("Generating PDF…", { id: "pdf" });
      try {
        const reportId = await getReportId();
        if (!reportId) throw new Error("No report ID");
        await analyticsApi.generatePdf(reportId);
        const url = analyticsApi.downloadPdf(reportId);
        window.open(url, "_blank");
        toast.success("PDF ready!", { id: "pdf" });
      } catch (err) {
        toast.error("PDF generation failed", { id: "pdf" });
      }
    } else if (report?.pdf_url) {
      window.open(report.pdf_url, "_blank");
    }
  };

  const getReportId = async () => {
    // extract report_id from pdf_url or re-fetch
    return report?.pdf_url?.split("/").at(-2) ?? null;
  };

  if (sessionLoading || reportLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  if (!session) return <div className="text-center py-20">Session not found</div>;

  const score = session.overall_score ?? 0;

  // Use score_breakdown from report as fallback when session scores are null
  const sb = report?.score_breakdown || {};
  const techScore    = session.technical_score     ?? sb.technical     ?? null;
  const commScore    = session.communication_score ?? sb.communication ?? null;
  const confScore    = session.confidence_score    ?? sb.confidence    ?? null;
  const probScore    = session.problem_solving_score ?? sb.problem_solving ?? null;
  const codeScore    = session.code_quality_score  ?? null;
  const gramScore    = session.grammar_score       ?? sb.grammar       ?? null;

  const radarData = [
    { skill: "Technical",        score: techScore ?? 0 },
    { skill: "Communication",    score: commScore ?? 0 },
    { skill: "Confidence",       score: confScore ?? 0 },
    { skill: "Problem Solving",  score: probScore ?? 0 },
    { skill: "Code Quality",     score: codeScore ?? 0 },
    { skill: "Grammar",          score: gramScore ?? 0 },
  ].filter((d) => d.score > 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <Link to="/history">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to History
          </Button>
        </Link>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadPdf}>
          <Download className="h-4 w-4" /> Export PDF
        </Button>
      </div>

      {/* Hero card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-brand-500 to-brand-700" />
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-brand-400" />
                  Interview Report
                </p>
                <h1 className="font-display text-2xl font-normal text-[#1e1230]">{session.job_role}</h1>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline">{interviewTypeLabel(session.interview_type)}</Badge>
                  <Badge variant="outline" className="capitalize">{session.difficulty}</Badge>
                  <Badge variant="outline" className="capitalize">{session.experience_level}</Badge>
                  {session.company_name && <Badge variant="info">{session.company_name}</Badge>}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {formatDate(session.started_at)}
                  </span>
                  {session.duration_seconds && (
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(session.duration_seconds)}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-center">
                <div className={`text-5xl font-bold ${scoreToColor(score)}`}>
                  {score.toFixed(0)}
                </div>
                <div className="text-sm text-muted-foreground mt-1">out of 100</div>
                <div className={`text-sm font-semibold mt-1 ${scoreToColor(score)}`}>
                  {scoreToLabel(score)}
                </div>
              </div>

              {session.hiring_recommendation && (
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Recommendation</div>
                  <div className={`text-base font-bold ${recommendationToColor(session.hiring_recommendation)}`}>
                    {recommendationToLabel(session.hiring_recommendation)}
                  </div>
                  {report?.interview_readiness && (
                    <div className="text-xs text-muted-foreground mt-1 capitalize">
                      {report.interview_readiness.replace("_", " ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="confidence">Confidence</TabsTrigger>
          <TabsTrigger value="questions">Model Answers</TabsTrigger>
          <TabsTrigger value="roadmap">Study Plan</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Score breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2Icon /> Score Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Technical Knowledge",  val: techScore },
                  { label: "Communication",        val: commScore },
                  { label: "Confidence",           val: confScore },
                  { label: "Problem Solving",      val: probScore },
                  { label: "Code Quality",         val: codeScore },
                  { label: "Grammar & Clarity",    val: gramScore },
                ].filter((d) => d.val != null).map(({ label, val }) => (
                  <div key={label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-semibold ${scoreToColor(val!)}`}>{val!.toFixed(0)}</span>
                    </div>
                    <Progress value={val!} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Radar */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Skill Radar</CardTitle>
              </CardHeader>
              <CardContent>
                {radarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10 }} />
                      <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-10">Score data not available</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Executive summary */}
          {report?.executive_summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">{report.executive_summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Strengths & weaknesses */}
          <div className="grid sm:grid-cols-2 gap-6">
            {report?.strengths?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-green-500">
                    <CheckCircle2 className="h-4 w-4" /> Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {report.strengths.map((s: string, i: number) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {report?.weaknesses?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-orange-400">
                    <TrendingUp className="h-4 w-4" /> Areas to Improve
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {report.weaknesses.map((w: string, i: number) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <span className="text-orange-400 mt-0.5 flex-shrink-0">→</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recommended topics */}
          {report?.recommended_topics?.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-brand-400" /> Recommended Study Topics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {report.recommended_topics.map((t: string, i: number) => (
                    <span key={i} className="rounded-full bg-brand-500/10 border border-brand-500/20 px-3 py-1 text-sm text-brand-400">
                      {t}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Confidence Tab */}
        <TabsContent value="confidence" className="mt-4 space-y-4">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Confidence & Delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center mb-6">
                  <div className={`text-5xl font-bold ${scoreToColor(confScore ?? 0)}`}>
                    {(confScore ?? 0).toFixed(0)}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Overall Confidence Score</div>
                </div>
                {report?.confidence_assessment && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {report.confidence_assessment}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-orange-400">Proctoring Signals</CardTitle>
              </CardHeader>
              <CardContent>
                {session.proctoring_violations && session.proctoring_violations.length > 0 ? (
                  <ul className="space-y-3">
                    {session.proctoring_violations.map((v: any, i: number) => (
                      <li key={i} className="flex gap-3 text-sm items-start">
                        <AlertCircle className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium capitalize text-orange-200">
                            {v.type.replace("_", " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(v.timestamp).toLocaleTimeString()} — {v.details}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center py-10 space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
                    <p className="text-sm text-muted-foreground">No proctoring or attention warnings recorded.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Q&A Tab */}
        <TabsContent value="questions" className="mt-4 space-y-4">
          {questions?.questions?.length > 0 ? (
            questions.questions.map((qa: any, i: number) => (
              <Card key={qa.question_id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/10 text-xs font-semibold text-brand-400">
                        {i + 1}
                      </span>
                      <p className="text-sm font-medium leading-relaxed">{qa.question_text}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className="text-xs">{qa.category}</Badge>
                      {qa.is_follow_up && <Badge variant="secondary" className="text-xs">Follow-up</Badge>}
                    </div>
                  </div>

                  {qa.answer && (
                    <div className="ml-9 space-y-2">
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground leading-relaxed">{qa.answer.answer_text}</p>
                        {qa.answer.code_snippet && (
                          <pre className="mt-2 text-xs bg-black/40 rounded p-2 overflow-x-auto">
                            {qa.answer.code_snippet}
                          </pre>
                        )}
                      </div>
                      {qa.answer.score != null && (
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-bold ${scoreToColor(qa.answer.score)}`}>
                            {qa.answer.score.toFixed(0)}/100
                          </span>
                          {qa.answer.feedback && (
                            <p className="text-xs text-muted-foreground">{qa.answer.feedback}</p>
                          )}
                        </div>
                      )}
                      
                      {((qa.answer.strengths?.length > 0) || (qa.answer.improvements?.length > 0)) && (
                        <div className="grid sm:grid-cols-2 gap-4 mt-3">
                          {qa.answer.strengths?.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-green-500 uppercase mb-1">Strengths</p>
                              <ul className="space-y-1">
                                {qa.answer.strengths.map((s: string, idx: number) => (
                                  <li key={idx} className="text-xs text-muted-foreground flex gap-1">
                                    <span className="text-green-500">✓</span> {s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {qa.answer.improvements?.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-orange-400 uppercase mb-1">Areas to Improve</p>
                              <ul className="space-y-1">
                                {qa.answer.improvements.map((imp: string, idx: number) => (
                                  <li key={idx} className="text-xs text-muted-foreground flex gap-1">
                                    <span className="text-orange-400">→</span> {imp}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-10">No questions available</p>
          )}
        </TabsContent>

        {/* Roadmap Tab */}
        <TabsContent value="roadmap" className="mt-4">
          {report?.learning_roadmap?.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Personalized 4-week roadmap based on your interview performance.
              </p>
              {report.learning_roadmap.map((week: any, i: number) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-400 font-bold text-sm">
                        W{week.week}
                      </div>
                      <h3 className="font-semibold">{week.focus}</h3>
                    </div>
                    <div className="ml-11 grid sm:grid-cols-2 gap-4">
                      {week.goals?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">Goals</p>
                          <ul className="space-y-1">
                            {week.goals.map((g: string, j: number) => (
                              <li key={j} className="text-sm flex gap-1.5">
                                <span className="text-brand-400">→</span> {g}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {week.resources?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">Resources</p>
                          <ul className="space-y-1">
                            {week.resources.map((r: string, j: number) => (
                              <li key={j} className="text-sm flex gap-1.5">
                                <BookOpen className="h-3.5 w-3.5 text-brand-400 mt-0.5 flex-shrink-0" />
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-10">
              {session.status !== "completed" ? "Complete the interview to get your roadmap" : "Roadmap not available"}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BarChart2Icon() {
  return <BarChart2 className="h-4 w-4 text-brand-400" />;
}
