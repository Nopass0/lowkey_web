"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bot,
  Brain,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  Check,
  CreditCard,
  Download,
  ExternalLink,
  FileUp,
  Globe,
  LogOut,
  Menu,
  MessageSquarePlus,
  Moon,
  Paperclip,
  PanelRight,
  PanelRightClose,
  Search,
  Shield,
  Sparkles,
  Sun,
  VenetianMask,
  X,
  Image as ImageIcon,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { LandingHeader } from "@/components/landing-header";
import { LandingFooter } from "@/components/landing-footer";
import { AiMarkdown } from "@/components/ai-markdown";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader } from "@/components/ui/loader";
import { apiClient, ApiClientError } from "@/api/client";
import type {
  AiChatMessage,
  AiChatResponse,
  AiConversationDetail,
  AiConversationListItem,
  AiFileItem,
  AiPublicConfig,
  AiUserState,
} from "@/api/types";
import { useAuth } from "@/hooks/useAuth";
import { useUser } from "@/hooks/useUser";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toLocaleString("ru-RU");
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function getDayKey(iso: string): "today" | "yesterday" | "week" | "earlier" {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return "week";
  return "earlier";
}

const DAY_LABELS: Record<string, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  week: "На этой неделе",
  earlier: "Раньше",
};

// ─── Typing dots ──────────────────────────────────────────────────────────────
function TypingDots({ size = "md" }: { size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cn("rounded-full bg-current opacity-60", sz)}
          animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ─── Thinking block ───────────────────────────────────────────────────────────
function ThinkingBlock({
  reasoning,
  isStreaming,
}: {
  reasoning: string;
  isStreaming?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const words = reasoning.split(/\s+/).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 overflow-hidden rounded-xl border border-violet-500/20 bg-violet-500/5"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-violet-500/5"
      >
        {/* Spinning brain or static */}
        <motion.div
          animate={isStreaming ? { rotate: [0, 360] } : { rotate: 0 }}
          transition={isStreaming ? { duration: 2, repeat: Infinity, ease: "linear" } : {}}
          className="shrink-0"
        >
          <Brain className="h-3.5 w-3.5 text-violet-500" />
        </motion.div>

        <span className="font-medium text-violet-600 dark:text-violet-400">
          {isStreaming ? "Анализирую" : "Мыслительный процесс"}
        </span>

        {isStreaming ? (
          <span className="text-violet-500">
            <TypingDots size="sm" />
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">{words} слов</span>
        )}

        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-auto shrink-0"
        >
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-violet-500/10 px-4 py-3">
              <p className="whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                {reasoning}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Web search pill ──────────────────────────────────────────────────────────
function SearchPill({ query }: { query?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/8 px-3 py-1.5 text-xs font-medium text-sky-600 dark:text-sky-400"
    >
      <motion.div
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
      >
        <Globe className="h-3 w-3" />
      </motion.div>
      Поиск: <span className="font-semibold">{query || "в интернете"}</span>
    </motion.div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({
  message,
  isStreaming,
}: {
  message: AiChatMessage;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const searchQuery = useMemo(() => {
    if (!message.toolEvents) return null;
    try {
      const events = message.toolEvents as Array<{ type: string; query?: string }>;
      return events.find((e) => e.type === "web_search")?.query ?? null;
    } catch {
      return null;
    }
  }, [message.toolEvents]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className={cn("group flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* AI avatar */}
      {!isUser && (
        <div className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}

      <div className={cn("min-w-0 max-w-[82%]", isUser ? "flex flex-col items-end" : "flex flex-col items-start")}>
        {/* Header row */}
        <div
          className={cn(
            "mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest",
            isUser ? "text-muted-foreground/70" : "text-primary/60",
          )}
        >
          {isUser ? "Вы" : "lowkey AI"}
          {!isUser && message.model && (
            <span className="rounded border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px] normal-case font-normal tracking-normal text-muted-foreground/70">
              {message.model.split("/").pop()}
            </span>
          )}
          {/* Timestamp fades in on hover */}
          <AnimatePresence>
            {hovered && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="font-normal normal-case tracking-normal text-muted-foreground/40"
              >
                {formatTime(message.createdAt)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Web search */}
        {searchQuery && <SearchPill query={searchQuery} />}

        {/* Thinking */}
        {message.reasoning && !isUser && (
          <ThinkingBlock reasoning={message.reasoning} isStreaming={isStreaming} />
        )}

        {/* Bubble */}
        <div
          className={cn(
            "relative w-full rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm",
            isUser
              ? "rounded-tr-sm bg-gradient-to-br from-primary/12 to-primary/6 ring-1 ring-primary/20"
              : "rounded-tl-sm bg-card ring-1 ring-border/40",
          )}
        >
          {isStreaming && !message.content ? (
            <span className="text-muted-foreground">
              <TypingDots />
            </span>
          ) : isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <AiMarkdown content={message.content} />
          )}
        </div>

        {/* Footer: tokens + copy */}
        {!isUser && (
          <div className="mt-1.5 flex items-center gap-3">
            {message.totalTokens ? (
              <span className="text-[10px] text-muted-foreground/40">
                <Zap className="mr-0.5 inline h-2.5 w-2.5" />
                {message.totalTokens.toLocaleString("ru-RU")} токенов
              </span>
            ) : null}

            {/* Copy button - fades in on hover */}
            <AnimatePresence>
              {hovered && message.content && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15 }}
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground/60 transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  {copied ? (
                    <><Check className="h-2.5 w-2.5 text-green-500" /> Скопировано</>
                  ) : (
                    <><Copy className="h-2.5 w-2.5" /> Копировать</>
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Grouped conversation list ────────────────────────────────────────────────
function ConversationList({
  items,
  activeId,
  onSelect,
}: {
  items: AiConversationListItem[];
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="py-10 text-center text-xs text-muted-foreground">
        Нет диалогов
      </div>
    );
  }

  // Group by day
  const groups = items.reduce<Record<string, AiConversationListItem[]>>((acc, item) => {
    const key = getDayKey(item.updatedAt);
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  const order: Array<"today" | "yesterday" | "week" | "earlier"> = [
    "today",
    "yesterday",
    "week",
    "earlier",
  ];

  return (
    <div className="space-y-4">
      {order.map((key) => {
        const list = groups[key];
        if (!list?.length) return null;
        return (
          <div key={key}>
            <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              {DAY_LABELS[key]}
            </div>
            <div className="space-y-0.5">
              {list.map((item, i) => {
                const isActive = activeId === item.id;
                return (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.025, duration: 0.18 }}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      "group relative flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition-all",
                      isActive
                        ? "bg-primary/10 ring-1 ring-primary/20"
                        : "hover:bg-muted/60",
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeConv"
                        className="absolute inset-0 rounded-xl bg-primary/8 ring-1 ring-primary/20"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                      />
                    )}
                    <div className="relative flex items-center justify-between gap-2">
                      <span className={cn(
                        "truncate text-sm font-medium",
                        isActive ? "text-primary" : "text-foreground",
                      )}>
                        {item.title}
                      </span>
                    </div>
                    {item.lastMessage && (
                      <span className="relative mt-0.5 truncate text-xs text-muted-foreground/60">
                        {item.lastMessage}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sidebar content (reused for desktop + mobile sheet) ─────────────────────
function SidebarContent({
  user,
  state,
  conversation,
  quotaLabel,
  sidebarSearch,
  setSidebarSearch,
  onCreateConversation,
  onSelectConversation,
  onLogout,
  filteredConversations,
}: {
  user: { login: string; avatarHash: string } | null;
  state: AiUserState | null;
  conversation: AiConversationDetail | null;
  quotaLabel: string | null;
  sidebarSearch: string;
  setSidebarSearch: (v: string) => void;
  onCreateConversation: () => void;
  onSelectConversation: (id: string) => void;
  onLogout: () => void;
  filteredConversations: AiConversationListItem[];
}) {
  const { profile } = useUser();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const avatarHue = user ? parseInt(user.avatarHash.substring(0, 6) || "0", 16) % 360 : 0;
  const avatarColor = `hsl(${avatarHue}, 85%, 55%)`;

  // Token usage %
  const usagePct = useMemo(() => {
    if (!state) return 0;
    const { quota } = state;
    const used = quota.includedLimit - quota.includedRemaining + quota.usedIncluded;
    const total = quota.includedLimit + quota.purchasedTokens;
    if (!total) return 0;
    return Math.min(100, Math.round((used / total) * 100));
  }, [state]);

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/25">
          <VenetianMask className="h-4 w-4" />
        </div>
        <div>
          <div className="text-[15px] font-bold tracking-tight">lowkey AI</div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">
            workspace
          </div>
        </div>
      </div>

      {/* New chat */}
      <div className="px-3 pb-3">
        <Button
          onClick={onCreateConversation}
          className="h-9 w-full justify-start gap-2 rounded-xl text-sm shadow-sm"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Новый чат
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className={cn(
          "flex items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2 transition-colors",
          sidebarSearch ? "border-primary/30 bg-primary/5" : "border-border/40 hover:border-border/70",
        )}>
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Поиск..."
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
          />
          {sidebarSearch && (
            <button
              type="button"
              onClick={() => setSidebarSearch("")}
              className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Chat list scrollable */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        <ConversationList
          items={filteredConversations}
          activeId={conversation?.id}
          onSelect={onSelectConversation}
        />
      </div>

      {/* Token meter */}
      {state && (
        <div className="mx-3 mb-3 rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground/70">Токены</span>
            <span className="font-semibold text-foreground/80">{quotaLabel}</span>
          </div>
          <Progress value={100 - usagePct} className="h-1.5" />
          <div className="mt-1 text-[10px] text-muted-foreground/40">
            {usagePct}% использовано
          </div>
        </div>
      )}

      {/* Profile */}
      <div className="border-t border-border/40 px-3 py-3">
        {user && mounted && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none"
              >
                <Avatar className="h-8 w-8 shrink-0 rounded-lg">
                  <AvatarFallback
                    className="rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {user.login.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{user.login}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                    <span className={cn(profile?.subscription && "text-primary")}>
                      {profile?.subscription ? profile.subscription.planName : "Free"}
                    </span>
                    {profile?.balance !== undefined && (
                      <span className="rounded border border-primary/20 bg-primary/8 px-1 text-[10px] text-primary">
                        {profile.balance} ₽
                      </span>
                    )}
                  </div>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 rounded-xl" side="top" align="start" sideOffset={4}>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-2 py-2">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback
                      className="rounded-lg text-sm font-bold text-white"
                      style={{ backgroundColor: avatarColor }}
                    >
                      {user.login.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-sm">
                    <span className="font-semibold">{user.login}</span>
                    <span className="text-xs text-muted-foreground">{quotaLabel}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                  {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                  {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/me/billing")} className="cursor-pointer">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Кошелёк
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/me">
                    <Shield className="mr-2 h-4 w-4" />
                    Панель VPN
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer font-medium text-destructive focus:text-destructive"
                onClick={onLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ─── Auth gate ────────────────────────────────────────────────────────────────
function AuthGate({ config }: { config: AiPublicConfig | null }) {
  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      <main className="mx-auto flex min-h-[calc(100vh-80px)] max-w-7xl flex-col justify-center px-4 py-16 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              lowkey AI
            </div>
            <h1 className="max-w-3xl text-5xl font-black tracking-tight md:text-6xl">
              AI-рабочее пространство в стиле ChatGPT внутри lowkey
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Один аккаунт для VPN и AI. Чаты, поиск по сайтам, работа с файлами,
              генерация артефактов без выхода из сервиса.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="h-12 rounded-2xl px-6 text-base">
                <Link href="/?auth=register">
                  Начать работу
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-2xl px-6 text-base">
                <Link href="/legal/ai-offer">Оферта AI</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-border/60 bg-card p-6 shadow-sm">
            <div className="space-y-5">
              <div className="rounded-3xl bg-zinc-950 p-5 text-zinc-50">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-2">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">lowkey AI</div>
                    <div className="text-sm text-zinc-400">Поиск, файлы, артефакты, markdown</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/5 p-4 text-sm leading-7 text-zinc-200">
                  <p>"Собери сравнение 5 VPN-протоколов, найди источники и сделай таблицу CSV"</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Free</div>
                  <div className="mt-2 text-2xl font-black">{config ? formatTokens(config.freeMonthlyTokens) : "500K"}</div>
                  <div className="text-sm text-muted-foreground">токенов без подписки</div>
                </div>
                {config?.plans.slice(0, 2).map((plan) => (
                  <div key={plan.slug} className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{plan.title}</div>
                    <div className="mt-2 text-2xl font-black">{plan.price} ₽</div>
                    <div className="text-sm text-muted-foreground">
                      {plan.monthlyTokens ? `${formatTokens(plan.monthlyTokens)} токенов` : "Гибкие лимиты"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AiPage() {
  const { isAuthenticated, user, logout } = useAuth();
  const router = useRouter();
  const [config, setConfig] = useState<AiPublicConfig | null>(null);
  const [state, setState] = useState<AiUserState | null>(null);
  const [conversation, setConversation] = useState<AiConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [artifacts, setArtifacts] = useState<AiFileItem[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<AiFileItem | null>(null);
  const [pendingFiles, setPendingFiles] = useState<AiFileItem[]>([]);
  const [showCanvas, setShowCanvas] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const hasCanvas = artifacts.length > 0;

  // Boot load
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const publicConfig = await apiClient.get<AiPublicConfig>("/ai/config");
        if (mounted) setConfig(publicConfig);
        if (isAuthenticated) {
          const userState = await apiClient.get<AiUserState>("/user/ai/state");
          if (!mounted) return;
          setState(userState);
          setSelectedModel(userState.settings.defaultModel || publicConfig.defaultModel);
          if (userState.conversations[0]) {
            const detail = await apiClient.get<AiConversationDetail>(
              `/user/ai/conversations/${userState.conversations[0].id}`,
            );
            if (!mounted) return;
            setConversation(detail);
            if (detail.model) setSelectedModel(detail.model);
            const arts = detail.files.filter((f) => f.kind === "artifact");
            setArtifacts(arts);
            setSelectedArtifact(arts[0] ?? null);
          }
        } else if (mounted) {
          setSelectedModel(publicConfig.defaultModel);
        }
      } finally {
        if (mounted) setIsBootLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [isAuthenticated]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation?.messages.length, isSending]);

  // Track scroll position for scroll-to-bottom button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(fromBottom > 200);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  const quotaLabel = useMemo(() => {
    if (!state) return null;
    return `${formatTokens(state.quota.totalAvailable)} токенов`;
  }, [state]);

  const filteredConversations = useMemo(() => {
    if (!state?.conversations) return [];
    if (!sidebarSearch.trim()) return state.conversations;
    const q = sidebarSearch.toLowerCase();
    return state.conversations.filter(
      (c) => c.title.toLowerCase().includes(q) || c.lastMessage?.toLowerCase().includes(q),
    );
  }, [state?.conversations, sidebarSearch]);

  const handleSelectConversation = useCallback(async (id: string) => {
    setMobileSidebarOpen(false);
    const detail = await apiClient.get<AiConversationDetail>(`/user/ai/conversations/${id}`);
    setConversation(detail);
    setSelectedModel(detail.model || state?.settings.defaultModel || config?.defaultModel || "");
    const arts = detail.files.filter((f) => f.kind === "artifact");
    setArtifacts(arts);
    setSelectedArtifact(arts[0] ?? null);
    setShowCanvas(arts.length > 0);
  }, [config?.defaultModel, state?.settings.defaultModel]);

  const handleCreateConversation = useCallback(async () => {
    setMobileSidebarOpen(false);
    const created = await apiClient.post<{ id: string; title: string; updatedAt: string }>(
      "/user/ai/conversations", {},
    );
    const nextState = await apiClient.get<AiUserState>("/user/ai/state");
    setState(nextState);
    setConversation({
      id: created.id,
      title: created.title,
      model: null,
      createdAt: created.updatedAt,
      updatedAt: created.updatedAt,
      messages: [],
      files: [],
    });
    setSelectedModel(nextState.settings.defaultModel || config?.defaultModel || "");
    setArtifacts([]);
    setSelectedArtifact(null);
    setShowCanvas(false);
  }, [config?.defaultModel]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const uploaded: AiFileItem[] = [];
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      if (conversation?.id) form.append("conversationId", conversation.id);
      const item = await apiClient.upload<AiFileItem>("/user/ai/uploads", form);
      uploaded.push(item);
    }
    setPendingFiles((prev) => [...prev, ...uploaded]);
    event.target.value = "";
  };

  const handleSend = async () => {
    if (!draft.trim() || isSending) return;
    setIsSending(true);
    const optimistic: AiChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: draft.trim(),
      createdAt: new Date().toISOString(),
    };
    const cur = conversation ?? {
      id: "",
      title: "Новый диалог",
      model: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      files: [],
    };
    setConversation({ ...cur, messages: [...cur.messages, optimistic] });
    const msg = draft.trim();
    setDraft("");
    try {
      const response = await apiClient.post<AiChatResponse>("/user/ai/chat", {
        conversationId: conversation?.id,
        message: msg,
        attachmentIds: pendingFiles.map((f) => f.id),
        model: selectedModel || conversation?.model || state?.settings.defaultModel || config?.defaultModel,
      });
      const [detail, nextState] = await Promise.all([
        apiClient.get<AiConversationDetail>(`/user/ai/conversations/${response.conversationId}`),
        apiClient.get<AiUserState>("/user/ai/state"),
      ]);
      setState(nextState);
      setConversation(detail);
      setSelectedModel(detail.model || nextState.settings.defaultModel || config?.defaultModel || "");
      const nextArts = response.artifacts;
      setArtifacts(nextArts);
      if (nextArts[0]) { setSelectedArtifact(nextArts[0]); setShowCanvas(true); }
      setPendingFiles([]);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 402) setShowPaywall(true);
    } finally {
      setIsSending(false);
    }
  };

  const modelOptions = useMemo(() => {
    const values = [
      selectedModel,
      conversation?.model,
      state?.settings.defaultModel,
      state?.settings.localModel,
      config?.defaultModel,
      "openai/gpt-4o-mini",
      "anthropic/claude-3.7-sonnet",
      "google/gemini-2.0-flash-001",
      "qwen3.5:0.8b",
    ].filter(Boolean) as string[];

    return Array.from(new Set(values));
  }, [
    config?.defaultModel,
    conversation?.model,
    selectedModel,
    state?.settings.defaultModel,
    state?.settings.localModel,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handlePurchase = async (plan: string) => {
    await apiClient.post("/user/ai/purchase", { plan });
    setState(await apiClient.get<AiUserState>("/user/ai/state"));
    setShowPaywall(false);
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const sidebarProps = {
    user: user ? { login: user.login, avatarHash: user.avatarHash } : null,
    state,
    conversation,
    quotaLabel,
    sidebarSearch,
    setSidebarSearch,
    onCreateConversation: handleCreateConversation,
    onSelectConversation: handleSelectConversation,
    onLogout: () => { logout(); router.push("/"); },
    filteredConversations,
  };

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (isBootLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Loader size={64} />
        </motion.div>
      </div>
    );
  }

  if (!isAuthenticated) return <AuthGate config={config} />;

  // ── Layout ────────────────────────────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen overflow-hidden bg-background">

        {/* Desktop sidebar */}
        <aside className="hidden w-[260px] shrink-0 flex-col border-r border-border/40 bg-sidebar lg:flex">
          <SidebarContent {...sidebarProps} />
        </aside>

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Header */}
          <header className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-xl lg:px-6">
            {/* Mobile menu */}
            <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl lg:hidden">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <SidebarContent {...sidebarProps} />
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold">
                {conversation?.title || "Новый чат"}
              </h1>
              <p className="truncate text-xs text-muted-foreground/70">
                {selectedModel || conversation?.model || state?.settings.defaultModel || config?.defaultModel}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 rounded-xl px-3 text-xs">
                    {selectedModel ? selectedModel.split("/").pop() : "Модель"}
                    <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto rounded-xl">
                  <DropdownMenuLabel>Модель чата</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {modelOptions.map((model) => (
                    <DropdownMenuItem
                      key={model}
                      className="cursor-pointer"
                      onClick={() => setSelectedModel(model)}
                    >
                      {model}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {hasCanvas && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl"
                      onClick={() => setShowCanvas((v) => !v)}
                    >
                      {showCanvas ? (
                        <PanelRightClose className="h-4 w-4" />
                      ) : (
                        <PanelRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{showCanvas ? "Закрыть холст" : "Открыть холст"}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </header>

          {/* Messages + canvas */}
          <div className="flex flex-1 overflow-hidden">

            {/* Messages area */}
            <div className="relative flex flex-1 flex-col overflow-hidden">
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto scroll-smooth px-4 py-8 lg:px-8"
              >
                <div className="mx-auto w-full max-w-3xl space-y-8">
                  {conversation?.messages.length ? (
                    <>
                      {conversation.messages.map((msg) => (
                        <MessageBubble key={msg.id} message={msg} />
                      ))}
                      {isSending && (
                        <motion.div
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex gap-3"
                        >
                          <div className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                            >
                              <Brain className="h-4 w-4 text-primary" />
                            </motion.div>
                          </div>
                          <div className="mt-5 rounded-2xl rounded-tl-sm bg-card px-4 py-3 ring-1 ring-border/40">
                            <span className="text-muted-foreground"><TypingDots /></span>
                          </div>
                        </motion.div>
                      )}
                      {/* Bottom spacer */}
                      <div className="h-4" />
                    </>
                  ) : (
                    /* ── Empty state ── */
                    <motion.div
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="flex flex-col items-center py-24 text-center"
                    >
                      <motion.div
                        animate={{ scale: [1, 1.08, 1] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 shadow-lg shadow-primary/10"
                      >
                        <Sparkles className="h-8 w-8 text-primary" />
                      </motion.div>
                      <h2 className="text-2xl font-black tracking-tight">Чем могу помочь?</h2>
                      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
                        Задайте вопрос, прикрепите файл или попросите создать артефакт — таблицу, документ, изображение.
                      </p>
                      <div className="mt-8 flex flex-wrap justify-center gap-2">
                        {[
                          { label: "Сравни VPN-протоколы", icon: "🔒" },
                          { label: "Сделай таблицу CSV", icon: "📊" },
                          { label: "Найди в интернете", icon: "🔍" },
                          { label: "Разбери мой файл", icon: "📄" },
                        ].map(({ label, icon }) => (
                          <motion.button
                            key={label}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            type="button"
                            onClick={() => setDraft(label)}
                            className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/60 px-4 py-2.5 text-sm shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
                          >
                            <span>{icon}</span>
                            {label}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Scroll to bottom button */}
              <AnimatePresence>
                {showScrollBtn && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 8 }}
                    transition={{ duration: 0.18 }}
                    type="button"
                    onClick={scrollToBottom}
                    className="absolute bottom-[88px] left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border/50 bg-background/90 shadow-md backdrop-blur-sm hover:bg-muted/80"
                  >
                    <ArrowDown className="h-4 w-4 text-muted-foreground" />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Input area */}
              <div className="shrink-0 border-t border-border/40 bg-background/80 px-4 py-4 backdrop-blur-xl lg:px-8">
                <div className="mx-auto w-full max-w-3xl">
                  {/* Pending files */}
                  <AnimatePresence>
                    {pendingFiles.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-2 flex flex-wrap gap-1.5"
                      >
                        {pendingFiles.map((file) => (
                          <div
                            key={file.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/50 pl-2 pr-1 py-1 text-xs"
                          >
                            {file.mimeType.startsWith("image/") ? (
                              <ImageIcon className="h-3 w-3 text-primary" />
                            ) : (
                              <FileUp className="h-3 w-3 text-primary" />
                            )}
                            <span className="max-w-[100px] truncate">{file.fileName}</span>
                            <button
                              type="button"
                              onClick={() => setPendingFiles((p) => p.filter((f) => f.id !== file.id))}
                              className="rounded-full p-0.5 hover:bg-muted"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Input box */}
                  <div className={cn(
                    "flex items-end gap-2 rounded-2xl border bg-card/80 px-3 py-2.5 shadow-sm transition-all duration-200",
                    draft ? "border-primary/30 shadow-primary/5 shadow-md" : "border-border/40",
                  )}>
                    {/* Attach */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="mb-0.5 shrink-0 rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Прикрепить файл</TooltipContent>
                    </Tooltip>

                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />

                    {/* Textarea */}
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Напишите сообщение… (Enter — отправить)"
                      rows={1}
                      className="flex-1 resize-none bg-transparent py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground/40"
                      style={{ maxHeight: "200px" }}
                    />

                    {/* Send */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          whileTap={{ scale: 0.92 }}
                          type="button"
                          onClick={handleSend}
                          disabled={isSending || !draft.trim()}
                          className={cn(
                            "mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                            draft.trim() && !isSending
                              ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                              : "bg-muted/50 text-muted-foreground/40 cursor-not-allowed",
                          )}
                        >
                          <AnimatePresence mode="wait">
                            {isSending ? (
                              <motion.span
                                key="spin"
                                initial={{ opacity: 0, rotate: -90 }}
                                animate={{ opacity: 1, rotate: 0 }}
                                exit={{ opacity: 0, rotate: 90 }}
                                className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin block"
                              />
                            ) : (
                              <motion.span
                                key="arrow"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent>Отправить (Enter)</TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Hint row */}
                  <div className="mt-1.5 flex items-center justify-between px-1">
                    <span className="text-[10px] text-muted-foreground/40">
                      Shift+Enter — перенос строки
                    </span>
                    {quotaLabel && (
                      <span className="text-[10px] text-muted-foreground/40">
                        {quotaLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Canvas panel */}
            <AnimatePresence>
              {showCanvas && selectedArtifact && (
                <motion.aside
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 440, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                  className="flex shrink-0 flex-col overflow-hidden border-l border-border/40 bg-background/80 backdrop-blur-xl"
                >
                  {/* Canvas header */}
                  <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">Холст</div>
                      <div className="truncate text-xs text-muted-foreground/70">
                        {selectedArtifact.fileName}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 rounded-lg"
                      onClick={() => setShowCanvas(false)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Artifact tabs */}
                  {artifacts.length > 1 && (
                    <div className="flex gap-1 overflow-x-auto border-b border-border/40 px-3 py-2">
                      {artifacts.map((art) => (
                        <button
                          key={art.id}
                          type="button"
                          onClick={() => setSelectedArtifact(art)}
                          className={cn(
                            "shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                            selectedArtifact.id === art.id
                              ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                              : "text-muted-foreground hover:bg-muted/50",
                          )}
                        >
                          {art.fileName}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Preview */}
                  <div className="flex-1 overflow-auto p-4">
                    <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                      {selectedArtifact.mimeType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={selectedArtifact.blobUrl}
                          alt={selectedArtifact.fileName}
                          className="h-auto w-full object-cover"
                        />
                      ) : (
                        <iframe
                          title={selectedArtifact.fileName}
                          src={selectedArtifact.blobUrl}
                          className="h-[60vh] w-full"
                        />
                      )}
                    </div>
                  </div>

                  {/* Canvas footer */}
                  <div className="border-t border-border/40 p-4">
                    <div className="flex gap-2">
                      <Button asChild variant="outline" className="flex-1 h-8 gap-1.5 rounded-xl text-xs">
                        <a href={selectedArtifact.blobUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Открыть
                        </a>
                      </Button>
                      <Button asChild variant="outline" className="flex-1 h-8 gap-1.5 rounded-xl text-xs">
                        <a href={selectedArtifact.blobUrl} download={selectedArtifact.fileName}>
                          <Download className="h-3.5 w-3.5" />
                          Скачать
                        </a>
                      </Button>
                    </div>
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Paywall */}
        <AnimatePresence>
          {showPaywall && state && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] flex items-end justify-center bg-background/60 p-4 backdrop-blur-xl sm:items-center"
            >
              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.97 }}
                transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                className="w-full max-w-3xl rounded-[2rem] border border-border/50 bg-background p-6 shadow-2xl"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xl font-black tracking-tight">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Лимит AI токенов исчерпан
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Выберите AI-подписку или докупите токены. Оплата спишется с баланса.
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setShowPaywall(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  {[
                    { slug: "ai", title: "AI", price: state.settings.aiPlanPrice, caption: "10M токенов / мес" },
                    { slug: "max", title: "MAX", price: state.settings.maxPlanPrice, caption: "25M токенов / мес" },
                    { slug: "combo", title: "Combo", price: state.settings.comboPlanPrice, caption: "VPN + AI" },
                    { slug: "tokens", title: "Токены", price: state.settings.tokenPackPrice, caption: `${formatTokens(state.settings.tokenPackSize)} токенов` },
                  ].map((item, i) => (
                    <motion.div
                      key={item.slug}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="rounded-2xl border border-border/50 bg-card/70 p-4 hover:border-primary/30 transition-colors"
                    >
                      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{item.title}</div>
                      <div className="mt-1.5 text-2xl font-black">{item.price} ₽</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.caption}</div>
                      <Button className="mt-4 h-8 w-full rounded-xl text-xs" onClick={() => handlePurchase(item.slug)}>
                        Купить
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
