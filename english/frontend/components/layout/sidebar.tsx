"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, BookOpen, Brain, Mic, Gamepad2,
  TrendingUp, Settings, Crown, Shield,
  BookMarked, Swords, Search, Volume2, FileText,
  ChevronRight, Star, Flame, Zap, LogOut, Sun, Moon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";

const navGroups = [
  {
    label: "Обучение",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Главная" },
      { href: "/study",     icon: BookOpen,        label: "Карточки" },
      { href: "/vocabulary",icon: Brain,           label: "Словарь" },
      { href: "/dictionary",icon: Search,          label: "Переводчик" },
      { href: "/grammar",   icon: BookMarked,      label: "Грамматика" },
    ],
  },
  {
    label: "Практика",
    items: [
      { href: "/pronunciation", icon: Volume2,    label: "Произношение" },
      { href: "/games",         icon: Gamepad2,   label: "Игры" },
      { href: "/quests",        icon: Swords,     label: "Квесты" },
      { href: "/recordings",    icon: Mic,        label: "Записи" },
    ],
  },
  {
    label: "Аналитика",
    items: [
      { href: "/progress", icon: TrendingUp, label: "Прогресс" },
      { href: "/settings", icon: Settings,   label: "Настройки" },
    ],
  },
];

const PLAN_LABELS: Record<string, string> = {
  free: "Бесплатный",
  "premium-monthly": "Premium",
  "premium-yearly": "Premium Год",
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const planLabel = user?.isPremium ? "Premium" : "Бесплатный";

  return (
    <aside className="fixed left-0 top-0 h-full w-60 flex flex-col z-40 border-r"
      style={{ background: "hsl(var(--sidebar))", borderColor: "hsl(var(--sidebar-border))" }}>

      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="relative w-9 h-9 flex-shrink-0">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/25" />
            <div className="absolute inset-0 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm tracking-tight">LK</span>
            </div>
          </div>
          <div className="leading-none">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">LowKey</div>
            <div className="font-semibold text-base tracking-tight gradient-text">English</div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 overflow-y-auto space-y-5 py-2">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <motion.div
                      whileTap={{ scale: 0.97 }}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-150 cursor-pointer",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <Icon size={15} className={cn("flex-shrink-0", isActive ? "text-primary" : "")} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {isActive && (
                        <motion.div
                          layoutId="nav-dot"
                          className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"
                        />
                      )}
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {user?.role === "admin" && (
          <div>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Система
            </div>
            <Link href="/admin">
              <motion.div
                whileTap={{ scale: 0.97 }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-violet-500/10 text-violet-500"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Shield size={15} className="flex-shrink-0" />
                <span className="flex-1">Администрирование</span>
              </motion.div>
            </Link>
          </div>
        )}
      </nav>

      {/* Bottom section: Profile + plan */}
      <div className="px-3 pb-4 space-y-2 border-t pt-3" style={{ borderColor: "hsl(var(--sidebar-border))" }}>

        {/* Theme toggle + logout row */}
        <div className="flex items-center gap-1 px-1">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            <span>{theme === "dark" ? "Светлая" : "Тёмная"}</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center p-2 rounded-xl text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title="Выйти"
          >
            <LogOut size={14} />
          </button>
        </div>

        {/* Profile card */}
        {user && (
          <Link href="/settings">
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={cn(
                "p-3 rounded-2xl border cursor-pointer transition-all",
                user.isPremium
                  ? "bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border-amber-500/20 premium-glow"
                  : "bg-accent/50 border-border/40 hover:border-border"
              )}
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-sm font-semibold shadow-sm flex-shrink-0">
                    {user.avatarUrl
                      ? <img src={user.avatarUrl} className="w-9 h-9 rounded-full object-cover" alt="" />
                      : user.name.charAt(0).toUpperCase()
                    }
                  </div>
                  {user.isPremium && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 flex items-center justify-center shadow-sm">
                      <Crown size={7} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate leading-tight">{user.name}</div>
                  <div className={cn(
                    "text-[10px] font-semibold mt-0.5",
                    user.isPremium ? "text-amber-500" : "text-muted-foreground"
                  )}>
                    {planLabel}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-0.5 text-orange-500">
                    <Flame size={10} />
                    <span className="text-[11px] font-bold">{user.studyStreak || 0}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground">серия</div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-0.5 text-yellow-500">
                    <Star size={10} />
                    <span className="text-[11px] font-bold">{(user.xp || 0) > 999 ? `${Math.floor((user.xp||0)/1000)}k` : user.xp || 0}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground">XP</div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-0.5 text-blue-500">
                    <Zap size={10} />
                    <span className="text-[11px] font-bold">{user.level?.charAt(0).toUpperCase() || "B"}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground">уровень</div>
                </div>
              </div>
            </motion.div>
          </Link>
        )}

        {/* Premium CTA (only for free users) */}
        {user && !user.isPremium && (
          <Link href="/premium">
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/10 border border-amber-500/25 cursor-pointer"
            >
              <Crown size={13} className="text-amber-500 flex-shrink-0" />
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Получить Premium</span>
              <ChevronRight size={11} className="ml-auto text-amber-500/60" />
            </motion.div>
          </Link>
        )}
      </div>
    </aside>
  );
}
