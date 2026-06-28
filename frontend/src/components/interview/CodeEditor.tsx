import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Play, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { interviewApi } from "@/services/api";

const LANGUAGES = [
  { value: "python", label: "Python", monacoId: "python" },
  { value: "javascript", label: "JavaScript", monacoId: "javascript" },
  { value: "java", label: "Java", monacoId: "java" },
  { value: "cpp", label: "C++", monacoId: "cpp" },
];

const STARTERS: Record<string, string> = {
  python: "# Write your solution here\n\ndef solution():\n    pass\n\n# Test your code\nprint(solution())\n",
  javascript: "// Write your solution here\n\nfunction solution() {\n  // your code\n}\n\nconsole.log(solution());\n",
  java: "public class Solution {\n    public static void main(String[] args) {\n        // your code\n    }\n}\n",
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // your code\n    return 0;\n}\n",
};

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  language: string;
  onLanguageChange: (lang: string) => void;
  sessionId: string;
  questionId?: string;
}

export default function CodeEditor({
  code, onChange, language, onLanguageChange, sessionId, questionId,
}: CodeEditorProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<{ success: boolean; output?: string; error?: string; ai_review?: string } | null>(null);

  const monacoLang = LANGUAGES.find((l) => l.value === language)?.monacoId || "python";

  const handleLanguageChange = (lang: string) => {
    onLanguageChange(lang);
    if (!code || code === STARTERS[language]) {
      onChange(STARTERS[lang] || "");
    }
  };

  const handleRun = async () => {
    if (!code.trim()) return;
    setIsRunning(true);
    setOutput(null);
    try {
      const { data } = await interviewApi.executeCode({
        code,
        language,
        question_id: questionId,
      });
      setOutput(data);
      if (data.success) {
        toast.success("Code executed successfully");
      } else {
        toast.error("Execution error — check output");
      }
    } catch (err: any) {
      toast.error("Code execution failed");
      setOutput({ success: false, error: err?.response?.data?.detail || "Execution failed" });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Select value={language} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleRun}
          disabled={isRunning}
          className="h-8 text-xs gap-1"
        >
          {isRunning ? (
            <><Loader2 className="h-3 w-3 animate-spin" />Running…</>
          ) : (
            <><Play className="h-3 w-3" />Run</>
          )}
        </Button>
      </div>

      {/* Monaco editor */}
      <div className="rounded-lg overflow-hidden border border-border/40">
        <Editor
          height="280px"
          language={monacoLang}
          value={code || STARTERS[language]}
          onChange={(val) => onChange(val || "")}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "JetBrains Mono, Fira Code, monospace",
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            wordWrap: "on",
          }}
        />
      </div>

      {/* Output */}
      {output && (
        <div className="rounded-lg border border-border/40 bg-black/60 p-3 text-xs font-mono">
          {output.success ? (
            <>
              <div className="text-green-400 mb-1 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-400 inline-block" />
                Output
              </div>
              <pre className="text-gray-300 whitespace-pre-wrap">{output.output || "(no output)"}</pre>
            </>
          ) : (
            <>
              <div className="text-red-400 mb-1 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />
                Error
              </div>
              <pre className="text-red-300 whitespace-pre-wrap">{output.error}</pre>
            </>
          )}
          {output.ai_review && (
            <div className="mt-3 pt-3 border-t border-border/40">
              <p className="text-brand-400 mb-1">AI Review:</p>
              <p className="text-gray-300 whitespace-pre-wrap">{output.ai_review}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
