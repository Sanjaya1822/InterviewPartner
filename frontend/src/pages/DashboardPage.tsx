import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  Play,
  Target,
  Trophy,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { analyticsApi } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/stores/auth.store";
import {
  formatDate,
  interviewTypeLabel,
  scoreToBgColor,
  scoreToColor,
  scoreToLabel,
} from "@/lib/utils";

const cardSurface =
  "rounded-lg border border-[#ded0ec] bg-white/75 shadow-[0_18px_48px_rgba(97,63,139,0.08)] backdrop-blur";

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => analyticsApi.getDashboard().then((r) => r.data),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = user?.full_name?.split(" ")[0] || user?.username || "there";
  const completed = stats?.completed_sessions ?? 0;
  const averageScore = stats?.average_score ?? 0;
  const weeklyGoal = Math.max(stats?.weekly_goal ?? 0, 1);
  const weeklyCompleted = stats?.weekly_completed ?? 0;
  const weeklyProgress = Math.min((weeklyCompleted / weeklyGoal) * 100, 100);
  const practiceTime = formatPracticeMinutes(stats?.total_practice_minutes ?? 0);

  const kpis = [
    {
      label: "Completed",
      value: completed,
      detail: "Practice sessions",
      icon: CheckCircle2,
      iconClass: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      label: "Average Score",
      value: averageScore ? averageScore.toFixed(1) : "No data",
      detail: averageScore ? scoreToLabel(averageScore) : "Start to measure",
      icon: BarChart3,
      iconClass: "text-primary bg-primary/10 border-primary/20",
      suffix: averageScore ? "/100" : "",
    },
    {
      label: "Best Score",
      value: stats?.best_score ? stats.best_score.toFixed(1) : "No data",
      detail: stats?.best_score ? "Personal best" : "Awaiting report",
      icon: Trophy,
      iconClass: "text-amber-600 bg-amber-500/10 border-amber-500/20",
      suffix: stats?.best_score ? "/100" : "",
    },
    {
      label: "Practice Time",
      value: practiceTime,
      detail: `${stats?.current_streak_days ?? 0} day streak`,
      icon: Clock,
      iconClass: "text-sky-600 bg-sky-500/10 border-sky-500/20",
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-lg border border-[#ded0ec] bg-[#fffaf1]/82 shadow-[0_22px_58px_rgba(97,63,139,0.10)] backdrop-blur"
      >
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div className="max-w-3xl">
            <Badge
              variant="outline"
              className="mb-4 border-primary/20 bg-primary/10 text-primary"
            >
              Performance dashboard
            </Badge>
            <h1 className="font-display text-3xl font-normal tracking-tight text-[#1e1230] md:text-4xl">
              {greeting}, {name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {completed === 0
                ? "Start your first practice session and your interview analytics will appear here."
                : `You have completed ${completed} interview${completed === 1 ? "" : "s"}. Keep your momentum steady and focus on the next measurable improvement.`}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <Link to="/interview/new">
              <Button
                size="lg"
                className="w-full gap-2 bg-primary text-white shadow-[0_12px_28px_rgba(132,87,211,0.26)] hover:bg-primary/90"
              >
                <Play className="h-4 w-4 fill-white" />
                New Interview
              </Button>
            </Link>
            <Link to="/history">
              <Button variant="outline" size="lg" className="w-full gap-2 bg-white/60">
                View History
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </motion.section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
            >
              <Card className={`${cardSurface} h-full`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground">
                        {stat.label}
                      </p>
                      <div className="mt-3 flex items-baseline gap-1">
                        <span
                          className={`text-2xl font-extrabold tracking-tight ${
                            stat.label === "Average Score"
                              ? scoreToColor(averageScore)
                              : "text-[#281c3a]"
                          }`}
                        >
                          {stat.value}
                        </span>
                        {stat.suffix && (
                          <span className="text-xs font-semibold text-muted-foreground">
                            {stat.suffix}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`rounded-lg border p-2.5 ${stat.iconClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-medium text-muted-foreground">
                    {stat.detail}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
        <motion.div
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          className={cardSurface}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eadff2] px-6 py-5">
            <div>
              <h2 className="flex items-center gap-2 text-base font-extrabold text-[#281c3a]">
                <TrendingUp className="h-5 w-5 text-primary" />
                Score Progression
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Track how your interview scores move over time.
              </p>
            </div>
            {averageScore > 0 && (
              <Badge className={scoreToBgColor(averageScore)} variant="outline">
                {scoreToLabel(averageScore)}
              </Badge>
            )}
          </div>

          <div className="p-5">
            {stats?.score_trend && stats.score_trend.length >= 2 ? (
              <div className="h-[310px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats.score_trend}
                    margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.28} />
                        <stop offset="92%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(126,87,194,0.14)"
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "#7b6d86" }}
                      dy={10}
                      tickFormatter={(value) => String(value).split("-").slice(1).join("/")}
                    />
                    <YAxis
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "#7b6d86" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fffaf1",
                        border: "1px solid #ded0ec",
                        borderRadius: 8,
                        boxShadow: "0 14px 34px rgba(97,63,139,0.14)",
                      }}
                      labelStyle={{ color: "#281c3a", fontWeight: 700 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="#7c3aed"
                      strokeWidth={3}
                      fill="url(#scoreFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyPanel
                icon={BarChart3}
                title="Trend will appear after two interviews"
                text="Complete another session to compare progress."
              />
            )}
          </div>
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          <div className={cardSurface}>
            <div className="border-b border-[#eadff2] px-6 py-5">
              <h2 className="flex items-center gap-2 text-base font-extrabold text-[#281c3a]">
                <Target className="h-5 w-5 text-primary" />
                Weekly Goal
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Keep practice consistent this week.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-extrabold text-[#281c3a]">
                    {weeklyCompleted}
                    <span className="text-base text-muted-foreground">/{weeklyGoal}</span>
                  </p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    sessions completed
                  </p>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-600">
                  <Flame className="h-5 w-5" />
                </div>
              </div>
              <Progress value={weeklyProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {weeklyCompleted >= weeklyGoal
                  ? "Goal reached. Nice rhythm."
                  : `${Math.max(weeklyGoal - weeklyCompleted, 0)} more session${weeklyGoal - weeklyCompleted === 1 ? "" : "s"} to hit your goal.`}
              </p>
            </div>
          </div>

          <div className={cardSurface}>
            <div className="border-b border-[#eadff2] px-6 py-5">
              <h2 className="flex items-center gap-2 text-base font-extrabold text-[#281c3a]">
                <Target className="h-5 w-5 text-primary" />
                Skill Analysis
              </h2>
            </div>
            <div className="p-5">
              {stats?.skill_breakdown && stats.skill_breakdown.length > 0 ? (
                <div className="h-[275px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={stats.skill_breakdown}>
                      <PolarGrid stroke="rgba(126,87,194,0.18)" />
                      <PolarAngleAxis
                        dataKey="skill"
                        tick={{ fill: "#62556c", fontSize: 11 }}
                      />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="#7c3aed"
                        fill="#8b5cf6"
                        fillOpacity={0.24}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fffaf1",
                          border: "1px solid #ded0ec",
                          borderRadius: 8,
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanel
                  icon={Target}
                  title="No skill data yet"
                  text="Scores will break down after completed interviews."
                  compact
                />
              )}
            </div>
          </div>
        </motion.aside>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className={cardSurface}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eadff2] px-6 py-5">
          <div>
            <h2 className="text-base font-extrabold text-[#281c3a]">
              Recent Interviews
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Review your latest practice sessions and reports.
            </p>
          </div>
          <Link
            to="/history"
            className="flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="p-4">
          {stats?.recent_sessions && stats.recent_sessions.length > 0 ? (
            <div className="divide-y divide-[#eadff2] overflow-hidden rounded-lg border border-[#eadff2] bg-white/45">
              {stats.recent_sessions.map((session: any) => (
                <Link
                  key={session.id}
                  to={`/history/${session.id}`}
                  className="group grid gap-3 p-4 transition-colors hover:bg-primary/5 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${
                        session.status === "completed"
                          ? "border-primary/20 bg-primary/10 text-primary"
                          : "border-amber-500/20 bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {session.status === "completed" ? (
                        <Trophy className="h-5 w-5" />
                      ) : (
                        <Clock className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-[#281c3a] group-hover:text-primary">
                        {session.job_role || "General Interview"}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(session.started_at)}
                        </span>
                        <Badge variant="outline" className="bg-white/60 capitalize">
                          {session.difficulty}
                        </Badge>
                        <Badge variant="outline" className="bg-white/60">
                          {interviewTypeLabel(session.interview_type)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 md:justify-end">
                    {session.status === "completed" ? (
                      <div className="text-right">
                        <p className={`text-xl font-extrabold ${scoreToColor(session.overall_score ?? 0)}`}>
                          {session.overall_score?.toFixed(0) ?? "0"}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground">score</p>
                      </div>
                    ) : (
                      <Badge variant="warning">Incomplete</Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPanel
              icon={Play}
              title="No interviews yet"
              text="Create your first session to populate this dashboard."
              action={
                <Link to="/interview/new">
                  <Button className="gap-2">
                    <Play className="h-4 w-4 fill-white" />
                    Start Practicing
                  </Button>
                </Link>
              }
            />
          )}
        </div>
      </motion.section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 pb-12">
      <div className="h-52 animate-pulse rounded-lg bg-white/55" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-lg bg-white/55" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
        <div className="h-96 animate-pulse rounded-lg bg-white/55" />
        <div className="h-96 animate-pulse rounded-lg bg-white/55" />
      </div>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  text,
  action,
  compact = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-[#ded0ec] bg-white/45 px-5 text-center ${
        compact ? "min-h-[210px] py-8" : "min-h-[300px] py-10"
      }`}
    >
      <div className="mb-3 rounded-lg border border-primary/20 bg-primary/10 p-3 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-bold text-[#281c3a]">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function formatPracticeMinutes(minutes: number) {
  if (!minutes) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
