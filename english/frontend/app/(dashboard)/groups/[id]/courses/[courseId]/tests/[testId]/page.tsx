"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Clock, CheckCircle2, XCircle, Loader2,
  ChevronRight, ChevronLeft, Send, Trophy, AlertCircle,
  RotateCcw
} from "lucide-react";
import { socialApi } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type Question = {
  id: string;
  type: string;
  question: string;
  options?: string[];
  correctAnswer?: any;
};

type Test = {
  id: string;
  title: string;
  description: string | null;
  timeLimitSeconds: number | null;
  passingScore: number;
  questions: Question[];
};

type Attempt = {
  id: string;
  score: number;
  passed: boolean;
  answers: Array<{ questionId: string; userAnswer: any; correct: boolean; correctAnswer: any }>;
  timeTakenSeconds: number;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SingleChoiceQ({ question, answer, onChange, submitted, correct }: {
  question: Question; answer: string; onChange: (v: string) => void;
  submitted: boolean; correct?: boolean;
}) {
  return (
    <div className="space-y-2">
      {(question.options || []).map((opt, i) => {
        const isSelected = answer === opt;
        const isCorrect = submitted && (question.correctAnswer === opt || correct && isSelected);
        const isWrong = submitted && isSelected && question.correctAnswer !== opt;
        return (
          <button
            key={i}
            onClick={() => !submitted && onChange(opt)}
            disabled={submitted}
            className={cn(
              "w-full text-left px-4 py-3 rounded-xl text-sm transition-all border",
              submitted
                ? isCorrect ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : isWrong ? "bg-red-500/20 border-red-500/40 text-red-300"
                    : "bg-white/5 border-white/10 text-white/50"
                : isSelected
                  ? "bg-indigo-500/20 border-indigo-500/40 text-white"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
            )}
          >
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center",
                isSelected && !submitted ? "border-indigo-400 bg-indigo-500" :
                  submitted && isCorrect ? "border-emerald-400 bg-emerald-500" :
                    submitted && isWrong ? "border-red-400 bg-red-500" : "border-white/30"
              )}>
                {isSelected && !submitted && <div className="w-2 h-2 rounded-full bg-white" />}
                {submitted && isCorrect && <CheckCircle2 className="w-3 h-3 text-white" />}
                {submitted && isWrong && <XCircle className="w-3 h-3 text-white" />}
              </div>
              {opt}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MultipleChoiceQ({ question, answer, onChange, submitted }: {
  question: Question; answer: string[]; onChange: (v: string[]) => void;
  submitted: boolean;
}) {
  const correctArr: string[] = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
  return (
    <div className="space-y-2">
      {(question.options || []).map((opt, i) => {
        const isSelected = answer.includes(opt);
        const isCorrect = submitted && correctArr.includes(opt);
        const isWrong = submitted && isSelected && !correctArr.includes(opt);
        const isMissed = submitted && !isSelected && correctArr.includes(opt);
        return (
          <button
            key={i}
            onClick={() => {
              if (submitted) return;
              onChange(isSelected ? answer.filter(x => x !== opt) : [...answer, opt]);
            }}
            disabled={submitted}
            className={cn(
              "w-full text-left px-4 py-3 rounded-xl text-sm transition-all border",
              submitted
                ? isCorrect ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : isWrong ? "bg-red-500/20 border-red-500/40 text-red-300"
                    : isMissed ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                      : "bg-white/5 border-white/10 text-white/50"
                : isSelected
                  ? "bg-indigo-500/20 border-indigo-500/40 text-white"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
            )}
          >
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center",
                isSelected && !submitted ? "border-indigo-400 bg-indigo-500" :
                  "border-white/30"
              )}>
                {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
              </div>
              {opt}
            </div>
          </button>
        );
      })}
      <p className="text-white/30 text-xs">Можно выбрать несколько</p>
    </div>
  );
}

function TextInputQ({ question, answer, onChange, submitted }: {
  question: Question; answer: string; onChange: (v: string) => void; submitted: boolean;
}) {
  return (
    <div className="space-y-2">
      <input
        value={answer}
        onChange={e => !submitted && onChange(e.target.value)}
        disabled={submitted}
        placeholder="Введите ответ"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
      />
      {submitted && (
        <p className="text-xs text-white/50">
          Правильный ответ: <span className="text-emerald-400 font-medium">{question.correctAnswer}</span>
        </p>
      )}
    </div>
  );
}

function QuestionView({ question, answer, onChange, submitted }: {
  question: Question;
  answer: any;
  onChange: (v: any) => void;
  submitted: boolean;
}) {
  const type = question.type;
  if (type === "single_choice") {
    return <SingleChoiceQ question={question} answer={answer || ""} onChange={onChange} submitted={submitted} />;
  }
  if (type === "multiple_choice") {
    return <MultipleChoiceQ question={question} answer={answer || []} onChange={onChange} submitted={submitted} />;
  }
  if (type === "fill_blank" || type === "text_input") {
    return <TextInputQ question={question} answer={answer || ""} onChange={onChange} submitted={submitted} />;
  }
  // Fallback for match/order
  return (
    <div>
      <input
        value={typeof answer === "string" ? answer : JSON.stringify(answer || [])}
        onChange={e => {
          try { onChange(JSON.parse(e.target.value)); }
          catch { onChange(e.target.value); }
        }}
        disabled={submitted}
        placeholder="Введите ответ (JSON)"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
      />
      {submitted && (
        <p className="text-xs text-white/50 mt-1">
          Правильный: <span className="text-emerald-400 font-mono">{JSON.stringify(question.correctAnswer)}</span>
        </p>
      )}
    </div>
  );
}

export default function TestPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const groupId = params.id as string;
  const courseId = params.courseId as string;
  const testId = params.testId as string;

  const [test, setTest] = useState<Test | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [startTime] = useState(Date.now());
  const timerRef = useRef<any>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    socialApi.getTest(groupId, courseId, testId)
      .then(data => {
        setTest(data);
        if (data.timeLimitSeconds) {
          setTimeLeft(data.timeLimitSeconds);
        }
      })
      .catch(() => toast.error("Ошибка загрузки теста"))
      .finally(() => setLoading(false));
  }, [groupId, courseId, testId]);

  useEffect(() => {
    if (timeLeft === null || attempt) return;
    if (timeLeft <= 0) { handleSubmit(); return; }
    timerRef.current = setTimeout(() => setTimeLeft(t => (t ?? 0) - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [timeLeft, attempt]);

  const handleSubmit = async () => {
    if (!test || submitting) return;
    clearTimeout(timerRef.current);
    setSubmitting(true);
    const timeTaken = Math.round((Date.now() - startTime) / 1000);
    const formattedAnswers = test.questions.map(q => ({
      questionId: q.id,
      id: q.id,
      answer: answers[q.id] ?? "",
    }));
    try {
      const result = await socialApi.submitTest(groupId, courseId, testId, {
        answers: formattedAnswers,
        timeTakenSeconds: timeTaken,
      });
      setAttempt(result.attempt ? result.attempt : result);
      if (result.passed) {
        toast.success(`Тест пройден! Результат: ${result.score}%`);
      } else {
        toast.error(`Тест не пройден. Результат: ${result.score}%`);
      }
    } catch { toast.error("Ошибка отправки"); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-60">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!test) return <div className="text-center text-white/50 py-20">Тест не найден</div>;

  const questions = test.questions || [];
  const submitted = !!attempt;

  // Results view
  if (submitted && attempt) {
    const gradedAnswers = attempt.answers || [];
    return (
      <div className="max-w-xl mx-auto">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Назад к курсу
        </button>

        {/* Score card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-3xl p-8 text-center mb-6"
        >
          <div className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4",
            attempt.passed ? "bg-emerald-500/20" : "bg-red-500/20"
          )}>
            {attempt.passed
              ? <Trophy className="w-10 h-10 text-emerald-400" />
              : <AlertCircle className="w-10 h-10 text-red-400" />}
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">
            {attempt.passed ? "Тест пройден!" : "Попробуйте снова"}
          </h2>
          <p className="text-white/50 text-sm mb-4">
            Результат: {attempt.score}% (порог: {test.passingScore}%)
          </p>
          <div className="text-5xl font-bold mb-2" style={{ color: attempt.passed ? "#34d399" : "#f87171" }}>
            {attempt.score}%
          </div>
          <div className="flex items-center justify-center gap-2 text-white/40 text-sm">
            <Clock className="w-4 h-4" />
            {formatTime(attempt.timeTakenSeconds)}
          </div>
          <div className="flex gap-3 justify-center mt-6">
            {!attempt.passed && (
              <button
                onClick={() => { setAttempt(null); setAnswers({}); setCurrentQ(0); if (test.timeLimitSeconds) setTimeLeft(test.timeLimitSeconds); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white/70 text-sm hover:bg-white/15 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Попробовать снова
              </button>
            )}
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-gradient text-white text-sm font-semibold"
            >
              <ChevronLeft className="w-4 h-4" />
              К курсу
            </button>
          </div>
        </motion.div>

        {/* Breakdown */}
        <div className="space-y-3">
          <h3 className="text-white/60 text-sm font-semibold">Разбор ответов</h3>
          {questions.map((q, i) => {
            const ga = gradedAnswers.find((a: any) => a.questionId === q.id);
            return (
              <div key={q.id} className="glass-card rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {ga?.correct
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <p className="text-white text-sm">{q.question}</p>
                    <p className="text-white/50 text-xs mt-1">
                      Ваш ответ: <span className={cn("font-medium", ga?.correct ? "text-emerald-400" : "text-red-400")}>
                        {Array.isArray(ga?.userAnswer) ? ga.userAnswer.join(", ") : String(ga?.userAnswer ?? "—")}
                      </span>
                    </p>
                    {!ga?.correct && ga?.correctAnswer !== undefined && (
                      <p className="text-white/50 text-xs">
                        Правильный: <span className="text-emerald-400 font-medium">
                          {Array.isArray(ga.correctAnswer) ? ga.correctAnswer.join(", ") : String(ga.correctAnswer)}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Test taking view
  const canShowAll = questions.length <= 10;

  return (
    <div className="max-w-xl mx-auto">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Назад
      </button>

      {/* Test header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-5 mb-5"
      >
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold text-white">{test.title}</h1>
          {timeLeft !== null && (
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-mono font-bold",
              timeLeft < 60 ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white"
            )}>
              <Clock className="w-4 h-4" />
              {formatTime(timeLeft)}
            </div>
          )}
        </div>
        {test.description && <p className="text-white/50 text-sm mb-3">{test.description}</p>}
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{questions.length} вопросов</span>
          <span>Порог: {test.passingScore}%</span>
          {!canShowAll && (
            <span>Вопрос {currentQ + 1} из {questions.length}</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/10 rounded-full mt-3 overflow-hidden">
          <motion.div
            animate={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
            className="h-full bg-indigo-500 rounded-full"
          />
        </div>
      </motion.div>

      {/* Question(s) */}
      {canShowAll ? (
        // Show all questions at once
        <div className="space-y-5">
          {questions.map((q, i) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass-card rounded-2xl p-5"
            >
              <p className="text-white font-medium text-sm mb-4">
                <span className="text-white/40 mr-2">{i + 1}.</span>
                {q.question}
              </p>
              <QuestionView
                question={q}
                answer={answers[q.id]}
                onChange={val => setAnswers(prev => ({ ...prev, [q.id]: val }))}
                submitted={false}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        // One question at a time
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQ}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="glass-card rounded-2xl p-5"
          >
            <p className="text-white font-medium text-sm mb-4">
              <span className="text-white/40 mr-2">{currentQ + 1}.</span>
              {questions[currentQ]?.question}
            </p>
            <QuestionView
              question={questions[currentQ]}
              answer={answers[questions[currentQ]?.id]}
              onChange={val => setAnswers(prev => ({ ...prev, [questions[currentQ].id]: val }))}
              submitted={false}
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Navigation / submit */}
      <div className="flex items-center gap-3 mt-6">
        {!canShowAll && (
          <>
            <button
              onClick={() => setCurrentQ(q => Math.max(0, q - 1))}
              disabled={currentQ === 0}
              className="p-2.5 rounded-xl bg-white/5 text-white/50 disabled:opacity-30 hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {currentQ < questions.length - 1 ? (
              <button
                onClick={() => setCurrentQ(q => Math.min(questions.length - 1, q + 1))}
                className="flex-1 py-2.5 rounded-xl bg-white/10 text-white text-sm hover:bg-white/15 transition-colors flex items-center justify-center gap-2"
              >
                Следующий
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl btn-gradient text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Завершить
              </button>
            )}
          </>
        )}

        {canShowAll && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-3 rounded-xl btn-gradient text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Отправить ответы
          </button>
        )}
      </div>

      {/* Answered count */}
      <p className="text-center text-white/30 text-xs mt-3">
        Отвечено: {Object.keys(answers).length} из {questions.length}
      </p>
    </div>
  );
}
