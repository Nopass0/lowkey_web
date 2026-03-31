"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen, Flame, Star, Target, Zap, ArrowRight,
  Brain, Gamepad2, Mic, BookMarked, Swords, Search,
  TrendingUp, CheckCircle2, Clock, Trophy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/store/auth";
import { useCardsStore } from "@/store/cards";
import { aiApi, progressApi, dictionaryApi } from "@/api/client";
import Link from "next/link";
import { getXpForLevel } from "@/lib/utils";

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { fetchDueCards, dueCards, fetchDecks, decks } = useCardsStore();
  const [dailyPlan, setDailyPlan] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [wordOfDay, setWordOfDay] = useState<any>(null);

  useEffect(() => {
    fetchDueCards();
    fetchDecks();
    aiApi.getDailyPlan().then(setDailyPlan).catch(() => {});
    progressApi.getSummary().then(setSummary).catch(() => {});
    dictionaryApi.wordOfDay().then(setWordOfDay).catch(() => {});
  }, []);

  const xpInfo = user ? getXpForLevel(user.xp || 0) : null;
  const dailyGoal = dailyPlan?.dailyGoal || 20;
  const studiedToday = dailyPlan?.studiedToday || 0;
  const dailyProgress = Math.min(100, Math.round((studiedToday / dailyGoal) * 100));

  const quickActions = [
    {
      href: "/study", icon: BookOpen, label: "Учить карточки",
      desc: `${dueCards.length} ожидают`, color: "text-blue-500",
      bg: "bg-blue-500/10 hover:bg-blue-500/15", border: "border-blue-500/20"
    },
    {
      href: "/quests", icon: Swords, label: "Квест дня",
      desc: "AI ситуация", color: "text-violet-500",
      bg: "bg-violet-500/10 hover:bg-violet-500/15", border: "border-violet-500/20"
    },
    {
      href: "/pronunciation", icon: Mic, label: "Произношение",
      desc: "Тренировка", color: "text-emerald-500",
      bg: "bg-emerald-500/10 hover:bg-emerald-500/15", border: "border-emerald-500/20"
    },
    {
      href: "/grammar", icon: BookMarked, label: "Грамматика",
      desc: "Правила и тесты", color: "text-amber-500",
      bg: "bg-amber-500/10 hover:bg-amber-500/15", border: "border-amber-500/20"
    },
    {
      href: "/games", icon: Gamepad2, label: "Ассоциации",
      desc: "Новые слова", color: "text-pink-500",
      bg: "bg-pink-500/10 hover:bg-pink-500/15", border: "border-pink-500/20"
    },
    {
      href: "/dictionary", icon: Search, label: "Переводчик",
      desc: "Поиск слов", color: "text-cyan-500",
      bg: "bg-cyan-500/10 hover:bg-cyan-500/15", border: "border-cyan-500/20"
    },
  ];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-5xl mx-auto space-y-5 page-enter">

      {/* Hero greeting */}
      <motion.div variants={item} className="flex items-start justify-between">
        <div>
          <p className="text-muted-foreground text-sm mb-1">
            {new Date().toLocaleDateString("ru", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="text-2xl font-semibold">
            Привет, {user?.name?.split(" ")[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {dueCards.length > 0
              ? `${dueCards.length} карточек ждут повторения — продолжай серию!`
              : "Все карточки повторены. Отличная работа 🎉"}
          </p>
        </div>
        {user?.studyStreak && user.studyStreak > 1 && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center gap-0.5 bg-orange-500/10 border border-orange-500/20 rounded-2xl px-4 py-3"
          >
            <Flame size={22} className="text-orange-500" />
            <span className="text-xl font-bold text-orange-500">{user.studyStreak}</span>
            <span className="text-[10px] text-muted-foreground">дней подряд</span>
          </motion.div>
        )}
      </motion.div>

      {/* Stats row */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Star, label: "XP", value: (user?.xp || 0).toLocaleString(), color: "text-yellow-500", bg: "bg-yellow-500/10" },
          { icon: BookOpen, label: "Карточек", value: summary?.totalCards || 0, color: "text-blue-500", bg: "bg-blue-500/10" },
          { icon: CheckCircle2, label: "Освоено", value: summary?.cardsByStatus?.mastered || 0, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { icon: TrendingUp, label: "Точность", value: summary?.accuracy ? `${summary.accuracy}%` : "—", color: "text-violet-500", bg: "bg-violet-500/10" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="glass-card rounded-2xl p-4 flex items-center gap-3 card-hover">
              <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={17} className={stat.color} />
              </div>
              <div>
                <div className={`font-semibold text-lg leading-tight ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Daily goal + XP level */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Daily goal */}
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Target size={14} className="text-primary" />
              </div>
              <span className="font-medium text-sm">Дневная цель</span>
            </div>
            <span className="text-sm font-semibold text-muted-foreground">
              {studiedToday} / {dailyGoal}
            </span>
          </div>
          <Progress value={dailyProgress} gradient className="h-2 mb-2" />
          {dailyProgress >= 100 ? (
            <p className="text-xs text-emerald-500 font-medium flex items-center gap-1">
              <CheckCircle2 size={12} /> Цель выполнена! Отлично!
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Осталось {Math.max(0, dailyGoal - studiedToday)} карточек
            </p>
          )}
        </div>

        {/* XP Level */}
        {xpInfo && (
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Zap size={14} className="text-yellow-500" />
                </div>
                <span className="font-medium text-sm">Уровень: <span className="gradient-text">{xpInfo.label}</span></span>
              </div>
              <span className="text-sm text-muted-foreground font-semibold">{xpInfo.current} / {xpInfo.next}</span>
            </div>
            <Progress value={xpInfo.next > 0 ? (xpInfo.current / xpInfo.next) * 100 : 100} gradient className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground">{xpInfo.next - xpInfo.current} XP до следующего уровня</p>
          </div>
        )}
      </motion.div>

      {/* Quick actions */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Разделы</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href}>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className={`p-4 rounded-2xl ${action.bg} border ${action.border} cursor-pointer transition-all duration-150 group`}
                >
                  <div className={`${action.color} mb-2.5`}>
                    <Icon size={20} />
                  </div>
                  <div className="font-semibold text-sm leading-tight">{action.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{action.desc}</div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </motion.div>

      {/* Word of the day + AI suggestions row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Word of the day */}
        {wordOfDay && (
          <motion.div variants={item} className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Trophy size={14} className="text-cyan-500" />
              </div>
              <span className="font-medium text-sm">Слово дня</span>
            </div>
            <div className="font-bold text-xl text-foreground mb-0.5">{wordOfDay.word}</div>
            {wordOfDay.phonetic && (
              <div className="text-xs font-mono text-muted-foreground mb-2">{wordOfDay.phonetic}</div>
            )}
            {wordOfDay.russianTranslations?.length > 0 && (
              <div className="text-sm text-foreground/80 mb-2">
                {wordOfDay.russianTranslations.slice(0, 2).join(", ")}
              </div>
            )}
            {wordOfDay.examples?.[0] && (
              <div className="text-xs text-muted-foreground italic border-l-2 border-cyan-500/30 pl-2">
                {wordOfDay.examples[0].en}
              </div>
            )}
            <Link href={`/dictionary?q=${wordOfDay.word}`}>
              <button className="mt-3 text-xs text-cyan-500 hover:text-cyan-400 font-medium flex items-center gap-1">
                Подробнее <ArrowRight size={11} />
              </button>
            </Link>
          </motion.div>
        )}

        {/* AI suggestions */}
        {dailyPlan?.suggestions?.length > 0 && (
          <motion.div variants={item} className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Brain size={14} className="text-violet-500" />
              </div>
              <span className="font-medium text-sm">Рекомендации AI</span>
            </div>
            <div className="space-y-1.5">
              {dailyPlan.suggestions.slice(0, 3).map((s: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <div className="w-4 h-4 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[9px] font-bold text-violet-500">{i + 1}</span>
                  </div>
                  <span className="leading-relaxed">{s}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Recent decks */}
      {decks.length > 0 && (
        <motion.div variants={item}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Мои наборы</h2>
            <Link href="/vocabulary">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7 px-2">
                Все <ArrowRight size={12} />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {decks.slice(0, 3).map((deck) => (
              <Link key={deck.id} href={`/vocabulary?deck=${deck.id}`}>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="glass-card rounded-2xl p-4 cursor-pointer card-hover"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
                      style={{ background: `${deck.color}20` }}>
                      {deck.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{deck.name}</div>
                      <div className="text-xs text-muted-foreground">{deck.cardCount} карточек</div>
                    </div>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
