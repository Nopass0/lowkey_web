"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Flame, Star, Target, Zap, ArrowRight, Brain, Gamepad2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/auth";
import { useCardsStore } from "@/store/cards";
import { aiApi, progressApi } from "@/api/client";
import Link from "next/link";
import { getXpForLevel } from "@/lib/utils";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { fetchDueCards, dueCards, fetchDecks, decks } = useCardsStore();
  const [dailyPlan, setDailyPlan] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    fetchDueCards();
    fetchDecks();
    aiApi.getDailyPlan().then(setDailyPlan).catch(() => {});
    progressApi.getSummary().then(setSummary).catch(() => {});
  }, []);

  const xpInfo = user ? getXpForLevel(user.xp || 0) : null;
  const dailyProgress = dailyPlan
    ? Math.min(100, Math.round(((dailyPlan.studiedToday || 0) / (dailyPlan.dailyGoal || 20)) * 100))
    : 0;

  const quickActions = [
    { href: "/study", icon: "📖", label: "Учить карточки", desc: `${dueCards.length} ожидает`, color: "from-blue-500/20 to-purple-500/20", border: "border-blue-500/20" },
    { href: "/games", icon: "🎮", label: "Игра ассоциаций", desc: "Новые слова", color: "from-green-500/20 to-emerald-500/20", border: "border-green-500/20" },
    { href: "/pronunciation", icon: "🗣️", label: "Произношение", desc: "Тренировка", color: "from-orange-500/20 to-red-500/20", border: "border-orange-500/20" },
    { href: "/recordings", icon: "🎙️", label: "Запись речи", desc: "Дневник", color: "from-pink-500/20 to-rose-500/20", border: "border-pink-500/20" },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <motion.div variants={item} className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Привет, {user?.name?.split(" ")[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            {dailyPlan?.dueCards > 0
              ? `У тебя ${dailyPlan.dueCards} карточек для повторения`
              : "Отличная работа! Все карточки повторены 🎉"}
          </p>
        </div>
        {user?.isPremium && <Badge variant="premium" className="text-sm px-3 py-1">✨ Premium</Badge>}
      </motion.div>

      {/* Stats row */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: "🔥", label: "Серия", value: `${user?.studyStreak || 0} дней`, color: "text-orange-400" },
          { icon: "⭐", label: "XP", value: user?.xp?.toLocaleString() || "0", color: "text-yellow-400" },
          { icon: "📚", label: "Карточек", value: summary?.totalCards || 0, color: "text-blue-400" },
          { icon: "✅", label: "Освоено", value: summary?.cardsByStatus?.mastered || 0, color: "text-green-400" },
        ].map((stat) => (
          <div key={stat.label} className="glass-card rounded-2xl p-4 flex items-center gap-3 card-hover">
            <span className="text-2xl">{stat.icon}</span>
            <div>
              <div className={`font-bold text-lg ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Daily goal */}
      <motion.div variants={item} className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-purple-400" />
            <span className="font-semibold">Дневная цель</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {dailyPlan?.studiedToday || 0} / {dailyPlan?.dailyGoal || 20} карточек
          </span>
        </div>
        <Progress value={dailyProgress} gradient className="h-3" />
        {dailyProgress >= 100 && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-green-400 mt-2 font-medium">
            🎉 Цель выполнена! Отличная работа!
          </motion.p>
        )}
      </motion.div>

      {/* XP Level */}
      {xpInfo && (
        <motion.div variants={item} className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-yellow-400" />
              <span className="font-semibold">Уровень: <span className="gradient-text">{xpInfo.label}</span></span>
            </div>
            <span className="text-sm text-muted-foreground">{xpInfo.current} / {xpInfo.next} XP</span>
          </div>
          <Progress value={xpInfo.next > 0 ? (xpInfo.current / xpInfo.next) * 100 : 100} gradient className="h-2" />
        </motion.div>
      )}

      {/* Quick actions */}
      <motion.div variants={item}>
        <h2 className="font-semibold mb-3 text-lg">Быстрые действия</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href}>
              <motion.div
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className={`p-4 rounded-2xl bg-gradient-to-br ${action.color} border ${action.border} cursor-pointer h-full`}
              >
                <div className="text-2xl mb-2">{action.icon}</div>
                <div className="font-semibold text-sm">{action.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{action.desc}</div>
              </motion.div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* AI Suggestions */}
      {dailyPlan?.suggestions?.length > 0 && (
        <motion.div variants={item} className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🤖</span>
            <h2 className="font-semibold">Рекомендации на сегодня</h2>
          </div>
          <div className="space-y-2">
            {dailyPlan.suggestions.map((s: string, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-xl bg-accent/30"
              >
                <span className="text-purple-400 mt-0.5">→</span>
                <span className="text-sm">{s}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* My decks preview */}
      {decks.length > 0 && (
        <motion.div variants={item}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">Мои наборы</h2>
            <Link href="/vocabulary">
              <Button variant="ghost" size="sm" className="gap-1">Все <ArrowRight size={14} /></Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {decks.slice(0, 3).map((deck) => (
              <Link key={deck.id} href={`/vocabulary?deck=${deck.id}`}>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="glass-card rounded-2xl p-4 cursor-pointer card-hover"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{deck.emoji}</span>
                    <div className="font-semibold text-sm truncate">{deck.name}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{deck.cardCount} карточек</div>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
