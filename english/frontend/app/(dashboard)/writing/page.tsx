"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PenLine, Sparkles, RotateCcw, CheckCircle2, AlertCircle,
  BookOpen, ChevronDown, ChevronUp, Loader2, History, X, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth";
import { aiApi } from "@/api/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface GrammarError {
  text: string;
  correction: string;
  explanation: string;
  type: "grammar" | "spelling" | "style" | "punctuation";
  offset: number;
  length: number;
}

interface AnalysisResult {
  score: number;
  grade: string;
  errors: GrammarError[];
  strengths: string[];
  improvements: string[];
  correctedText: string;
  wordCount: number;
  readabilityLevel: string;
}

const PROMPTS = [
  "Напиши о своём последнем путешествии или месте, которое хочешь посетить",
  "Опиши свою работу или учёбу на английском",
  "Расскажи о своих хобби и чем занимаешься в свободное время",
  "Напиши письмо другу о своих планах на выходные",
  "Опиши свой идеальный день",
  "Что ты думаешь о технологиях и AI?",
];

const ERROR_COLORS: Record<string, string> = {
  grammar: "bg-red-500/20 border-red-500/40 text-red-400",
  spelling: "bg-orange-500/20 border-orange-500/40 text-orange-400",
  style: "bg-blue-500/20 border-blue-500/40 text-blue-400",
  punctuation: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400",
};

const GRADE_COLOR: Record<string, string> = {
  "A": "text-emerald-500", "A+": "text-emerald-500",
  "B": "text-blue-500", "B+": "text-blue-500",
  "C": "text-yellow-500", "C+": "text-yellow-500",
  "D": "text-orange-500", "F": "text-red-500",
};

const STORAGE_KEY = "writing_history";

export default function WritingPage() {
  const { user } = useAuthStore();
  const [text, setText] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCorrected, setShowCorrected] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Array<{ text: string; result: AnalysisResult; date: string }>>([]);
  const [promptIdx, setPromptIdx] = useState(0);
  const [activeError, setActiveError] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, []);

  const analyze = async () => {
    if (text.trim().split(/\s+/).length < 5) {
      toast.error("Напиши хотя бы 5 слов");
      return;
    }
    setLoading(true);
    setResult(null);
    setActiveError(null);
    try {
      const data = await aiApi.analyzeWriting({ text: text.trim() });
      setResult(data);
      // Save to history
      const entry = { text: text.trim(), result: data, date: new Date().toISOString() };
      const updated = [entry, ...history].slice(0, 10);
      setHistory(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch { toast.error("Ошибка анализа. Попробуй снова"); }
    finally { setLoading(false); }
  };

  const highlightErrors = (text: string, errors: GrammarError[]) => {
    if (!errors.length) return <span>{text}</span>;

    const sorted = [...errors].sort((a, b) => a.offset - b.offset);
    const parts: React.ReactNode[] = [];
    let cursor = 0;

    sorted.forEach((err, i) => {
      if (err.offset > cursor) {
        parts.push(<span key={`t${i}`}>{text.slice(cursor, err.offset)}</span>);
      }
      const errText = text.slice(err.offset, err.offset + err.length);
      parts.push(
        <button
          key={`e${i}`}
          onClick={() => setActiveError(activeError === i ? null : i)}
          className={cn(
            "relative inline rounded px-0.5 border-b-2 cursor-pointer transition-all",
            err.type === "grammar" ? "border-red-500 bg-red-500/10" :
            err.type === "spelling" ? "border-orange-500 bg-orange-500/10" :
            err.type === "style" ? "border-blue-500 bg-blue-500/10" :
            "border-yellow-500 bg-yellow-500/10",
            activeError === i && "ring-2 ring-primary/40 rounded"
          )}
        >
          {errText}
        </button>
      );
      cursor = err.offset + err.length;
    });

    if (cursor < text.length) {
      parts.push(<span key="end">{text.slice(cursor)}</span>);
    }

    return <>{parts}</>;
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const activeErrorData = result && activeError !== null ? result.errors[activeError] : null;

  return (
    <div className="max-w-4xl mx-auto space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <PenLine size={20} className="text-primary" />
            Анализ письма
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">AI проверит грамматику, стиль и правописание</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setShowHistory(!showHistory)}>
            <History size={14} />
            <span className="hidden sm:inline">История</span>
            {history.length > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {history.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* History drawer */}
      <AnimatePresence>
        {showHistory && history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-card rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">История работ</h3>
                <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              {history.slice(0, 5).map((h, i) => (
                <motion.div key={i} whileTap={{ scale: 0.99 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-accent/40 hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => { setText(h.text); setResult(h.result); setShowHistory(false); }}>
                  <div className={cn("text-lg font-bold w-8 text-center", GRADE_COLOR[h.result.grade] || "text-foreground")}>
                    {h.result.grade}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground truncate">{h.text.slice(0, 60)}...</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(h.date).toLocaleDateString("ru", { day: "numeric", month: "short" })} · {h.result.wordCount} слов
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-primary">{h.result.score}%</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid md:grid-cols-5 gap-5">
        {/* Left: editor */}
        <div className="md:col-span-3 space-y-3">
          {/* Prompt suggestion */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPromptIdx((promptIdx + 1) % PROMPTS.length)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Sparkles size={11} className="text-violet-400" />
              {PROMPTS[promptIdx]}
            </button>
          </div>

          {/* Text editor */}
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Начни писать по-английски здесь... Нажми на подсказку выше для идеи темы."
              className="w-full h-56 md:h-72 p-4 rounded-2xl border border-border bg-card text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring transition-colors placeholder:text-muted-foreground/40"
              disabled={loading}
            />
            <div className="absolute bottom-3 right-3 text-[10px] text-muted-foreground">
              {wordCount} слов
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              className="flex-1 btn-gradient gap-2"
              onClick={analyze}
              disabled={loading || !text.trim() || wordCount < 5}
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" />Анализирую...</>
                : <><Sparkles size={15} />Проверить текст</>
              }
            </Button>
            {text && (
              <Button variant="outline" size="icon" onClick={() => { setText(""); setResult(null); }}>
                <RotateCcw size={15} />
              </Button>
            )}
          </div>
        </div>

        {/* Right: results */}
        <div className="md:col-span-2 space-y-3">
          {!result && !loading && (
            <div className="glass-card rounded-2xl p-5 h-full flex flex-col items-center justify-center text-center gap-3 min-h-[200px]">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <PenLine size={20} className="text-primary/60" />
              </div>
              <div>
                <p className="font-medium text-sm">Напиши текст</p>
                <p className="text-xs text-muted-foreground mt-1">AI проанализирует грамматику,<br />стиль и правописание</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center text-[10px]">
                {[
                  { label: "Грамматика", color: "bg-red-500/10 text-red-500 border-red-500/20" },
                  { label: "Правописание", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
                  { label: "Стиль", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
                ].map(t => (
                  <span key={t.label} className={cn("px-2 py-0.5 rounded-full border font-medium", t.color)}>{t.label}</span>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="glass-card rounded-2xl p-5 flex flex-col items-center justify-center gap-3 min-h-[200px]">
              <div className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin" />
              <p className="text-sm text-muted-foreground">AI анализирует текст...</p>
            </div>
          )}

          {result && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              {/* Score card */}
              <div className="glass-card rounded-2xl p-4 flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
                    <circle cx="28" cy="28" r="22" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
                    <circle cx="28" cy="28" r="22" fill="none"
                      stroke={result.score >= 80 ? "#10b981" : result.score >= 60 ? "#3b82f6" : result.score >= 40 ? "#f59e0b" : "#ef4444"}
                      strokeWidth="5"
                      strokeDasharray={`${(result.score / 100) * 138.2} 138.2`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={cn("text-sm font-bold", GRADE_COLOR[result.grade] || "text-foreground")}>
                      {result.grade}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{result.score}<span className="text-sm text-muted-foreground">/100</span></div>
                  <div className="text-xs text-muted-foreground mt-0.5">{result.readabilityLevel} · {result.wordCount} слов</div>
                  <div className="flex items-center gap-1 mt-1">
                    {result.errors.length === 0
                      ? <span className="text-emerald-500 text-xs font-medium flex items-center gap-1"><CheckCircle2 size={11} />Без ошибок</span>
                      : <span className="text-red-500 text-xs font-medium">{result.errors.length} ошибок</span>
                    }
                  </div>
                </div>
              </div>

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="glass-card rounded-2xl p-4 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ошибки</h4>
                  {result.errors.map((err, i) => (
                    <motion.div key={i}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs cursor-pointer transition-all",
                        ERROR_COLORS[err.type],
                        activeError === i && "ring-2 ring-primary/30"
                      )}
                      onClick={() => setActiveError(activeError === i ? null : i)}
                    >
                      <div className="flex items-start gap-2">
                        <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="line-through opacity-70">{err.text}</span>
                          {" → "}
                          <span className="font-semibold">{err.correction}</span>
                          <AnimatePresence>
                            {activeError === i && (
                              <motion.p initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                                className="overflow-hidden text-[11px] opacity-80 mt-1 leading-relaxed">
                                {err.explanation}
                              </motion.p>
                            )}
                          </AnimatePresence>
                        </div>
                        <span className="text-[10px] opacity-60 flex-shrink-0 capitalize">{err.type}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Strengths */}
              {result.strengths.length > 0 && (
                <div className="glass-card rounded-2xl p-4 space-y-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Сильные стороны</h4>
                  {result.strengths.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={11} className="mt-0.5 flex-shrink-0" />
                      {s}
                    </div>
                  ))}
                </div>
              )}

              {/* Corrected text toggle */}
              <button
                onClick={() => setShowCorrected(!showCorrected)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-accent/50 hover:bg-accent text-sm transition-colors"
              >
                <span className="font-medium flex items-center gap-2">
                  <BookOpen size={14} className="text-primary" />
                  Исправленный текст
                </span>
                {showCorrected ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <AnimatePresence>
                {showCorrected && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden">
                    <div className="glass-card rounded-2xl p-4 relative">
                      <p className="text-sm leading-relaxed text-foreground/90">{result.correctedText}</p>
                      <button
                        onClick={() => { navigator.clipboard.writeText(result.correctedText); toast.success("Скопировано"); }}
                        className="absolute top-3 right-3 p-1.5 rounded-lg bg-accent/70 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>

      {/* Annotated text (visible when result exists) */}
      {result && result.errors.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="glass-card rounded-2xl p-5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Аннотированный текст — нажми на ошибку для объяснения
            </h4>
            <p className="text-sm leading-loose">
              {highlightErrors(text, result.errors)}
            </p>
            {activeErrorData && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className={cn("mt-3 p-3 rounded-xl border text-xs", ERROR_COLORS[activeErrorData.type])}>
                <div className="font-semibold mb-1">
                  <span className="line-through opacity-70">{activeErrorData.text}</span>
                  {" → "}<span>{activeErrorData.correction}</span>
                </div>
                <p className="opacity-80 leading-relaxed">{activeErrorData.explanation}</p>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
