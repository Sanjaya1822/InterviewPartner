import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Brain, Clock, BarChart2, ChevronRight, Filter } from "lucide-react";
import { useState } from "react";
import { interviewApi } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  scoreToColor, scoreToLabel, interviewTypeLabel, formatDate, formatDuration,
} from "@/lib/utils";

export default function HistoryPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions", statusFilter],
    queryFn: () => interviewApi.list(statusFilter, 0, 50).then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-normal text-[#1e1230]">Interview History</h1>
          <p className="text-muted-foreground mt-1">{sessions.length} session{sessions.length !== 1 ? "s" : ""} total</p>
        </div>
        <div className="flex items-center gap-3">
          <Select onValueChange={(v) => setStatusFilter(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-36 h-9">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="abandoned">Abandoned</SelectItem>
            </SelectContent>
          </Select>
          <Link to="/interview/new">
            <Button variant="gradient" size="sm" className="gap-1">
              <Brain className="h-4 w-4" />
              New Interview
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Brain className="h-14 w-14 text-muted-foreground/20 mb-4" />
          <h3 className="text-lg font-semibold">No interviews yet</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-6">Start your first practice session</p>
          <Link to="/interview/new">
            <Button variant="gradient">Start Interview</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s: any, i: number) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link to={`/history/${s.id}`}>
                <Card className="hover:border-brand-500/40 transition-all hover:bg-card/90 group">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
                          <Brain className="h-5 w-5 text-brand-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{s.job_role}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-xs h-5">
                              {interviewTypeLabel(s.interview_type)}
                            </Badge>
                            <Badge variant="outline" className="text-xs h-5 capitalize">
                              {s.difficulty}
                            </Badge>
                            {s.company_name && (
                              <Badge variant="info" className="text-xs h-5">{s.company_name}</Badge>
                            )}
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {s.duration_seconds ? formatDuration(s.duration_seconds) : `${s.duration_minutes}m`}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDate(s.started_at)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-center hidden sm:block">
                          <p className="text-xs text-muted-foreground">Questions</p>
                          <p className="font-semibold">{s.current_question_index}/{s.total_questions}</p>
                        </div>

                        {s.overall_score != null && (
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Score</p>
                            <p className={`text-lg font-bold ${scoreToColor(s.overall_score)}`}>
                              {s.overall_score.toFixed(0)}
                            </p>
                          </div>
                        )}

                        <div>
                          <Badge
                            variant="outline"
                            className={
                              s.status === "completed"
                                ? "border-green-500/30 text-green-500"
                                : s.status === "active"
                                  ? "border-blue-500/30 text-blue-500"
                                  : "border-muted-foreground/30 text-muted-foreground"
                            }
                          >
                            {s.status}
                          </Badge>
                        </div>

                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
