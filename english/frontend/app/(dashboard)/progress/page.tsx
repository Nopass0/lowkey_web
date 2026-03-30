"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { progressApi } from "@/api/client";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAuthStore } from "@/store/auth";
import { getLevelLabel, getXpForLevel } from "@/lib/utils";
import { useTheme } from "next-themes";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } };

export default function ProgressPage() {
  const { user } = useAuthStore();
  const { theme } = useTheme();
  const [summary, setSummary] = useState<any>(null);
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    progressApi.getSummary().then(setSummary).catch(() => {});
    progressApi.getHeatmap().then(setHeatmap).catch(() => {});
    progressApi.getProgress({ days }).then((data: any[]) => {
      setChartData(data.slice(-14).map((p: any) => ({
        date: new Date(p.date).toLocaleDateString("ru", { day: "numeric", month: "short" }),
        cards: p.cardsStudied || 0,
        xp: p.xpEarned || 0,
        minutes: p.minutesStudied || 0,
      })));
    }).catch(() => {});
  }, [days]);

  const xpInfo = user ? getXpForLevel(user.xp || 0) : null;
  const gridColor = theme === "dark" ? "#1e1e2e" : "#f0f0f5";
  const textColor = theme === "dark" ? "#888" : "#555";

  // Heatmap: last 12 weeks
  const heatmapCells = (() => {
    const today = new Date();
    const cells = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const entry = heatmap.find((h: any) => h.date === key);
      cells.push({ date: key, count: entry?.count || 0 });
    }
    return cells;
  })();

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-4xl mx-auto space-y-6">
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold">📊 Прогресс</h1>
        <p className="text-muted-foreground mt-1">Твоя статистика обучения</p>
      </motion.div>

      {/* XP & Level */}
      {xpInfo && user && (
        <motion.div variants={item} className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-muted-foreground">Уровень</div>
              <div className="text-xl font-bold gradient-text">{xpInfo.label}</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">⭐ {user.xp.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">XP всего</div>
            </div>
          </div>
          <Progress value={xpInfo.next > 0 ? (xpInfo.current / xpInfo.next) * 100 : 100} gradient className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{xpInfo.current} XP до следующего</span>
            <span>{xpInfo.next} XP</span>
          </div>
        </motion.div>
      )}

      {/* Summary stats */}
      {summary && (
        <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Карточек", value: summary.totalCards, emoji: "📚", color: "text-blue-400" },
            { label: "Освоено", value: summary.cardsByStatus?.mastered || 0, emoji: "✅", color: "text-green-400" },
            { label: "Точность", value: `${summary.accuracy}%`, emoji: "🎯", color: "text-purple-400" },
            { label: "Серия", value: `${summary.streak} дн.`, emoji: "🔥", color: "text-orange-400" },
          ].map((s) => (
            <div key={s.label} className="glass-card rounded-2xl p-4 text-center card-hover">
              <div className="text-3xl mb-1">{s.emoji}</div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Cards distribution */}
      {summary?.cardsByStatus && (
        <motion.div variants={item} className="glass-card rounded-2xl p-5">
          <h3 className="font-semibold mb-4">Состояние карточек</h3>
          <div className="space-y-3">
            {[
              { label: "Новые", key: "new", color: "from-blue-500 to-blue-400", emoji: "🆕" },
              { label: "Изучаются", key: "learning", color: "from-yellow-500 to-amber-400", emoji: "📖" },
              { label: "Повторение", key: "review", color: "from-purple-500 to-violet-400", emoji: "🔄" },
              { label: "Освоены", key: "mastered", color: "from-green-500 to-emerald-400", emoji: "✅" },
            ].map((s) => {
              const count = summary.cardsByStatus[s.key] || 0;
              const pct = summary.totalCards > 0 ? (count / summary.totalCards) * 100 : 0;
              return (
                <div key={s.key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{s.emoji} {s.label}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.2 }}
                      className={`h-full bg-gradient-to-r ${s.color} rounded-full`} />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <motion.div variants={item} className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Активность за 2 недели</h3>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: textColor }} />
              <YAxis tick={{ fontSize: 11, fill: textColor }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
              />
              <Bar dataKey="cards" fill="url(#barGrad)" radius={[6, 6, 0, 0]} name="Карточки" />
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Activity heatmap */}
      <motion.div variants={item} className="glass-card rounded-2xl p-5">
        <h3 className="font-semibold mb-4">Активность за 12 недель</h3>
        <div className="grid grid-cols-[repeat(12,minmax(0,1fr))] gap-1" style={{ gridTemplateRows: "repeat(7, 1fr)" }}>
          {heatmapCells.map((cell, i) => {
            const intensity = Math.min(1, cell.count / 20);
            return (
              <div
                key={i}
                title={`${cell.date}: ${cell.count} карточек`}
                className="aspect-square rounded-sm transition-all hover:scale-125"
                style={{
                  background: cell.count === 0
                    ? "hsl(var(--secondary))"
                    : `rgba(${Math.round(239 - intensity * 100)}, ${Math.round(68 + intensity * 40)}, ${Math.round(68 + intensity * 176)}, ${0.3 + intensity * 0.7})`,
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground justify-end">
          <span>Меньше</span>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <div key={v} className="w-3 h-3 rounded-sm"
              style={{ background: v === 0 ? "hsl(var(--secondary))" : `rgba(${Math.round(239 - v * 100)}, ${Math.round(68 + v * 40)}, ${Math.round(68 + v * 176)}, ${0.3 + v * 0.7})` }} />
          ))}
          <span>Больше</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
