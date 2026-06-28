import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, TrendingUp, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { scoreToColor, scoreToLabel, scoreToBgColor } from "@/lib/utils";
import type { QuestionFeedback } from "@/stores/interview.store";

interface FeedbackPanelProps {
  feedback: QuestionFeedback;
}

const SCORE_DIMS = [
  { key: "technicalScore", label: "Technical" },
  { key: "communicationScore", label: "Communication" },
  { key: "confidenceScore", label: "Confidence" },
  { key: "codeQualityScore", label: "Code Quality" },
] as const;

import React from "react";

export const FeedbackPanel = React.memo(function FeedbackPanel({ feedback }: FeedbackPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
    >
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Answer Feedback</CardTitle>
            <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${scoreToBgColor(feedback.score)}`}>
              <span>{feedback.score.toFixed(0)}/100</span>
              <span>·</span>
              <span>{scoreToLabel(feedback.score)}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 text-sm">
          {/* Overall score bar */}
          <div>
            <div className="flex justify-between mb-1 text-xs">
              <span className="text-muted-foreground">Overall Score</span>
              <span className={scoreToColor(feedback.score)}>{feedback.score.toFixed(1)}</span>
            </div>
            <Progress value={feedback.score} className="h-2" />
          </div>

          {/* Dimension breakdown */}
          <div className="space-y-2">
            {SCORE_DIMS.map(({ key, label }) => {
              const val = feedback[key];
              if (val == null) return null;
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={scoreToColor(val)}>{val.toFixed(0)}</span>
                  </div>
                  <Progress value={val} className="h-1" />
                </div>
              );
            })}
          </div>

          {/* Complexity (for code) */}
          {(feedback.timeComplexity || feedback.spaceComplexity) && (
            <div className="flex gap-2">
              {feedback.timeComplexity && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Clock className="h-3 w-3" /> Time: {feedback.timeComplexity}
                </Badge>
              )}
              {feedback.spaceComplexity && (
                <Badge variant="outline" className="text-xs">
                  Space: {feedback.spaceComplexity}
                </Badge>
              )}
            </div>
          )}

          {/* Feedback text */}
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">{feedback.feedback}</p>
          </div>

          {/* Strengths */}
          {feedback.strengths.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-500 mb-1.5 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Strengths
              </p>
              <ul className="space-y-1">
                {feedback.strengths.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {feedback.improvements.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-orange-400 mb-1.5 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> To Improve
              </p>
              <ul className="space-y-1">
                {feedback.improvements.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                    <span className="text-orange-400 mt-0.5">→</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
});

export default FeedbackPanel;
