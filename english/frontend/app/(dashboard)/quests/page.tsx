"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords, Sparkles, Play, Trophy, Star, ChevronRight,
  X, Send, Loader2, CheckCircle2, AlertCircle, Lightbulb,
  BarChart2, Target, ArrowLeft, RefreshCw, Crown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { questsApi } from "@/api/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type Quest = {
  id: string; title: string; description: string; scenario: string;
  difficulty: string; topics: string[]; objectives: string[];
  hints: string[]; xpReward: number;
};

type Attempt = { id: string; questId: string; status: string; [k: string]: any };
type Evaluation = {
  score: number; grade: string; summary: string;
  strengths: string[]; improvements: string[];
  grammarErrors: Array<{ error: string; correction: string; explanation: string }>;
  vocabularyFeedback: string; communicationFeedback: string; alternativePhrase: string;
};

const DIFFICULTY_CONFIG = {
  easy:   { label: "Лёгкий",    badge: "badge-easy",   icon: "🌱", xpRange: "50 XP" },
  medium: { label: "Средний",   badge: "badge-medium", icon: "⚔️", xpRange: "100 XP" },
  hard:   { label: "Сложный",   badge: "badge-hard",   icon: "🔥", xpRange: "200 XP" },
};

export default function QuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");

  // Active quest state
  const [activeQuest, setActiveQuest] = useState<Quest | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);

  // History
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<"quests" | "history">("quests");

  useEffect(() => {
    loadQuests();
    questsApi.getHistory().then(setHistory).catch(() => {});
  }, []);

  const loadQuests = async () => {
    setLoading(true);
    try {
      const data = await questsApi.getAll();
      setQuests(data);
    } catch { toast.error("Ошибка загрузки"); }
    finally { setLoading(false); }
  };

  const generateQuest = async () => {
    setGenerating(true);
    try {
      const quest = await questsApi.generate({ difficulty });
      setQuests(prev => [quest, ...prev]);
      toast.success("Квест создан!");
    } catch { toast.error("Ошибка генерации"); }
    finally { setGenerating(false); }
  };

  const startQuest = async (quest: Quest) => {
    try {
      const data = await questsApi.start(quest.id);
      setActiveQuest(quest);
      setAttempt(data.attempt);
      setResponse("");
      setEvaluation(null);
      setShowHints(false);
    } catch { toast.error("Ошибка запуска"); }
  };

  const submitResponse = async () => {
    if (!activeQuest || !attempt || !response.trim()) return;
    setSubmitting(true);
    try {
      const data = await questsApi.submit(activeQuest.id, { attemptId: attempt.id, userResponse: response });
      setEvaluation(data.evaluation);
      setXpEarned(data.xpEarned);
      questsApi.getHistory().then(setHistory).catch(() => {});
    } catch { toast.error("Ошибка отправки"); }
    finally { setSubmitting(false); }
  };

  const closeQuest = () => {
    setActiveQuest(null);
    setAttempt(null);
    setEvaluation(null);
    setResponse("");
  };

  const getGradeColor = (grade: string) => {
    if (grade === "A") return "text-emerald-500";
    if (grade === "B") return "text-blue-500";
    if (grade === "C") return "text-amber-500";
    return "text-red-500";
  };

  return (
    <div className="max-w-4xl mx-auto page-enter">
      <AnimatePresence mode="wait">
        {activeQuest ? (
          /* ——— Active quest ——— */
          <motion.div key="active" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            <div className="flex items-center gap-3">
              <button onClick={closeQuest} className="p-1.5 rounded-xl hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft size={16} />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-base truncate">{activeQuest.title}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", DIFFICULTY_CONFIG[activeQuest.difficulty as keyof typeof DIFFICULTY_CONFIG]?.badge)}>
                    {DIFFICULTY_CONFIG[activeQuest.difficulty as keyof typeof DIFFICULTY_CONFIG]?.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{activeQuest.xpReward} XP</span>
                </div>
              </div>
            </div>

            {!evaluation ? (
              <>
                {/* Scenario */}
                <div className="glass-card rounded-2xl p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0 text-xl">
                      {DIFFICULTY_CONFIG[activeQuest.difficulty as keyof typeof DIFFICULTY_CONFIG]?.icon}
                    </div>
                    <div>
                      <div className="font-semibold text-sm mb-1">Ситуация</div>
                      <p className="text-sm text-foreground/80 leading-relaxed">{activeQuest.scenario}</p>
                    </div>
                  </div>

                  {/* Objectives */}
                  <div className="border-t border-border/40 pt-4">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Задачи</div>
                    <div className="space-y-1.5">
                      {activeQuest.objectives.map((obj, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-[9px] font-bold text-primary">{i + 1}</span>
                          </div>
                          <span className="text-foreground/80">{obj}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {activeQuest.topics.map((t, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 bg-accent rounded-full text-muted-foreground">{t}</span>
                    ))}
                  </div>
                </div>

                {/* Hints */}
                <button
                  onClick={() => setShowHints(!showHints)}
                  className="flex items-center gap-2 text-sm text-amber-500 hover:text-amber-400 transition-colors"
                >
                  <Lightbulb size={14} />
                  {showHints ? "Скрыть подсказки" : "Показать подсказки"}
                </button>
                <AnimatePresence>
                  {showHints && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="glass-card rounded-xl p-4 space-y-2 border-l-4 border-amber-500/40">
                      {activeQuest.hints.map((hint, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-foreground/75">
                          <span className="text-amber-500">💡</span>
                          <span>{hint}</span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Response input */}
                <div className="glass-card rounded-2xl p-4 space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Ваш ответ на английском
                  </div>
                  <textarea
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder="Write your response in English here. Be detailed and try to achieve all the objectives..."
                    className="w-full h-36 bg-accent/30 border border-border/40 rounded-xl px-4 py-3 text-sm resize-none outline-none focus:border-primary/50 focus:bg-accent/50 transition-all placeholder:text-muted-foreground/50"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{response.length} символов</span>
                    <Button
                      className="btn-gradient gap-2"
                      onClick={submitResponse}
                      disabled={submitting || response.trim().length < 20}
                    >
                      {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {submitting ? "Оцениваю..." : "Отправить на проверку"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              /* ——— Evaluation results ——— */
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {/* Score card */}
                <div className="glass-card rounded-2xl p-6 text-center">
                  <div className={cn("text-6xl font-bold mb-2", getGradeColor(evaluation.grade))}>
                    {evaluation.grade}
                  </div>
                  <div className="text-2xl font-semibold mb-1">{evaluation.score}/100</div>
                  <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">{evaluation.summary}</p>
                  {xpEarned > 0 && (
                    <div className="inline-flex items-center gap-1.5 px-4 py-2 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-full text-sm font-semibold">
                      <Star size={14} /> +{xpEarned} XP получено
                    </div>
                  )}
                </div>

                {/* Strengths & Improvements */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="glass-card rounded-xl p-4 border border-emerald-500/15">
                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <CheckCircle2 size={12} /> Сильные стороны
                    </div>
                    <ul className="space-y-1.5">
                      {evaluation.strengths.map((s, i) => (
                        <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                          <span className="text-emerald-500 mt-0.5">+</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="glass-card rounded-xl p-4 border border-amber-500/15">
                    <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Target size={12} /> Для улучшения
                    </div>
                    <ul className="space-y-1.5">
                      {evaluation.improvements.map((s, i) => (
                        <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                          <span className="text-amber-500 mt-0.5">→</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Grammar errors */}
                {evaluation.grammarErrors?.length > 0 && (
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-3">Грамматические ошибки</div>
                    <div className="space-y-3">
                      {evaluation.grammarErrors.map((err, i) => (
                        <div key={i} className="text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="line-through text-red-400">{err.error}</span>
                            <ChevronRight size={12} className="text-muted-foreground" />
                            <span className="text-emerald-500 font-medium">{err.correction}</span>
                          </div>
                          <div className="text-xs text-muted-foreground pl-2 border-l border-border">{err.explanation}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vocab & alternative */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Словарный запас</div>
                    <p className="text-sm text-foreground/80">{evaluation.vocabularyFeedback}</p>
                  </div>
                  <div className="glass-card rounded-xl p-4 border border-primary/15">
                    <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Лучше сказать так</div>
                    <p className="text-sm italic text-foreground/80">"{evaluation.alternativePhrase}"</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-1.5" onClick={closeQuest}>
                    <Swords size={14} /> К квестам
                  </Button>
                  <Button className="flex-1 btn-gradient gap-1.5" onClick={() => {
                    setEvaluation(null); setResponse(""); setShowHints(false);
                  }}>
                    <RefreshCw size={14} /> Попробовать снова
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        ) : (
          /* ——— Quests list ——— */
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold">Квесты</h1>
                <p className="text-sm text-muted-foreground mt-0.5">AI-ситуационные задания с оценкой</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-accent/50 p-1 rounded-xl w-fit">
              {(["quests", "history"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                    tab === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {t === "quests" ? "Квесты" : "История"}
                </button>
              ))}
            </div>

            {tab === "quests" ? (
              <>
                {/* Generate new */}
                <div className="glass-card rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
                      <Sparkles size={17} className="text-violet-500" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">Сгенерировать квест</div>
                      <div className="text-xs text-muted-foreground">AI создаст уникальную ситуацию</div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {(["easy", "medium", "hard"] as const).map((d) => {
                      const cfg = DIFFICULTY_CONFIG[d];
                      return (
                        <button key={d} onClick={() => setDifficulty(d)}
                          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                            difficulty === d
                              ? "bg-primary text-white border-primary"
                              : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                          )}>
                          {cfg.icon} {cfg.label} · {cfg.xpRange}
                        </button>
                      );
                    })}
                  </div>
                  <Button className="w-full btn-gradient gap-2" onClick={generateQuest} disabled={generating}>
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {generating ? "Генерирую..." : "Новый квест"}
                  </Button>
                </div>

                {/* Quest cards */}
                {loading ? (
                  <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : quests.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4 text-2xl">⚔️</div>
                    <p className="font-medium">Квестов пока нет</p>
                    <p className="text-sm mt-1 text-muted-foreground/70">Сгенерируй первый квест выше</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {quests.map((quest, i) => {
                      const cfg = DIFFICULTY_CONFIG[quest.difficulty as keyof typeof DIFFICULTY_CONFIG] || DIFFICULTY_CONFIG.easy;
                      return (
                        <motion.div
                          key={quest.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="glass-card rounded-2xl p-4 card-hover cursor-pointer group"
                          onClick={() => startQuest(quest)}
                        >
                          <div className="flex items-start gap-3 mb-3">
                            <div className="text-2xl flex-shrink-0">{cfg.icon}</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm">{quest.title}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{quest.description}</div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex gap-1.5 flex-wrap">
                              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", cfg.badge)}>
                                {cfg.label}
                              </span>
                              {quest.topics.slice(0, 2).map((t, ti) => (
                                <span key={ti} className="text-[10px] px-2 py-0.5 bg-accent rounded-full text-muted-foreground">{t}</span>
                              ))}
                            </div>
                            <div className="flex items-center gap-1 text-yellow-500 text-xs font-semibold">
                              <Star size={11} /> {quest.xpReward}
                            </div>
                          </div>
                          <Button size="sm" className="w-full mt-3 btn-gradient gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity h-8">
                            <Play size={12} /> Начать
                          </Button>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              /* History tab */
              <div className="space-y-3">
                {history.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Trophy size={32} className="mx-auto mb-3 text-muted-foreground/30" />
                    <p>История пуста — пройди первый квест!</p>
                  </div>
                ) : history.map((item, i) => (
                  <div key={i} className="glass-card rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                      {DIFFICULTY_CONFIG[item.quest?.difficulty as keyof typeof DIFFICULTY_CONFIG]?.icon || "⚔️"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{item.quest?.title || "Квест"}</div>
                      <div className="text-xs text-muted-foreground">{new Date(item.startedAt).toLocaleDateString("ru")}</div>
                    </div>
                    {item.aiScore != null && (
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-lg text-primary">{item.aiScore}</span>
                        <span className="text-[10px] text-muted-foreground">/{100}</span>
                      </div>
                    )}
                    {item.xpEarned > 0 && (
                      <div className="flex items-center gap-1 text-yellow-500 text-xs font-semibold">
                        <Star size={11} /> +{item.xpEarned}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
