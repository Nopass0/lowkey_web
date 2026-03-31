"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookMarked, ChevronRight, CheckCircle2, XCircle, Lightbulb,
  Trophy, Star, RotateCcw, Play, ChevronDown, ChevronUp,
  Sparkles, Loader2, Brain, X, Check, Volume2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { grammarApi } from "@/api/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const LEVEL_CONFIG = {
  beginner:     { label: "Начинающий",  color: "text-emerald-500", bg: "bg-emerald-500/10",  border: "border-emerald-500/20" },
  intermediate: { label: "Средний",     color: "text-amber-500",   bg: "bg-amber-500/10",    border: "border-amber-500/20" },
  advanced:     { label: "Продвинутый", color: "text-red-500",     bg: "bg-red-500/10",      border: "border-red-500/20" },
};

type Topic = { id: string; title: string; slug: string; level: string; category: string; description: string; content: string; examples: any[]; rules: any[] };
type Test = { id: string; question: string; questionType: string; options: string[]; correctAnswer: string; explanation: string; difficulty: number };

export default function GrammarPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [expandedRules, setExpandedRules] = useState<Record<number, boolean>>({});

  // Test state
  const [tests, setTests] = useState<Test[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [currentQ, setCurrentQ] = useState(0);

  // Explain
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  useEffect(() => {
    grammarApi.getTopics()
      .then(setTopics)
      .catch(() => toast.error("Ошибка загрузки грамматики"))
      .finally(() => setLoading(false));
  }, []);

  const openTopic = async (topic: Topic) => {
    setSelectedTopic(topic);
    setTestMode(false);
    setTests([]);
    setAnswers({});
    setSubmitted(false);
    setResult(null);
    setCurrentQ(0);
    setExplanation(null);
  };

  const startTest = async () => {
    if (!selectedTopic) return;
    setTestsLoading(true);
    try {
      const data = await grammarApi.generateTests(selectedTopic.id);
      setTests(data.tests || []);
      setTestMode(true);
      setCurrentQ(0);
      setAnswers({});
    } catch { toast.error("Ошибка создания теста"); }
    finally { setTestsLoading(false); }
  };

  const handleAnswer = (testId: string, answer: string) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [testId]: answer }));
    if (currentQ < tests.length - 1) {
      setTimeout(() => setCurrentQ(c => c + 1), 400);
    }
  };

  const submitTest = async () => {
    if (!selectedTopic) return;
    const answerArray = tests.map(t => ({ testId: t.id, answer: answers[t.id] || "" }));
    try {
      const data = await grammarApi.submitTest(selectedTopic.id, answerArray);
      setResult(data);
      setSubmitted(true);
    } catch { toast.error("Ошибка отправки"); }
  };

  const explainRule = async (text: string) => {
    setExplaining(true);
    setExplanation(null);
    try {
      const data = await grammarApi.explain({ text });
      setExplanation(data.explanation);
    } catch { setExplanation("Объяснение недоступно."); }
    finally { setExplaining(false); }
  };

  const speakExample = (text: string) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "en-US"; utt.rate = 0.85;
    const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
    if (voices.length > 0) utt.voice = voices.find(v => v.name.includes("Google")) || voices[0];
    window.speechSynthesis.speak(utt);
  };

  const levelGroups = Object.entries(LEVEL_CONFIG).map(([key, cfg]) => ({
    level: key,
    ...cfg,
    topics: topics.filter(t => t.level === key),
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto page-enter">
      <AnimatePresence mode="wait">
        {!selectedTopic ? (
          /* ——— Topics list ——— */
          <motion.div key="topics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold">Грамматика</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Правила, примеры и интерактивные тесты</p>
            </div>

            {levelGroups.filter(g => g.topics.length > 0).map((group) => (
              <div key={group.level}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn("text-xs font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full border", group.bg, group.color, group.border)}>
                    {group.label}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {group.topics.map((topic, i) => (
                    <motion.div
                      key={topic.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => openTopic(topic)}
                      className="glass-card rounded-2xl p-4 cursor-pointer card-hover group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{topic.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{topic.description}</div>
                        </div>
                        <ChevronRight size={14} className="text-muted-foreground/50 group-hover:text-primary transition-colors mt-0.5 flex-shrink-0" />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-medium">
                          {topic.category}
                        </span>
                        <span className="text-[10px] text-muted-foreground/40">·</span>
                        <span className="text-[10px] text-muted-foreground/60">
                          {(topic.rules as any[])?.length || 0} правил
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        ) : testMode ? (
          /* ——— Test mode ——— */
          <motion.div key="test" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            <div className="flex items-center gap-3">
              <button onClick={() => setTestMode(false)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                ← Назад
              </button>
              <ChevronRight size={14} className="text-muted-foreground/40" />
              <span className="text-sm font-medium">{selectedTopic.title} — Тест</span>
            </div>

            {!submitted ? (
              <>
                {/* Progress */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Вопрос {currentQ + 1} из {tests.length}</span>
                  <span>{Object.keys(answers).length} / {tests.length} отвечено</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${((currentQ) / tests.length) * 100}%` }} />
                </div>

                {tests[currentQ] && (
                  <motion.div
                    key={currentQ}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="glass-card rounded-2xl p-5 space-y-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">{currentQ + 1}</span>
                      </div>
                      <p className="font-medium text-sm leading-relaxed">{tests[currentQ].question}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {(tests[currentQ].options as string[]).map((opt, i) => {
                        const selected = answers[tests[currentQ].id] === opt;
                        return (
                          <button
                            key={i}
                            onClick={() => handleAnswer(tests[currentQ].id, opt)}
                            className={cn(
                              "text-left px-4 py-3 rounded-xl text-sm font-medium transition-all border",
                              selected
                                ? "bg-primary/10 border-primary/40 text-primary"
                                : "bg-accent/40 border-border/40 hover:bg-accent hover:border-border text-foreground"
                            )}
                          >
                            <span className="text-muted-foreground mr-2 font-mono text-xs">{String.fromCharCode(65 + i)}.</span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                <div className="flex gap-2 justify-between">
                  {currentQ > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setCurrentQ(c => c - 1)}>← Назад</Button>
                  )}
                  {currentQ < tests.length - 1 ? (
                    <Button size="sm" className="btn-gradient ml-auto" onClick={() => setCurrentQ(c => c + 1)}
                      disabled={!answers[tests[currentQ]?.id]}>
                      Далее →
                    </Button>
                  ) : (
                    <Button size="sm" className="btn-gradient ml-auto" onClick={submitTest}
                      disabled={Object.keys(answers).length < tests.length}>
                      <Check size={14} className="mr-1" /> Завершить тест
                    </Button>
                  )}
                </div>
              </>
            ) : (
              /* ——— Results ——— */
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                <div className="glass-card rounded-2xl p-6 text-center">
                  <div className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3",
                    result.score === result.total ? "bg-emerald-500/15" : "bg-primary/10"
                  )}>
                    {result.score === result.total
                      ? <Trophy size={28} className="text-emerald-500" />
                      : <Star size={28} className="text-primary" />
                    }
                  </div>
                  <div className="text-3xl font-bold mb-1">{result.score}/{result.total}</div>
                  <div className="text-muted-foreground text-sm mb-3">
                    {result.score === result.total ? "Отлично! Все правильно!" :
                     result.score >= result.total * 0.7 ? "Хороший результат!" :
                     "Нужно повторить тему"}
                  </div>
                  {result.xpEarned > 0 && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-full text-sm font-medium">
                      <Star size={13} /> +{result.xpEarned} XP
                    </div>
                  )}
                </div>

                {/* Detailed answers */}
                <div className="space-y-3">
                  {tests.map((test, i) => {
                    const detail = result.result?.answers?.[i];
                    const isCorrect = detail?.correct;
                    return (
                      <div key={test.id} className={cn(
                        "glass-card rounded-xl p-4 border",
                        isCorrect ? "border-emerald-500/20" : "border-red-500/20"
                      )}>
                        <div className="flex items-start gap-2 mb-2">
                          {isCorrect
                            ? <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                            : <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                          }
                          <p className="text-sm font-medium">{test.question}</p>
                        </div>
                        {!isCorrect && (
                          <div className="ml-6 space-y-1">
                            <div className="text-xs text-red-500">Ваш ответ: {answers[test.id]}</div>
                            <div className="text-xs text-emerald-500">Правильно: {test.correctAnswer}</div>
                          </div>
                        )}
                        {test.explanation && (
                          <div className="ml-6 mt-2 text-xs text-muted-foreground bg-accent/40 rounded-lg p-2 flex items-start gap-1.5">
                            <Lightbulb size={11} className="flex-shrink-0 mt-0.5 text-amber-500" />
                            {test.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-1.5" onClick={() => {
                    setTestMode(false); setSubmitted(false); setAnswers({}); setResult(null);
                  }}>
                    <BookMarked size={14} /> К теме
                  </Button>
                  <Button className="flex-1 btn-gradient gap-1.5" onClick={() => {
                    setSubmitted(false); setAnswers({}); setResult(null); setCurrentQ(0);
                  }}>
                    <RotateCcw size={14} /> Повторить
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        ) : (
          /* ——— Topic detail ——— */
          <motion.div key="topic" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => setSelectedTopic(null)}
                className="text-muted-foreground hover:text-foreground transition-colors">
                Грамматика
              </button>
              <ChevronRight size={14} className="text-muted-foreground/40" />
              <span className="font-medium">{selectedTopic.title}</span>
            </div>

            {/* Topic header */}
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      "text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border",
                      LEVEL_CONFIG[selectedTopic.level as keyof typeof LEVEL_CONFIG]?.bg,
                      LEVEL_CONFIG[selectedTopic.level as keyof typeof LEVEL_CONFIG]?.color,
                      LEVEL_CONFIG[selectedTopic.level as keyof typeof LEVEL_CONFIG]?.border
                    )}>
                      {LEVEL_CONFIG[selectedTopic.level as keyof typeof LEVEL_CONFIG]?.label}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold">{selectedTopic.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{selectedTopic.description}</p>
                </div>
                <Button
                  className="btn-gradient gap-2 flex-shrink-0"
                  onClick={startTest}
                  disabled={testsLoading}
                >
                  {testsLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Тест
                </Button>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed border-t border-border/40 pt-3">
                {selectedTopic.content}
              </p>
            </div>

            {/* Rules */}
            {(selectedTopic.rules as any[])?.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <BookMarked size={15} className="text-primary" /> Правила
                </h3>
                <div className="space-y-2">
                  {(selectedTopic.rules as any[]).map((rule: any, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="glass-card rounded-xl overflow-hidden"
                    >
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
                        onClick={() => setExpandedRules(p => ({ ...p, [i]: !p[i] }))}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                          </div>
                          <span className="text-sm font-medium">{rule.rule}</span>
                        </div>
                        <ChevronDown size={14} className={cn("text-muted-foreground/50 transition-transform", expandedRules[i] && "rotate-180")} />
                      </div>
                      {expandedRules[i] && rule.example && (
                        <div className="px-4 pb-3 ml-8">
                          <div className="flex items-center justify-between bg-accent/40 rounded-xl px-3 py-2.5">
                            <span className="text-sm italic text-foreground/80">{rule.example}</span>
                            <button
                              onClick={() => speakExample(rule.example)}
                              className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                            >
                              <Volume2 size={13} />
                            </button>
                          </div>
                          <button
                            onClick={() => explainRule(rule.rule)}
                            className="mt-2 text-[11px] text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
                          >
                            <Lightbulb size={11} /> Объяснить подробнее
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Explanation */}
            <AnimatePresence>
              {(explaining || explanation) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="glass-card rounded-2xl p-4 border-l-4 border-primary"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Brain size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-primary">AI Объяснение</span>
                    <button onClick={() => setExplanation(null)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground">
                      <X size={12} />
                    </button>
                  </div>
                  {explaining
                    ? <div className="flex gap-1"> {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />) }</div>
                    : <p className="text-sm text-foreground/80 leading-relaxed">{explanation}</p>
                  }
                </motion.div>
              )}
            </AnimatePresence>

            {/* Examples */}
            {(selectedTopic.examples as any[])?.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Sparkles size={15} className="text-amber-500" /> Примеры
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {(selectedTopic.examples as any[]).map((ex: any, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07 }}
                      className="glass-card rounded-xl p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm mb-1">{ex.en}</div>
                          <div className="text-xs text-muted-foreground">{ex.ru}</div>
                        </div>
                        <button
                          onClick={() => speakExample(ex.en)}
                          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                        >
                          <Volume2 size={13} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
