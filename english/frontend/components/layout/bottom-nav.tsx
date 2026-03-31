"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Brain, BookOpen, Gamepad2, X,
  Volume2, Swords, TrendingUp, Settings, Search,
  BookMarked, Mic, Crown, Shield, LogOut, Sun, Moon,
  Flame, Star, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";

const BOTTOM_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Главная" },
  { href: "/vocabulary", icon: Brain,          label: "Карточки" },
  { href: "/study",     icon: BookOpen,        label: "Учить" },
  { href: "/games",     icon: Gamepad2,        label: "Игры" },
];

const ALL_ITEMS = [
  { href: "/dashboard",    icon: LayoutDashboard, label: "Главная" },
  { href: "/study",        icon: BookOpen,        label: "Карточки" },
  { href: "/vocabulary",   icon: Brain,           label: "Мои слова" },
  { href: "/dictionary",   icon: Search,          label: "Переводчик" },
  { href: "/grammar",      icon: BookMarked,      label: "Грамматика" },
  { href: "/pronunciation",icon: Volume2,         label: "Произношение" },
  { href: "/games",        icon: Gamepad2,        label: "Игры" },
  { href: "/quests",       icon: Swords,          label: "Квесты" },
  { href: "/writing",      icon: Mic,             label: "Письмо" },
  { href: "/progress",     icon: TrendingUp,      label: "Прогресс" },
  { href: "/settings",     icon: Settings,        label: "Настройки" },
];

export function BottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
    setMenuOpen(false);
  };

  return (
    <>
      {/* Bottom nav bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-xl"
        style={{ borderColor: "hsl(var(--border))", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center justify-around px-2 py-2">
          {BOTTOM_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-all",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  <div className={cn(
                    "w-10 h-6 rounded-lg flex items-center justify-center transition-colors",
                    isActive && "bg-primary/10"
                  )}>
                    <Icon size={18} />
                  </div>
                  <span className="text-[10px] font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
          {/* More button */}
          <button className="flex-1" onClick={() => setMenuOpen(true)}>
            <div className={cn(
              "flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-all",
              menuOpen ? "text-primary" : "text-muted-foreground"
            )}>
              <div className="w-10 h-6 rounded-lg flex items-center justify-center">
                <div className="flex flex-col gap-1">
                  <div className="w-4 h-0.5 bg-current rounded-full" />
                  <div className="w-3 h-0.5 bg-current rounded-full" />
                  <div className="w-4 h-0.5 bg-current rounded-full" />
                </div>
              </div>
              <span className="text-[10px] font-medium">Ещё</span>
            </div>
          </button>
        </div>
      </nav>

      {/* Full-screen menu overlay */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-background/60 backdrop-blur-sm z-50"
              onClick={() => setMenuOpen(false)}
            />
            {/* Slide-up sheet */}
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
              style={{ borderColor: "hsl(var(--border))", paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              {/* User profile */}
              {user && (
                <div className="px-5 py-3 flex items-center gap-3 border-b" style={{ borderColor: "hsl(var(--border))" }}>
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white font-semibold overflow-hidden flex-shrink-0">
                    {user.avatarUrl
                      ? <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
                      : user.name.charAt(0).toUpperCase()
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{user.name}</div>
                    <div className={cn("text-xs font-medium", user.isPremium ? "text-amber-500" : "text-muted-foreground")}>
                      {user.isPremium ? "Premium" : "Бесплатный"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1 text-orange-500">
                      <Flame size={12} /><span className="font-bold">{user.studyStreak || 0}</span>
                    </div>
                    <div className="flex items-center gap-1 text-yellow-500">
                      <Star size={12} /><span className="font-bold">{(user.xp || 0) > 999 ? `${Math.floor((user.xp||0)/1000)}k` : user.xp || 0}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Nav items grid */}
              <div className="p-4 grid grid-cols-3 gap-2">
                {ALL_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
                      <motion.div
                        whileTap={{ scale: 0.95 }}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all",
                          isActive
                            ? "bg-primary/10 border-primary/20 text-primary"
                            : "bg-accent/40 border-border/30 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon size={20} />
                        <span className="text-[11px] font-medium text-center leading-tight">{item.label}</span>
                      </motion.div>
                    </Link>
                  );
                })}

                {user?.role === "admin" && (
                  <Link href="/admin" onClick={() => setMenuOpen(false)}>
                    <motion.div whileTap={{ scale: 0.95 }}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all",
                        pathname.startsWith("/admin")
                          ? "bg-violet-500/10 border-violet-500/20 text-violet-500"
                          : "bg-accent/40 border-border/30 text-muted-foreground"
                      )}>
                      <Shield size={20} />
                      <span className="text-[11px] font-medium">Админ</span>
                    </motion.div>
                  </Link>
                )}
              </div>

              {/* Premium CTA */}
              {user && !user.isPremium && (
                <div className="px-4 pb-2">
                  <Link href="/premium" onClick={() => setMenuOpen(false)}>
                    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-500/15 to-orange-500/10 border border-amber-500/25">
                      <Crown size={15} className="text-amber-500" />
                      <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Получить Premium</span>
                    </div>
                  </Link>
                </div>
              )}

              {/* Bottom actions */}
              <div className="px-4 pb-4 flex gap-2">
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-accent/60 border border-border/40 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                  {theme === "dark" ? "Светлая" : "Тёмная"}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-500 hover:bg-red-500/15 transition-colors"
                >
                  <LogOut size={15} />
                  <span>Выйти</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
