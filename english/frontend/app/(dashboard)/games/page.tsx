"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Timer, Zap, Volume2, BookmarkPlus, RotateCcw,
  Trophy, ChevronRight, Check, Lightbulb, Star,
  Gamepad2, ArrowRight, Flame
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiApi, gamesApi } from "@/api/client";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface GameWord {
  targetWord: string;
  clues: string[];
  category: string;
  definition: string;
  translation: string;
  pronunciation: string;
  examples: string[];
}

const DIFFICULTIES = [
  { id: "easy",   label: "Лёгкий",    desc: "A1–A2 слова",      color: "from-emerald-500/20 to-green-500/10",   border: "border-emerald-500/30",   text: "text-emerald-500",   icon: "🌱" },
  { id: "medium", label: "Средний",   desc: "B1–B2 слова",      color: "from-blue-500/20 to-indigo-500/10",     border: "border-blue-500/30",      text: "text-blue-500",     icon: "⚡" },
  { id: "hard",   label: "Сложный",   desc: "C1–C2 слова",      color: "from-red-500/20 to-orange-500/10",      border: "border-red-500/30",       text: "text-red-500",      icon: "🔥" },
];

const TOTAL_ROUNDS = 5;

export default function GamesPage() {
  const [gameState, setGameState] = useState<"menu" | "playing" | "result">("menu");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentWord, setCurrentWord] = useState<GameWord | null>(null);
  const [revealedClues, setRevealedClues] = useState(0);
  const [guess, setGuess] = useState("");
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [usedWords, setUsedWords] = useState<string[]>([]);
  const [savedWords, setSavedWords] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  useEffect(() => {
    if (gameState !== "playing" || !currentWord || revealed) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(t); handleReveal(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [gameState, currentWord, revealed]);

  const startGame = async () => {
    setLoading(true);
    try {
      const session = await gamesApi.createSession({ gameType: "association" });
      setSessionId(session.id);
      setScore(0); setRound(0); setCorrect(0); setUsedWords([]); setSavedWords([]);
      setGameState("playing");
      await loadNextWord([]);
    } catch { toast.error("Ошибка старта игры"); }
    finally { setLoading(false); }
  };

  const loadNextWord = async (used: string[]) => {
    setLoading(true);
    setRevealedClues(1); setGuess(""); setRevealed(false); setTimeLeft(30);
    try {
      const word = await aiApi.associationGame({ words: used, difficulty });
      setCurrentWord(word);
    } catch { toast.error("Ошибка загрузки слова"); }
    finally { setLoading(false); }
  };

  const handleGuess = () => {
    if (!currentWord || !guess.trim()) return;
    const isCorrect = guess.trim().toLowerCase() === currentWord.targetWord.toLowerCase();
    if (isCorrect) {
      const pts = Math.max(10, 50 - (revealedClues - 1) * 10) + Math.floor(timeLeft * 0.5);
      setScore((s) => s + pts);
      setCorrect((c) => c + 1);
      toast.success(`+${pts} очков!`);
      nextRound(true);
    } else {
      toast.error("Неверно — попробуй ещё");
    }
  };

  const handleReveal = () => {
    setRevealed(true);
    setRevealedClues(currentWord?.clues.length || 4);
  };

  const nextRound = (wasCorrect: boolean) => {
    if (!currentWord) return;
    const newUsed = [...usedWords, currentWord.targetWord];
    setUsedWords(newUsed);
    const newRound = round + 1;
    setRound(newRound);
    if (newRound >= TOTAL_ROUNDS) {
      if (sessionId) {
        gamesApi.updateSession(sessionId, {
          score, totalRounds: TOTAL_ROUNDS, correctAnswers: correct + (wasCorrect ? 1 : 0),
          durationSeconds: TOTAL_ROUNDS * 30 - timeLeft, xpEarned: score,
          wordsLearned: newUsed,
        }).catch(() => {});
      }
      setGameState("result");
    } else {
      setTimeout(() => loadNextWord(newUsed), 400);
    }
  };

  const handleSaveWord = async () => {
    if (!currentWord || savedWords.includes(currentWord.targetWord)) return;
    try {
      await gamesApi.saveWord({
        front: currentWord.targetWord, back: currentWord.translation,
        pronunciation: currentWord.pronunciation, examples: currentWord.examples,
        tags: [currentWord.category, "game"],
      });
      setSavedWords((s) => [...s, currentWord.targetWord]);
      toast.success(`"${currentWord.targetWord}" добавлено в карточки`);
    } catch { toast.error("Ошибка сохранения"); }
  };

  const speak = (text: string) => {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = 0.85;
      const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
      if (voices.length) u.voice = voices.find(v => v.name.includes("Google")) || voices[0];
      window.speechSynthesis.speak(u);
    }
  };

  // ——— MENU ———
  if (gameState === "menu") return (
    <div className="max-w-lg mx-auto space-y-5 page-enter">
      <div className="text-center pt-4 pb-2">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
          <Gamepad2 size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold">Игра Ассоциаций</h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">
          AI даёт подсказки — ты угадываешь английское слово
        </p>
      </div>

      {/* Difficulty selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Сложность</p>
        {DIFFICULTIES.map((d) => (
          <motion.button
            key={d.id}
            whileTap={{ scale: 0.98 }}
            onClick={() => setDifficulty(d.id as any)}
            className={cn(
              "w-full flex items-center gap-3 p-4 rounded-2xl border bg-gradient-to-r transition-all text-left",
              difficulty === d.id
                ? `${d.color} ${d.border} ring-2 ring-offset-1 ring-offset-background ${d.text.replace("text-", "ring-")}`
                : "border-border/50 hover:border-border bg-card/50"
            )}
          >
            <span className="text-2xl">{d.icon}</span>
            <div className="flex-1">
              <div className={cn("font-semibold text-sm", difficulty === d.id ? d.text : "")}>{d.label}</div>
              <div className="text-xs text-muted-foreground">{d.desc}</div>
            </div>
            <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
              difficulty === d.id ? `border-current ${d.text}` : "border-border")}>
              {difficulty === d.id && <div className="w-2.5 h-2.5 rounded-full bg-current" />}
            </div>
          </motion.button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Star size={16} className="text-yellow-500" />, label: `${TOTAL_ROUNDS} раундов` },
          { icon: <Lightbulb size={16} className="text-blue-500" />, label: "До 4 подсказок" },
          { icon: <BookmarkPlus size={16} className="text-violet-500" />, label: "Слова → карточки" },
        ].map((item, i) => (
          <div key={i} className="glass-card rounded-xl p-3 flex flex-col items-center gap-1.5 text-center">
            {item.icon}
            <span className="text-[11px] text-muted-foreground leading-tight">{item.label}</span>
          </div>
        ))}
      </div>

      <Button
        className="w-full btn-gradient h-12 text-base gap-2 font-semibold"
        onClick={startGame} disabled={loading}
      >
        {loading
          ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Загружаю...</>
          : <><Gamepad2 size={18} />Начать игру</>
        }
      </Button>
    </div>
  );

  // ——— RESULT ———
  if (gameState === "result") {
    const pct = Math.round((correct / TOTAL_ROUNDS) * 100);
    return (
      <div className="max-w-md mx-auto page-enter">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-5">
          <div className="pt-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Trophy size={36} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold">Игра завершена!</h2>
            <p className="text-muted-foreground text-sm mt-1">{correct >= 4 ? "Отличный результат!" : correct >= 2 ? "Хорошая попытка!" : "Продолжайте практиковаться!"}</p>
          </div>

          <div className="glass-card rounded-2xl p-5 space-y-3">
            {[
              { label: "Очки", value: score, color: "gradient-text text-2xl font-bold" },
              { label: "Правильных ответов", value: `${correct}/${TOTAL_ROUNDS}`, color: "text-emerald-500 font-semibold" },
              { label: "Слов изучено", value: usedWords.length, color: "text-blue-500 font-semibold" },
              { label: "Сохранено карточек", value: savedWords.length, color: "text-violet-500 font-semibold" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{row.label}</span>
                <span className={row.color}>{row.value}</span>
              </div>
            ))}
            {/* Progress bar */}
            <div className="mt-2">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                />
              </div>
              <div className="text-[10px] text-muted-foreground text-right mt-1">{pct}% точность</div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 gap-2" onClick={() => setGameState("menu")}>
              <RotateCcw size={15} />Меню
            </Button>
            <Button className="flex-1 btn-gradient gap-2" onClick={startGame} disabled={loading}>
              <ArrowRight size={15} />Ещё раунд
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ——— PLAYING ———
  const diff = DIFFICULTIES.find(d => d.id === difficulty);
  const timerPct = (timeLeft / 30) * 100;

  return (
    <div className="max-w-xl mx-auto space-y-4 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-sm font-semibold">
            <Flame size={14} className="text-orange-500" />
            {score} очков
          </div>
          <span className="text-xs text-muted-foreground">Раунд {round + 1}/{TOTAL_ROUNDS}</span>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-mono font-bold transition-colors",
          timeLeft <= 10 ? "bg-red-500/15 text-red-500" : "bg-accent text-foreground"
        )}>
          <Timer size={13} className={timeLeft <= 10 ? "animate-pulse" : ""} />
          {timeLeft}с
        </div>
      </div>

      {/* Timer bar */}
      <div className="h-1 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full transition-colors", timeLeft <= 10 ? "bg-red-500" : "bg-gradient-to-r from-blue-500 to-violet-500")}
          style={{ width: `${timerPct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Round progress dots */}
      <div className="flex items-center justify-center gap-1.5">
        {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
          <div key={i} className={cn(
            "h-1.5 rounded-full transition-all",
            i < round ? "bg-emerald-500 w-6" : i === round ? "bg-primary w-8" : "bg-border w-4"
          )} />
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin" />
          <p className="text-sm text-muted-foreground">AI придумывает слово...</p>
        </div>
      ) : currentWord && (
        <AnimatePresence mode="wait">
          <motion.div key={currentWord.targetWord} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }} className="space-y-4">

            {/* Category badge */}
            <div className="flex items-center justify-between">
              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-lg border", diff?.color, diff?.border, diff?.text)}>
                {currentWord.category}
              </span>
              <span className="text-xs text-muted-foreground">
                Подсказка {revealedClues}/{currentWord.clues.length}
              </span>
            </div>

            {/* Clues */}
            <div className="space-y-2">
              {currentWord.clues.slice(0, revealedClues).map((clue, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    "flex items-start gap-3 p-3.5 rounded-xl text-sm",
                    i === revealedClues - 1
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-accent/60"
                  )}
                >
                  <span className="text-xs font-bold text-muted-foreground w-4 flex-shrink-0 mt-0.5">{i + 1}</span>
                  <span className="leading-relaxed">{clue}</span>
                </motion.div>
              ))}
            </div>

            {/* Answer / Revealed */}
            {revealed ? (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-green-500/5 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-2xl font-bold">{currentWord.targetWord}</div>
                    <div className="text-sm font-mono text-muted-foreground">{currentWord.pronunciation}</div>
                    <div className="text-sm font-semibold mt-1">{currentWord.translation}</div>
                  </div>
                  <button onClick={() => speak(currentWord.targetWord)}
                    className="p-2 rounded-xl bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-colors">
                    <Volume2 size={16} />
                  </button>
                </div>
                {currentWord.examples[0] && (
                  <p className="text-xs text-muted-foreground italic border-l-2 border-emerald-500/30 pl-3 mb-3">
                    "{currentWord.examples[0]}"
                  </p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSaveWord}
                    disabled={savedWords.includes(currentWord.targetWord)}>
                    <BookmarkPlus size={13} />
                    {savedWords.includes(currentWord.targetWord) ? "Сохранено" : "В карточки"}
                  </Button>
                  <Button size="sm" className="btn-gradient gap-1.5 flex-1" onClick={() => nextRound(false)}>
                    {round + 1 >= TOTAL_ROUNDS ? "Завершить" : "Следующее"}
                    <ChevronRight size={13} />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGuess()}
                    placeholder="Введи слово по-английски..."
                    className="flex-1 h-11 rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                    autoFocus
                  />
                  <Button
                    className="btn-gradient h-11 px-4 gap-1.5"
                    onClick={handleGuess} disabled={!guess.trim()}
                  >
                    <Check size={16} />
                  </Button>
                </div>
                <div className="flex gap-2">
                  {revealedClues < currentWord.clues.length && (
                    <Button variant="outline" size="sm" className="gap-1.5 flex-1"
                      onClick={() => setRevealedClues(p => Math.min(p + 1, currentWord.clues.length))}>
                      <Lightbulb size={13} className="text-yellow-500" />
                      Подсказка ({currentWord.clues.length - revealedClues} ост.)
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleReveal}>
                    Показать ответ
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
