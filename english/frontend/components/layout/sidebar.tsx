"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard, BookOpen, Brain, Mic, Gamepad2,
  TrendingUp, Settings, Crown, Shield, ChevronRight,
  Sparkles, Volume2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Главная", emoji: "🏠" },
  { href: "/study", icon: BookOpen, label: "Учить", emoji: "📖" },
  { href: "/vocabulary", icon: Brain, label: "Словарь", emoji: "📚" },
  { href: "/games", icon: Gamepad2, label: "Игры", emoji: "🎮" },
  { href: "/pronunciation", icon: Volume2, label: "Произношение", emoji: "🗣️" },
  { href: "/recordings", icon: Mic, label: "Записи", emoji: "🎙️" },
  { href: "/progress", icon: TrendingUp, label: "Прогресс", emoji: "📊" },
  { href: "/settings", icon: Settings, label: "Настройки", emoji: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 border-r border-border/50 bg-card/80 backdrop-blur-xl flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-border/50">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-blue-500 flex items-center justify-center text-lg font-bold text-white shadow-lg group-hover:scale-110 transition-transform">
            E
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">LowKey</div>
            <div className="gradient-text font-extrabold text-base leading-tight">English</div>
          </div>
        </Link>
      </div>

      {/* User info */}
      {user && (
        <div className="px-4 py-3 mx-3 mt-3 rounded-xl bg-gradient-to-r from-red-500/10 to-blue-500/10 border border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-blue-400 flex items-center justify-center text-white text-sm font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                🔥 {user.studyStreak} дней
                {user.isPremium && <Badge variant="premium" className="ml-1 text-[10px] py-0 px-1.5">PRO</Badge>}
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">⭐ {user.xp} XP</div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-red-500/20 to-blue-500/20 text-foreground border border-white/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <span className="text-base">{item.emoji}</span>
                <span className="flex-1">{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="w-1.5 h-1.5 rounded-full bg-gradient-to-b from-red-400 to-blue-400"
                  />
                )}
              </motion.div>
            </Link>
          );
        })}

        {user?.role === "admin" && (
          <Link href="/admin">
            <motion.div
              whileHover={{ x: 4 }}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mt-2 transition-all duration-200",
                pathname.startsWith("/admin")
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Shield size={16} />
              <span>Админ</span>
            </motion.div>
          </Link>
        )}
      </nav>

      {/* Premium CTA */}
      {user && !user.isPremium && (
        <div className="p-4">
          <Link href="/premium">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1">
                <Crown size={14} className="text-amber-400" />
                <span className="text-xs font-semibold text-amber-400">Получить Premium</span>
              </div>
              <p className="text-xs text-muted-foreground">AI, быстрое обучение и многое другое</p>
            </motion.div>
          </Link>
        </div>
      )}
    </aside>
  );
}
