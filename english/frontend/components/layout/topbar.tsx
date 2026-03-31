"use client";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, BookOpen, Plus, Mic, Brain, ChevronRight,
  Flame, Zap, Target
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const PAGE_TITLES: Record<string, { title: string; sub?: string }> = {
  "/dashboard":    { title: "Главная" },
  "/study":        { title: "Карточки",      sub: "Интервальное повторение" },
  "/vocabulary":   { title: "Мои карточки",  sub: "Наборы и слова" },
  "/dictionary":   { title: "Переводчик",    sub: "Поиск слов и переводов" },
  "/grammar":      { title: "Грамматика",    sub: "Правила и упражнения" },
  "/pronunciation":{ title: "Произношение",  sub: "Тренировка речи" },
  "/games":        { title: "Игры",          sub: "Ассоциации и практика" },
  "/quests":       { title: "Квесты",        sub: "AI ситуационные задания" },
  "/recordings":   { title: "Записи",        sub: "Мой речевой дневник" },
  "/writing":      { title: "Письмо",        sub: "Анализ грамматики AI" },
  "/progress":     { title: "Прогресс",      sub: "Статистика обучения" },
  "/settings":     { title: "Настройки" },
  "/premium":      { title: "Premium",       sub: "Планы подписки" },
  "/admin":        { title: "Администрирование", sub: "Управление платформой" },
};

type ActionItem = { label: string; href: string; icon: React.ElementType; accent?: string };

const PAGE_ACTIONS: Record<string, ActionItem[]> = {
  "/dashboard": [
    { label: "Учить карточки", href: "/study",        icon: BookOpen },
    { label: "Добавить слова", href: "/vocabulary",   icon: Plus },
    { label: "Тренировать речь", href: "/pronunciation", icon: Mic, accent: "text-violet-500" },
  ],
  "/vocabulary": [
    { label: "Начать изучение", href: "/study",      icon: BookOpen },
    { label: "Найти слово",     href: "/dictionary", icon: Search },
  ],
  "/study": [
    { label: "Все карточки",  href: "/vocabulary",  icon: Brain },
    { label: "Квесты",        href: "/quests",      icon: Zap, accent: "text-amber-500" },
  ],
  "/grammar": [
    { label: "Практиковать речь", href: "/pronunciation", icon: Mic },
    { label: "Квесты",            href: "/quests",        icon: Zap, accent: "text-amber-500" },
  ],
  "/pronunciation": [
    { label: "Записи",        href: "/recordings",  icon: Mic },
    { label: "Словарь слов",  href: "/vocabulary",  icon: Brain },
  ],
  "/quests": [
    { label: "Грамматика",    href: "/grammar",    icon: BookOpen },
    { label: "Произношение",  href: "/pronunciation", icon: Mic },
  ],
  "/dictionary": [
    { label: "Мои карточки",  href: "/vocabulary", icon: Brain },
    { label: "Учить",         href: "/study",      icon: Zap, accent: "text-amber-500" },
  ],
  "/writing": [
    { label: "Грамматика",    href: "/grammar",     icon: BookOpen },
    { label: "Произношение",  href: "/pronunciation", icon: Mic },
  ],
  "/games": [
    { label: "Квесты",        href: "/quests",     icon: Zap, accent: "text-amber-500" },
    { label: "Мои карточки",  href: "/vocabulary", icon: Brain },
  ],
};

export function Topbar({ title }: { title?: string }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const pageInfo = PAGE_TITLES[pathname] || { title: title || "" };
  const actions = PAGE_ACTIONS[pathname] || [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/dictionary?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <header
      className="fixed top-0 right-0 left-0 md:left-60 h-14 border-b bg-background/90 backdrop-blur-xl flex items-center px-4 md:px-5 z-30 gap-3 md:gap-4"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      {/* Page title */}
      <div className="flex items-baseline gap-2 flex-shrink-0">
        {pageInfo.title && (
          <>
            <h1 className="text-sm font-semibold text-foreground leading-tight">
              {pageInfo.title}
            </h1>
            {pageInfo.sub && (
              <>
                <ChevronRight size={11} className="text-muted-foreground/40 flex-shrink-0" />
                <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[180px]">{pageInfo.sub}</span>
              </>
            )}
          </>
        )}
      </div>

      {/* Context action pills */}
      <AnimatePresence mode="wait">
        {actions.length > 0 && !searchOpen && (
          <motion.div
            key={pathname}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-1.5 flex-1 overflow-hidden"
          >
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href}>
                  <motion.div
                    whileTap={{ scale: 0.96 }}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium",
                      "bg-accent/70 hover:bg-accent text-muted-foreground hover:text-foreground",
                      "transition-colors duration-150 cursor-pointer whitespace-nowrap border border-transparent hover:border-border/40"
                    )}
                  >
                    <Icon size={11} className={action.accent || "text-muted-foreground"} />
                    {action.label}
                  </motion.div>
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spacer */}
      {(actions.length === 0 || searchOpen) && <div className="flex-1" />}

      {/* Right actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Quick search */}
        <motion.div
          animate={{ width: searchOpen ? 210 : 32 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          {searchOpen ? (
            <form onSubmit={handleSearch} className="flex items-center gap-2 h-8 px-3 rounded-xl bg-accent border border-border text-sm">
              <Search size={12} className="text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
                onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
                placeholder="Найти слово..."
                className="bg-transparent flex-1 outline-none text-sm placeholder:text-muted-foreground/50 min-w-0"
              />
            </form>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Search size={14} />
            </button>
          )}
        </motion.div>

        {/* Streak + goal badge */}
        {user && (
          <div className="hidden md:flex items-center gap-2">
            {(user.studyStreak || 0) > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/15 text-xs font-semibold text-orange-500">
                <Flame size={11} />
                <span>{user.studyStreak}</span>
              </div>
            )}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/70 text-xs font-medium text-muted-foreground border border-border/30">
              <Target size={11} className="text-emerald-500" />
              <span>{user.dailyGoal || 20}/день</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
