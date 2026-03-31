"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Settings, Flame, Star, BookOpen, Brain,
  Swords, PenTool, Calendar, Loader2, Trophy
} from "lucide-react";
import { socialApi } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Начинающий",
  intermediate: "Средний",
  advanced: "Продвинутый",
};

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  intermediate: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  advanced: "bg-red-500/20 text-red-400 border border-red-500/30",
};

type ProfileData = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  level: string;
  xp: number;
  studyStreak: number;
  isPremium: boolean;
  joinedDate: string;
  stats: { cardsLearned: number; testsCompleted: number; questsDone: number; writingSessions: number };
  recentActivity: Array<{ date: string; xpEarned: number; cardsStudied: number }>;
};

// Activity heatmap: 12 weeks × 7 days
function ActivityHeatmap({ activity }: { activity: ProfileData["recentActivity"] }) {
  const activityMap: Record<string, number> = {};
  for (const a of activity) {
    activityMap[a.date] = (activityMap[a.date] || 0) + (a.xpEarned || 0);
  }

  // Build a 12-week grid
  const today = new Date();
  const cells: Array<{ date: string; value: number }> = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, value: activityMap[key] || 0 });
  }

  const weeks: Array<typeof cells> = [];
  for (let w = 0; w < 12; w++) {
    weeks.push(cells.slice(w * 7, w * 7 + 7));
  }

  const maxVal = Math.max(...cells.map(c => c.value), 1);

  function intensityClass(v: number): string {
    if (v === 0) return "bg-white/5";
    const pct = v / maxVal;
    if (pct < 0.25) return "bg-indigo-500/30";
    if (pct < 0.5) return "bg-indigo-500/55";
    if (pct < 0.75) return "bg-indigo-500/80";
    return "bg-indigo-500";
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((cell, di) => (
              <div
                key={di}
                title={`${cell.date}: ${cell.value} XP`}
                className={cn("w-3 h-3 rounded-sm", intensityClass(cell.value))}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user: me } = useAuthStore();
  const userId = params.id as string;
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    socialApi.getProfile(userId)
      .then(setProfile)
      .catch(() => toast.error("Профиль не найден"))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-60">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center text-white/50 py-20">Профиль не найден</div>
    );
  }

  const isMe = me?.id === userId;
  const joinYear = profile.joinedDate ? new Date(profile.joinedDate).getFullYear() : null;

  // XP ring progress (visual only)
  const XP_PER_LEVEL = 1000;
  const xpInLevel = profile.xp % XP_PER_LEVEL;
  const xpPct = xpInLevel / XP_PER_LEVEL;
  const radius = 48;
  const circ = 2 * Math.PI * radius;
  const dash = circ * xpPct;

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-3xl p-6"
      >
        <div className="flex flex-col items-center gap-4">
          {/* Avatar + XP ring */}
          <div className="relative">
            <svg width={120} height={120} className="-rotate-90">
              <circle cx={60} cy={60} r={radius} fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth={6} />
              <circle
                cx={60} cy={60} r={radius} fill="none"
                stroke="#6366f1" strokeWidth={6}
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-indigo-500/30 flex items-center justify-center text-2xl font-bold text-indigo-300">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Name + badges */}
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">{profile.name}</h1>
            <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
              <span className={cn("text-xs px-3 py-1 rounded-full font-medium", LEVEL_COLORS[profile.level] || LEVEL_COLORS.beginner)}>
                {LEVEL_LABELS[profile.level] || profile.level}
              </span>
              {profile.isPremium && (
                <span className="text-xs px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-medium">
                  Premium
                </span>
              )}
            </div>
            {joinYear && (
              <p className="text-white/40 text-xs mt-1 flex items-center justify-center gap-1">
                <Calendar className="w-3 h-3" />
                С {joinYear} года
              </p>
            )}
          </div>

          {/* XP + streak */}
          <div className="flex gap-6">
            <div className="text-center">
              <div className="flex items-center gap-1 justify-center">
                <Star className="w-4 h-4 text-yellow-400" />
                <span className="font-bold text-white text-lg">{profile.xp.toLocaleString()}</span>
              </div>
              <p className="text-white/40 text-xs">Опыт</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <div className="flex items-center gap-1 justify-center">
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="font-bold text-white text-lg">{profile.studyStreak}</span>
              </div>
              <p className="text-white/40 text-xs">Серия дней</p>
            </div>
          </div>

          {/* Edit button for own profile */}
          {isMe && (
            <button
              onClick={() => router.push("/settings")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 text-sm transition-colors"
            >
              <Settings className="w-4 h-4" />
              Редактировать профиль
            </button>
          )}
        </div>
      </motion.div>

      {/* Stats grid */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-3"
      >
        {[
          { icon: BookOpen, label: "Карточек выучено", value: profile.stats.cardsLearned, color: "text-indigo-400" },
          { icon: Brain, label: "Тестов сдано", value: profile.stats.testsCompleted, color: "text-purple-400" },
          { icon: Swords, label: "Заданий выполнено", value: profile.stats.questsDone, color: "text-amber-400" },
          { icon: PenTool, label: "Сессий письма", value: profile.stats.writingSessions, color: "text-emerald-400" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="glass-card rounded-2xl p-4 flex items-center gap-3">
            <Icon className={cn("w-5 h-5 flex-shrink-0", color)} />
            <div>
              <p className="font-bold text-white text-lg leading-tight">{value}</p>
              <p className="text-white/40 text-xs leading-tight">{label}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Activity heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl p-5"
      >
        <h3 className="text-white/70 text-sm font-semibold mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          Активность (12 недель)
        </h3>
        <ActivityHeatmap activity={profile.recentActivity} />
        <div className="flex items-center gap-2 mt-3 text-xs text-white/30">
          <span>Меньше</span>
          {["bg-white/5", "bg-indigo-500/30", "bg-indigo-500/55", "bg-indigo-500/80", "bg-indigo-500"].map(c => (
            <div key={c} className={cn("w-3 h-3 rounded-sm", c)} />
          ))}
          <span>Больше</span>
        </div>
      </motion.div>
    </div>
  );
}
