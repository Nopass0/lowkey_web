"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Timer, Star, Zap, Volume2, BookmarkPlus, RotateCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  const TOTAL_ROUNDS = 5;

  useEffect(() => {
    if (gameState !== "playing" || !currentWord || revealed) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          handleReveal();
          return 0;
        }
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
    setRevealedClues(1);
    setGuess("");
    setRevealed(false);
    setTimeLeft(30);
    try {
      const word = await aiApi.associationGame({ words: used, difficulty });
      setCurrentWord(word);
    } catch { toast.error("Ошибка загрузки слова"); }
    finally { setLoading(false); }
  };

  const handleRevealClue = () => {
    if (!currentWord) return;
    setRevealedClues((prev) => Math.min(prev + 1, currentWord.clues.length));
  };

  const handleGuess = () => {
    if (!currentWord || !guess.trim()) return;
    const isCorrect = guess.trim().toLowerCase() === currentWord.targetWord.toLowerCase();
    if (isCorrect) {
      const pts = Math.max(10, 50 - (revealedClues - 1) * 10) + Math.floor(timeLeft * 0.5);
      setScore((s) => s + pts);
      setCorrect((c) => c + 1);
      toast.success(`+${pts} очков! 🎉`);
      nextRound(true);
    } else {
      toast.error("Не правильно, попробуй ещё раз");
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
      setTimeout(() => loadNextWord(newUsed), 500);
    }
  };

  const handleSaveWord = async () => {
    if (!currentWord || savedWords.includes(currentWord.targetWord)) return;
    try {
      await gamesApi.saveWord({
        front: currentWord.targetWord,
        back: currentWord.translation,
        pronunciation: currentWord.pronunciation,
        examples: currentWord.examples,
        tags: [currentWord.category, "game"],
      });
      setSavedWords((s) => [...s, currentWord.targetWord]);
      toast.success("Слово сохранено как карточка! 📚");
    } catch { toast.error("Ошибка сохранения"); }
  };

  const speak = (text: string) => {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = 0.8;
      window.speechSynthesis.speak(u);
    }
  };

  if (gameState === "menu") return (
    <div className="max-w-2xl mx-auto text-center">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-8xl mb-6 animate-float">🎮</div>
        <h1 className="text-3xl font-bold mb-2">Игра Ассоциаций</h1>
        <p className="text-muted-foreground mb-8">AI даёт подсказки — ты угадываешь английское слово. Новые слова сохраняются в карточки!</p>

        <div className="glass-card rounded-2xl p-6 mb-6">
          <h3 className="font-semibold mb-4">Выбери сложность</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: "easy", label: "Лёгкая", emoji: "🌱", desc: "Простые слова" },
              { id: "medium", label: "Средняя", emoji: "⚡", desc: "Разнообразная" },
              { id: "hard", label: "Сложная", emoji: "🔥", desc: "Продвинутые" },
            ].map((d) => (
              <button key={d.id} onClick={() => setDifficulty(d.id as any)}
                className={cn("p-4 rounded-xl border transition-all", difficulty === d.id ? "border-primary bg-accent" : "border-border hover:bg-accent/50")}>
                <div className="text-2xl mb-1">{d.emoji}</div>
                <div className="font-semibold text-sm">{d.label}</div>
                <div className="text-xs text-muted-foreground">{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8 text-sm text-muted-foreground">
          {[["🎯", `${TOTAL_ROUNDS} раундов`], ["💡", "До 4 подсказок"], ["📚", "Слова → карточки"]].map(([e, t]) => (
            <div key={t} className="glass-card rounded-xl p-3">
              <div className="text-2xl mb-1">{e}</div>{t}
            </div>
          ))}
        </div>

        <Button variant="gradient" size="xl" onClick={startGame} disabled={loading} className="px-12">
          {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Играть"}
        </Button>
      </motion.div>
    </div>
  );

  if (gameState === "result") return (
    <div className="max-w-md mx-auto text-center">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="text-7xl mb-4">{correct >= 4 ? "🏆" : correct >= 2 ? "🥈" : "💪"}</div>
        <h2 className="text-2xl font-bold mb-2">Игра завершена!</h2>
        <div className="glass-card rounded-2xl p-6 my-6 space-y-3">
          <div className="flex justify-between"><span>Очки</span><span className="font-bold gradient-text text-xl">{score}</span></div>
          <div className="flex justify-between"><span>Правильно</span><span className="text-green-400 font-semibold">{correct}/{TOTAL_ROUNDS}</span></div>
          <div className="flex justify-between"><span>Слов изучено</span><span className="text-blue-400 font-semibold">{usedWords.length}</span></div>
          <div className="flex justify-between"><span>Сохранено карточек</span><span className="text-purple-400 font-semibold">{savedWords.length}</span></div>
        </div>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => setGameState("menu")}><RotateCcw size={16} className="mr-2" />Заново</Button>
          <Button variant="gradient" onClick={startGame} disabled={loading}>Ещё раунд</Button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-xl font-bold gradient-text">{score} очков</div>
          <Badge variant="outline">Раунд {round + 1}/{TOTAL_ROUNDS}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Timer size={16} className={timeLeft <= 10 ? "text-red-400 animate-pulse" : "text-muted-foreground"} />
          <span className={cn("font-mono font-bold", timeLeft <= 10 ? "text-red-400" : "")}>{timeLeft}с</span>
        </div>
      </div>
      <Progress value={(timeLeft / 30) * 100} className="h-1.5" />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-border border-t-primary rounded-full animate-spin mx-auto mb-3" />
            <p className="text-muted-foreground">AI придумывает слово...</p>
          </div>
        </div>
      ) : currentWord && (
        <AnimatePresence mode="wait">
          <motion.div key={currentWord.targetWord} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Badge className="mb-2">{currentWord.category}</Badge>
                  <h3 className="font-semibold text-lg">Угадай слово по подсказкам:</h3>
                </div>
                {revealed && (
                  <button onClick={() => speak(currentWord.targetWord)} className="p-2 rounded-full bg-accent hover:bg-accent/80">
                    <Volume2 size={16} />
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {currentWord.clues.slice(0, revealedClues).map((clue, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    className={cn("p-3 rounded-xl text-sm", i === revealedClues - 1 ? "bg-gradient-to-r from-red-500/10 to-blue-500/10 border border-white/10" : "bg-accent/50")}>
                    <span className="text-muted-foreground mr-2">{i + 1}.</span>{clue}
                  </motion.div>
                ))}
              </div>

              {revealed ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30">
                  <div className="text-2xl font-bold mb-1">{currentWord.targetWord}</div>
                  <div className="text-sm text-muted-foreground font-mono mb-1">{currentWord.pronunciation}</div>
                  <div className="text-sm font-semibold">{currentWord.translation}</div>
                  {currentWord.examples[0] && <div className="text-xs text-muted-foreground mt-2 italic">"{currentWord.examples[0]}"</div>}
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" onClick={handleSaveWord} disabled={savedWords.includes(currentWord.targetWord)} className="gap-2">
                      <BookmarkPlus size={14} />
                      {savedWords.includes(currentWord.targetWord) ? "Сохранено" : "В карточки"}
                    </Button>
                    <Button variant="gradient" size="sm" onClick={() => nextRound(false)}>
                      {round + 1 >= TOTAL_ROUNDS ? "Завершить" : "Следующее →"}
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
                      className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Button variant="gradient" onClick={handleGuess} disabled={!guess.trim()}>
                      <Check />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    {revealedClues < (currentWord.clues.length || 4) && (
                      <Button variant="outline" size="sm" onClick={handleRevealClue} className="gap-1">
                        <Zap size={14} />Подсказка ({currentWord.clues.length - revealedClues} ост.)
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={handleReveal} className="text-muted-foreground">
                      Показать ответ
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function Check() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>; }
