"use client";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, RotateCcw, Check, X, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useCardsStore } from "@/store/cards";
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import type { Card } from "@/store/cards";

export default function StudyPage() {
  const { dueCards, fetchDueCards, reviewCard, startSession, finishSession } = useCardsStore();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [incorrect, setIncorrect] = useState(0);
  const [done, setDone] = useState(false);
  const [startTime] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchDueCards().finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (dueCards.length > 0 && queue.length === 0 && !done) {
      setQueue([...dueCards].slice(0, 20));
      startSession({ mode: "review" }).then((s) => setSessionId(s.id));
    }
  }, [dueCards]);

  const currentCard = queue[currentIdx];
  const progress = queue.length > 0 ? (currentIdx / queue.length) * 100 : 0;

  const handleRate = useCallback(async (quality: number) => {
    if (!currentCard) return;
    try {
      await reviewCard(currentCard.id, quality, sessionId || undefined);
      if (quality >= 3) setCorrect((c) => c + 1);
      else setIncorrect((c) => c + 1);
    } catch {}

    setFlipped(false);
    setTimeout(() => {
      if (currentIdx + 1 >= queue.length) {
        setDone(true);
        if (sessionId) {
          const duration = Math.floor((Date.now() - startTime) / 1000);
          finishSession(sessionId, {
            totalCards: queue.length,
            correctCards: correct + (quality >= 3 ? 1 : 0),
            incorrectCards: incorrect + (quality < 3 ? 1 : 0),
            durationSeconds: duration,
          });
        }
      } else {
        setCurrentIdx((i) => i + 1);
      }
    }, 200);
  }, [currentCard, currentIdx, queue, correct, incorrect, sessionId]);

  const handleFlip = () => setFlipped(!flipped);

  const speakWord = (text: string) => {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.8;
      window.speechSynthesis.speak(u);
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (dueCards.length === 0 && !done) return (
    <div className="flex flex-col items-center justify-center h-96 text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-6xl mb-4">🎉</motion.div>
      <h2 className="text-2xl font-bold mb-2">Все карточки повторены!</h2>
      <p className="text-muted-foreground mb-6">Возвращайся завтра за новыми заданиями</p>
      <Button variant="gradient" onClick={() => router.push("/vocabulary")}>Добавить карточки</Button>
    </div>
  );

  if (done) return (
    <div className="flex flex-col items-center justify-center h-96 text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-6xl mb-4">
        {correct / queue.length >= 0.8 ? "🏆" : correct / queue.length >= 0.5 ? "👍" : "💪"}
      </motion.div>
      <h2 className="text-2xl font-bold mb-2">Сессия завершена!</h2>
      <div className="flex gap-6 my-4">
        <div className="text-center"><div className="text-3xl font-bold text-green-400">{correct}</div><div className="text-sm text-muted-foreground">Правильно</div></div>
        <div className="text-center"><div className="text-3xl font-bold text-red-400">{incorrect}</div><div className="text-sm text-muted-foreground">Ошибок</div></div>
        <div className="text-center"><div className="text-3xl font-bold gradient-text">{Math.round((correct / queue.length) * 100)}%</div><div className="text-sm text-muted-foreground">Точность</div></div>
      </div>
      <div className="flex gap-3 mt-4">
        <Button variant="outline" onClick={() => { setCurrentIdx(0); setDone(false); setCorrect(0); setIncorrect(0); setFlipped(false); }}>
          <RotateCcw size={16} className="mr-2" />Повторить
        </Button>
        <Button variant="gradient" onClick={() => router.push("/dashboard")}>На главную</Button>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
          <ChevronLeft size={20} />
        </Button>
        <div className="flex-1">
          <div className="flex justify-between text-sm text-muted-foreground mb-1">
            <span>Карточка {currentIdx + 1} из {queue.length}</span>
            <span className="flex gap-3">
              <span className="text-green-400">✓ {correct}</span>
              <span className="text-red-400">✗ {incorrect}</span>
            </span>
          </div>
          <Progress value={progress} gradient className="h-2" />
        </div>
      </div>

      {/* Flashcard */}
      <AnimatePresence mode="wait">
        {currentCard && (
          <motion.div
            key={currentCard.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
            className="flip-card h-72 cursor-pointer"
            onClick={handleFlip}
          >
            <div className={`flip-card-inner ${flipped ? "flipped" : ""}`}>
              {/* Front */}
              <div className="flip-card-front glass-card rounded-3xl flex flex-col items-center justify-center p-8 select-none">
                <div className="text-5xl font-bold mb-4 gradient-text">{currentCard.front}</div>
                {currentCard.pronunciation && (
                  <div className="text-lg text-muted-foreground font-mono mb-3">{currentCard.pronunciation}</div>
                )}
                <button
                  className="p-2 rounded-full bg-accent hover:bg-accent/80 transition-colors"
                  onClick={(e) => { e.stopPropagation(); speakWord(currentCard.front); }}
                >
                  <Volume2 size={18} />
                </button>
                <p className="text-sm text-muted-foreground mt-6 animate-pulse">Нажми чтобы перевернуть</p>
              </div>

              {/* Back */}
              <div className="flip-card-back glass-card rounded-3xl flex flex-col items-center justify-center p-8 select-none bg-gradient-to-br from-red-500/10 to-blue-500/10">
                <div className="text-4xl font-bold mb-3">{currentCard.back}</div>
                {currentCard.examples?.length > 0 && (
                  <div className="text-sm text-muted-foreground text-center max-w-xs mt-2">
                    <span className="italic">"{currentCard.examples[0]}"</span>
                  </div>
                )}
                {currentCard.tags?.length > 0 && (
                  <div className="flex gap-2 flex-wrap justify-center mt-3">
                    {currentCard.tags.map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-accent text-muted-foreground">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rating buttons */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="space-y-3"
          >
            <p className="text-center text-sm text-muted-foreground">Насколько хорошо ты знал это слово?</p>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2, 3, 4, 5].slice(0, 3).map((q) => (
                <Button key={q} size="lg" onClick={() => handleRate(q)}
                  className={cn("text-white font-semibold rounded-xl", DIFFICULTY_COLORS[q])}>
                  {DIFFICULTY_LABELS[q]}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[3, 4, 5].map((q) => (
                <Button key={q} size="lg" onClick={() => handleRate(q)}
                  className={cn("text-white font-semibold rounded-xl", DIFFICULTY_COLORS[q])}>
                  {DIFFICULTY_LABELS[q]}
                </Button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!flipped && (
        <div className="flex justify-center gap-3">
          <Button variant="outline" size="lg" onClick={() => handleRate(0)} className="gap-2 text-red-400 border-red-400/30">
            <X size={16} />Не знаю
          </Button>
          <Button variant="gradient" size="lg" onClick={handleFlip} className="gap-2">
            Показать ответ <Sparkles size={16} />
          </Button>
          <Button variant="outline" size="lg" onClick={() => handleRate(5)} className="gap-2 text-green-400 border-green-400/30">
            <Check size={16} />Знаю
          </Button>
        </div>
      )}
    </div>
  );
}
