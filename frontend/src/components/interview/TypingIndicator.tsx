import { Brain } from "lucide-react";

export default function TypingIndicator() {
  return (
    <div className="flex gap-3 items-end">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/10">
        <Brain className="h-4 w-4 text-brand-400" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-brand-400/60 animate-pulse-slow"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
