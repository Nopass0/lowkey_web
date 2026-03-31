"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Flame, BookOpen, Crown, Medal, Star, Loader2 } from "lucide-react";
import { socialApi } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type LeaderEntry = {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  xp: number;
  studyStreak: number;
  level: string;
  cardsCount: number;
};

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Начинающий",
  intermediate: "Средний",
  advanced: "Продвинутый",
};

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-emerald-500/20 text-emerald-400",
  intermediate: "bg-amber-500/20 text-amber-400",
  advanced: "bg-red-500/20 text-red-400",
};

const TABS = [
  { key: "xp", label: "Опыт", icon: Star, valueKey: "xp" as keyof LeaderEntry, suffix: " XP" },
  { key: "streak", label: "Серия", icon: Flame, valueKey: "studyStreak" as keyof LeaderEntry, suffix: " дней" },
  { key: "cards", label: "Карточки", icon: BookOpen, valueKey: "cardsCount" as keyof LeaderEntry, suffix: "" },
];

function Avatar({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-semibold text-white/40 w-5 text-center">{rank}</span>;
}

export default function LeaderboardPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState("xp");
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [myEntry, setMyEntry] = useState<LeaderEntry | null>(null);

  useEffect(() => {
    loadLeaderboard(tab);
  }, [tab]);

  const loadLeaderboard = async (type: string) => {
    setLoading(true);
    try {
      const data = await socialApi.getLeaderboard({ type, limit: 50 });
      setEntries(data);
      if (user) {
        const found = data.find((e: LeaderEntry) => e.userId === user.id);
        setMyEntry(found || null);
      }
    } catch {
      toast.error("Ошибка загрузки таблицы лидеров");
    } finally {
      setLoading(false);
    }
  };

  const activeTab = TABS.find(t => t.key === tab)!;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-1">
          <Trophy className="w-7 h-7 text-yellow-400" />
          <h1 className="text-2xl font-bold text-white">Таблица лидеров</h1>
        </div>
        <p className="text-white/50 text-sm">Соревнуйтесь с другими учениками</p>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                tab === t.key
                  ? "bg-indigo-500 text-white shadow-lg"
                  : "glass-card text-white/60 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {entries.map((entry, idx) => {
                const isMe = entry.userId === user?.id;
                const value = entry[activeTab.valueKey] as number;
                return (
                  <motion.div
                    key={entry.userId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={cn(
                      "flex items-center gap-4 px-5 py-3.5 border-b border-white/5 last:border-0 transition-colors",
                      isMe ? "bg-indigo-500/10" : "hover:bg-white/5"
                    )}
                  >
                    {/* Rank */}
                    <div className="w-6 flex items-center justify-center flex-shrink-0">
                      <RankBadge rank={entry.rank} />
                    </div>

                    {/* Avatar */}
                    <Avatar url={entry.avatarUrl} name={entry.name} size={38} />

                    {/* Name + level */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("font-semibold truncate text-sm", isMe ? "text-indigo-300" : "text-white")}>
                          {entry.name}
                          {isMe && " (я)"}
                        </span>
                      </div>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", LEVEL_COLORS[entry.level] || LEVEL_COLORS.beginner)}>
                        {LEVEL_LABELS[entry.level] || entry.level}
                      </span>
                    </div>

                    {/* Value */}
                    <div className="text-right flex-shrink-0">
                      <span className={cn("font-bold text-base", isMe ? "text-indigo-400" : "text-white")}>
                        {value.toLocaleString()}
                      </span>
                      <span className="text-white/40 text-xs">{activeTab.suffix}</span>
                    </div>
                  </motion.div>
                );
              })}

              {entries.length === 0 && (
                <div className="text-center py-16 text-white/40">
                  Нет данных
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* My rank if not in top 50 */}
      {!loading && myEntry === null && user && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 glass-card rounded-2xl px-5 py-4 border border-indigo-500/30"
        >
          <p className="text-white/50 text-xs mb-2">Ваше место</p>
          <div className="flex items-center gap-4">
            <span className="text-white/40 text-sm w-6 text-center">—</span>
            <Avatar url={user.avatarUrl || null} name={user.name} size={38} />
            <div className="flex-1">
              <span className="font-semibold text-indigo-300 text-sm">{user.name} (я)</span>
            </div>
            <span className="text-indigo-400 font-bold">
              {activeTab.valueKey === "xp" ? user.xp : activeTab.valueKey === "studyStreak" ? user.studyStreak : "—"}
              {activeTab.suffix}
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
