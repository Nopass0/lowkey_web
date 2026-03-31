"use client";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, Search, ChevronRight } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useState } from "react";
import { useRouter } from "next/navigation";

const PAGE_TITLES: Record<string, { title: string; sub?: string }> = {
  "/dashboard":    { title: "Главная" },
  "/study":        { title: "Карточки", sub: "Интервальное повторение" },
  "/vocabulary":   { title: "Словарь",  sub: "Мои наборы и карточки" },
  "/dictionary":   { title: "Переводчик", sub: "Поиск слов и переводов" },
  "/grammar":      { title: "Грамматика", sub: "Правила и упражнения" },
  "/pronunciation":{ title: "Произношение", sub: "Тренировка речи" },
  "/games":        { title: "Игры", sub: "Ассоциации и практика" },
  "/quests":       { title: "Квесты", sub: "AI ситуационные задания" },
  "/recordings":   { title: "Записи", sub: "Мой речевой дневник" },
  "/progress":     { title: "Прогресс", sub: "Статистика обучения" },
  "/settings":     { title: "Настройки" },
  "/premium":      { title: "Premium", sub: "Планы подписки" },
  "/admin":        { title: "Администрирование", sub: "Управление платформой" },
};

interface TopbarProps {
  title?: string;
}

export function Topbar({ title }: TopbarProps) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const pageInfo = PAGE_TITLES[pathname] || { title: title || "" };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/dictionary?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <header className="fixed top-0 right-0 left-60 h-14 border-b bg-background/90 backdrop-blur-xl flex items-center px-6 z-30"
      style={{ borderColor: "hsl(var(--border))" }}>

      {/* Breadcrumb / Page title */}
      <div className="flex-1 min-w-0">
        {pageInfo.title && (
          <div className="flex items-baseline gap-2">
            <h1 className="text-base font-semibold text-foreground leading-tight">
              {pageInfo.title}
            </h1>
            {pageInfo.sub && (
              <>
                <ChevronRight size={12} className="text-muted-foreground/40 flex-shrink-0" />
                <span className="text-xs text-muted-foreground truncate">{pageInfo.sub}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 ml-4">
        {/* Quick search */}
        <motion.div
          animate={{ width: searchOpen ? 220 : 32 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          {searchOpen ? (
            <form onSubmit={handleSearch} className="flex items-center gap-2 h-8 px-3 rounded-xl bg-accent border border-border text-sm">
              <Search size={13} className="text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
                placeholder="Найти слово..."
                className="bg-transparent flex-1 outline-none text-sm placeholder:text-muted-foreground/50 min-w-0"
              />
            </form>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Search size={15} />
            </button>
          )}
        </motion.div>

        {/* Daily goal indicator */}
        {user && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-accent/60 text-xs font-medium text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-foreground/70">Цель дня</span>
          </div>
        )}
      </div>
    </header>
  );
}
