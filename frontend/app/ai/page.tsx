"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Brain,
  ChevronRight,
  Copy,
  Check,
  Globe,
  Link2,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  Search,
  Send,
  Sparkles,
  X,
  FileText,
  Image as ImageIcon,
  File,
  Download,
  Zap,
  Crown,
  ChevronsUpDown,
  LogOut,
  Moon,
  Sun,
  CreditCard,
  Maximize2,
  Minimize2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { apiClient } from "@/api/client";
import type { StreamHandle } from "@/api/client";
import { AiMarkdown } from "@/components/ai-markdown";
import type {
  AiUserState,
  AiConversationDetail,
  AiChatMessage,
  AiFileItem,
} from "@/api/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolEvent {
  name: string;
  args?: string;
  result?: unknown;
  status: "loading" | "done" | "error";
}

interface StreamingState {
  content: string;
  reasoning: string;
  toolEvents: ToolEvent[];
}

interface LocalAttachment {
  id: string;
  file: File;
  previewUrl?: string;
  uploadedId?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400)
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function groupConversationsByDate(convs: AiUserState["conversations"]) {
  const groups: Record<string, AiUserState["conversations"]> = {};
  const now = new Date();
  for (const c of convs) {
    const d = new Date(c.updatedAt);
    const diff = (now.getTime() - d.getTime()) / 86400000;
    let label: string;
    if (diff < 1) label = "Сегодня";
    else if (diff < 2) label = "Вчера";
    else if (diff < 7) label = "На этой неделе";
    else label = "Раньше";
    if (!groups[label]) groups[label] = [];
    groups[label].push(c);
  }
  return Object.entries(groups);
}

function getFileIcon(mime: string) {
  if (mime.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (mime.includes("pdf")) return <FileText className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

function getToolLabel(name: string) {
  if (name === "duckduckgo_search") return "Поиск в сети";
  if (name === "smart_fetch_url") return "Открытие страницы";
  if (name === "create_artifact") return "Создание файла";
  return name;
}

function getToolIcon(name: string) {
  if (name === "duckduckgo_search") return <Search className="h-3.5 w-3.5" />;
  if (name === "smart_fetch_url") return <Link2 className="h-3.5 w-3.5" />;
  if (name === "create_artifact") return <File className="h-3.5 w-3.5" />;
  return <Globe className="h-3.5 w-3.5" />;
}

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-muted-foreground/60"
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

// ─── Thinking block ───────────────────────────────────────────────────────────

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const words = text.trim().split(/\s+/).length;

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-violet-500/20 bg-violet-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <motion.div
          animate={{ rotate: open ? 360 : 0 }}
          transition={{
            duration: 0.6,
            repeat: open ? Infinity : 0,
            ease: "linear",
          }}
        >
          <Brain className="h-4 w-4 text-violet-400" />
        </motion.div>
        <span className="flex-1 text-sm font-medium text-violet-300">
          Размышление
        </span>
        <span className="text-xs text-violet-500">{words} слов</span>
        <ChevronRight
          className={`h-4 w-4 text-violet-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="max-h-64 overflow-y-auto border-t border-violet-500/20 px-4 py-3">
              <p className="whitespace-pre-wrap text-xs leading-6 text-violet-300/80">
                {text}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Tool call card ───────────────────────────────────────────────────────────

function ToolCallCard({ event }: { event: ToolEvent }) {
  const [open, setOpen] = useState(false);
  let queryLabel = "";
  try {
    const args = JSON.parse(event.args ?? "{}") as Record<string, string>;
    queryLabel = args.query ?? args.url ?? args.title ?? "";
  } catch {}

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-2 overflow-hidden rounded-lg border border-border/40 bg-muted/30"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-muted-foreground">{getToolIcon(event.name)}</span>
        <span className="flex-1 text-xs font-medium text-foreground">
          {getToolLabel(event.name)}
        </span>
        {queryLabel && (
          <span className="max-w-[140px] truncate text-xs text-muted-foreground">
            {queryLabel}
          </span>
        )}
        {event.status === "loading" ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-3.5 w-3.5 rounded-full border-2 border-primary/40 border-t-primary"
          />
        ) : (
          <Check className="h-3.5 w-3.5 text-green-400" />
        )}
      </button>
      <AnimatePresence>
        {open && Boolean(event.result) && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-48 overflow-y-auto border-t border-border/40 px-3 py-2">
              <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">
                {JSON.stringify(event.result, null, 2)}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Artifact card ────────────────────────────────────────────────────────────

function ArtifactCard({ artifact }: { artifact: AiFileItem }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mt-3 flex items-center gap-3 overflow-hidden rounded-xl border border-border/50 bg-muted/30 px-4 py-3"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{artifact.fileName}</p>
        <p className="text-xs text-muted-foreground">{artifact.mimeType}</p>
      </div>
      <a
        href={artifact.blobUrl}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Download className="h-4 w-4" />
      </a>
    </motion.div>
  );
}

// ─── Attachment chip ──────────────────────────────────────────────────────────

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: LocalAttachment;
  onRemove: () => void;
}) {
  const isImage = attachment.file.type.startsWith("image/");
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 8 }}
      className="relative flex items-center gap-2 overflow-hidden rounded-xl border border-border/50 bg-muted/60 px-3 py-2 pr-8"
    >
      {isImage && attachment.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.previewUrl}
          alt=""
          className="h-8 w-8 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {getFileIcon(attachment.file.type)}
        </div>
      )}
      <div className="min-w-0">
        <p className="max-w-[120px] truncate text-xs font-medium">
          {attachment.file.name}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {(attachment.file.size / 1024).toFixed(0)} KB
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

// ─── Audio equalizer ──────────────────────────────────────────────────────────

function AudioEqualizer({ frequencies }: { frequencies: number[] }) {
  return (
    <div className="flex h-4 items-end gap-[2px]">
      {frequencies.map((v, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-current"
          style={{ height: Math.max(3, v * 16) }}
          animate={{ height: Math.max(3, v * 16) }}
          transition={{ duration: 0.05, ease: "linear" }}
        />
      ))}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  streaming,
}: {
  message?: AiChatMessage;
  streaming?: StreamingState;
}) {
  const isUser = message?.role === "user";
  const isStreamingMsg = !message && !!streaming;
  const [hovering, setHovering] = useState(false);
  const [copied, setCopied] = useState(false);

  const toolEventsRaw = message?.toolEvents;
  const artifactsRaw = message?.artifacts;

  const content = message?.content ?? streaming?.content ?? "";
  const reasoning = message?.reasoning ?? streaming?.reasoning;
  const toolEvents = (
    isStreamingMsg
      ? streaming?.toolEvents
      : Array.isArray(toolEventsRaw)
      ? toolEventsRaw
      : []
  ) as ToolEvent[];
  const artifacts = (Array.isArray(artifactsRaw) ? artifactsRaw : []) as AiFileItem[];

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  if (isUser) {
    const attRaw = message?.attachments;
    const attachments = (
      Array.isArray(attRaw) ? attRaw : []
    ) as Array<{ fileName: string; mimeType: string; blobUrl: string }>;

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full justify-end"
      >
        <div className="max-w-[80%]">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              {attachments.map((a, i) => (
                <a
                  key={i}
                  href={a.blobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/60 px-3 py-2 text-xs hover:bg-muted"
                >
                  {getFileIcon(a.mimeType)}
                  <span className="max-w-[100px] truncate">{a.fileName}</span>
                </a>
              ))}
            </div>
          )}
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-primary-foreground">
            <p className="whitespace-pre-wrap text-sm leading-7">{content}</p>
          </div>
          <p className="mt-1 text-right text-[10px] text-muted-foreground">
            {message?.createdAt ? formatDate(message.createdAt) : ""}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {toolEvents.length > 0 && (
        <div className="mb-3">
          {toolEvents.map((te, i) => (
            <ToolCallCard key={i} event={te} />
          ))}
        </div>
      )}

      {reasoning && <ThinkingBlock text={reasoning} />}

      <div className="w-full text-foreground">
        {isStreamingMsg && !content ? (
          <TypingDots />
        ) : (
          <AiMarkdown content={content} />
        )}
      </div>

      {artifacts.map((a) => (
        <ArtifactCard key={a.id} artifact={a} />
      ))}

      <div className="mt-1 flex items-center gap-2">
        <AnimatePresence>
          {hovering && !isStreamingMsg && content && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {!isStreamingMsg && message?.model && (
          <span className="text-[10px] text-muted-foreground/50">
            {message.model}
          </span>
        )}
        {!isStreamingMsg && message?.createdAt && (
          <span className="text-[10px] text-muted-foreground/40">
            {formatDate(message.createdAt)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Subscription panel ───────────────────────────────────────────────────────

function SubscriptionPanel({ state }: { state: AiUserState | null }) {
  const router = useRouter();
  if (!state) return null;

  const { quota, subscription } = state;
  const used = quota.includedLimit - quota.includedRemaining;
  const pct = quota.includedLimit > 0 ? (used / quota.includedLimit) * 100 : 0;
  const hasSubscription = !!subscription;
  const planName = subscription?.title ?? "Без подписки";
  const tierColor =
    subscription?.tier === "max"
      ? "text-amber-400"
      : subscription?.tier === "ai"
      ? "text-violet-400"
      : "text-muted-foreground";

  return (
    <div className="mx-3 mb-2 overflow-hidden rounded-xl border border-border/40 bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {subscription?.tier === "max" ? (
            <Crown className="h-3.5 w-3.5 text-amber-400" />
          ) : (
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className={`text-xs font-semibold ${tierColor}`}>{planName}</span>
        </div>
        {quota.purchasedTokens > 0 && (
          <span className="font-mono text-[10px] text-primary/70">
            +{(quota.purchasedTokens / 1000).toFixed(0)}K купл.
          </span>
        )}
      </div>
      <div className="mb-3 space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Токены</span>
          <span>
            {(used / 1000).toFixed(0)}K /{" "}
            {(quota.includedLimit / 1000).toFixed(0)}K
          </span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
      <Button
        size="sm"
        variant={hasSubscription ? "outline" : "default"}
        className="h-7 w-full text-xs"
        onClick={() => router.push("/me/billing")}
      >
        {hasSubscription ? "Улучшить" : "Оформить подписку"}
      </Button>
    </div>
  );
}

// ─── Conversation list ────────────────────────────────────────────────────────

function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: AiUserState["conversations"];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const groups = useMemo(
    () => groupConversationsByDate(conversations),
    [conversations],
  );

  if (!conversations.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Sparkles className="mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Нет диалогов</p>
        <p className="text-xs text-muted-foreground/60">Начните новый чат</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([label, items]) => (
        <div key={label}>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            {label}
          </p>
          {items.map((conv) => {
            const isActive = conv.id === activeId;
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelect(conv.id)}
                className={`group relative w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <p className="truncate text-sm font-medium leading-tight">
                  {conv.title}
                </p>
                {conv.lastMessage && (
                  <p className="mt-0.5 truncate text-[11px] opacity-60">
                    {conv.lastMessage}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Sidebar profile (mirrors NavUser) ───────────────────────────────────────

function SidebarProfile({ state }: { state: AiUserState | null }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  const displayUser = user ?? { login: "guest", avatarHash: "aabbcc" };
  const avatarHue =
    parseInt(displayUser.avatarHash.substring(0, 6) || "0", 16) % 360;
  const avatarColor = `hsl(${avatarHue}, 85%, 55%)`;

  if (!mounted) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-muted/60"
        >
          <Avatar className="h-8 w-8 rounded-lg">
            <AvatarFallback
              className="rounded-lg text-sm font-bold text-primary-foreground"
              style={{ backgroundColor: avatarColor }}
            >
              {displayUser.login.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold">{displayUser.login}</p>
            {state && (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <span className={state.subscription ? "text-primary" : ""}>
                  {state.subscription?.title ?? "Без подписки"}
                </span>
                <span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-1 text-[10px] text-primary">
                  {(state.quota.totalAvailable / 1000).toFixed(0)}K ток.
                </span>
              </p>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        className="w-56 rounded-xl"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarFallback
                className="rounded-lg font-bold text-primary-foreground"
                style={{ backgroundColor: avatarColor }}
              >
                {displayUser.login.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="truncate text-sm font-semibold">
                {displayUser.login}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Токены: {(state?.quota.totalAvailable ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
          {theme === "dark" ? (
            <Sun className="mr-2 h-4 w-4" />
          ) : (
            <Moon className="mr-2 h-4 w-4" />
          )}
          {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.push("/me/billing")}
          className="cursor-pointer"
        >
          <CreditCard className="mr-2 h-4 w-4" />
          Кошелёк
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer font-medium text-destructive focus:text-destructive"
          onClick={() => {
            logout();
            router.push("/");
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Sidebar content ──────────────────────────────────────────────────────────

function SidebarContent({
  state,
  activeConvId,
  onNewChat,
  onSelectConv,
  onClose,
}: {
  state: AiUserState | null;
  activeConvId: string | null;
  onNewChat: () => void;
  onSelectConv: (id: string) => void;
  onClose?: () => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!state?.conversations) return [];
    if (!search.trim()) return state.conversations;
    const q = search.toLowerCase();
    return state.conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q),
    );
  }, [state?.conversations, search]);

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-5">
        <Link href="/" onClick={onClose} className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight tracking-tight">
              lowkey
            </p>
            <p className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
              AI Workspace
            </p>
          </div>
        </Link>
      </div>

      {/* New chat */}
      <div className="px-3 pb-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => {
            onNewChat();
            onClose?.();
          }}
        >
          <Plus className="h-4 w-4" />
          Новый чат
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по чатам..."
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Conversations */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        <ConversationList
          conversations={filtered}
          activeId={activeConvId}
          onSelect={(id) => {
            onSelectConv(id);
            onClose?.();
          }}
        />
      </div>

      {/* Subscription */}
      <SubscriptionPanel state={state} />

      {/* Profile */}
      <div className="border-t border-border/40 px-3 pb-4 pt-3">
        <SidebarProfile state={state} />
      </div>
    </div>
  );
}

// ─── Canvas panel ─────────────────────────────────────────────────────────────

function CanvasPanel({
  content,
  onClose,
}: {
  content: string;
  onClose: () => void;
}) {
  const [localContent, setLocalContent] = useState(content);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <span className="text-sm font-semibold">Холст</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <textarea
        value={localContent}
        onChange={(e) => setLocalContent(e.target.value)}
        className="flex-1 resize-none bg-transparent p-4 font-mono text-sm outline-none"
        spellCheck={false}
      />
    </div>
  );
}

// ─── Quick prompts ────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { emoji: "📊", text: "Построй график данных" },
  { emoji: "📝", text: "Напиши краткое эссе" },
  { emoji: "🔍", text: "Найди информацию в сети" },
  { emoji: "💡", text: "Объясни концепцию" },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AiPage() {
  const { user } = useAuth();
  const router = useRouter();

  // State
  const [aiState, setAiState] = useState<AiUserState | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputText, setInputText] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasContent] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convModel, setConvModel] = useState<string | null>(null);

  // Audio state
  const [isRecording, setIsRecording] = useState(false);
  const [frequencies, setFrequencies] = useState<number[]>(
    new Array(16).fill(0),
  );

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamHandleRef = useRef<StreamHandle | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const rafRef = useRef<number>(0);

  // Bootstrap
  useEffect(() => {
    if (!user) {
      router.push("/");
      return;
    }
    apiClient.get<AiUserState>("/user/ai/state").then(setAiState).catch(() => {});
  }, [user, router]);

  // Scroll to bottom on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming?.content]);

  // Load conversation
  const loadConversation = useCallback(async (id: string) => {
    try {
      const detail = await apiClient.get<AiConversationDetail>(
        `/user/ai/conversations/${id}`,
      );
      setMessages(detail.messages);
      setActiveConvId(id);
      setConvModel(detail.model);
    } catch {
      setError("Не удалось загрузить беседу");
    }
  }, []);

  // New chat
  const handleNewChat = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
    setStreaming(null);
    setConvModel(null);
    setError(null);
  }, []);

  // File handling
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      setAttachments((prev) => [
        ...prev,
        ...files.map((file) => ({
          id: `local-${Date.now()}-${Math.random()}`,
          file,
          previewUrl: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined,
        })),
      ]);
      e.target.value = "";
    },
    [],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const a = prev.find((x) => x.id === id);
      if (a?.previewUrl) URL.revokeObjectURL(a.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const uploadAttachments = useCallback(
    async (atts: LocalAttachment[]): Promise<string[]> => {
      const ids: string[] = [];
      for (const att of atts) {
        if (att.uploadedId) {
          ids.push(att.uploadedId);
          continue;
        }
        const fd = new FormData();
        fd.append("file", att.file);
        try {
          const res = await apiClient.upload<{ id: string }>("/user/ai/upload", fd);
          ids.push(res.id);
        } catch {
          // skip
        }
      }
      return ids;
    },
    [],
  );

  // Textarea auto-resize
  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  // Audio recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      type SpeechRecognitionCtor = new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: ((e: unknown) => void) | null;
        onend: (() => void) | null;
        start(): void;
        stop(): void;
      };
      const w = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      };
      const SRApi: SpeechRecognitionCtor | undefined =
        w.SpeechRecognition ?? w.webkitSpeechRecognition;

      if (SRApi) {
        const rec = new SRApi() as {
          lang: string;
          interimResults: boolean;
          continuous: boolean;
          onresult: (e: unknown) => void;
          onend: () => void;
          start: () => void;
          stop: () => void;
        };
        rec.lang = "ru-RU";
        rec.interimResults = true;
        rec.continuous = true;
        rec.onresult = (e: unknown) => {
          const event = e as { results: ArrayLike<{ 0: { transcript: string } }> };
          const t = Array.from(event.results)
            .map((r) => r[0].transcript)
            .join("");
          setInputText(t);
        };
        rec.onend = () => setIsRecording(false);
        rec.start();
        recognitionRef.current = rec;
      }

      setIsRecording(true);
      const tick = () => {
        if (!analyserRef.current) return;
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(buf);
        setFrequencies(Array.from(buf.slice(0, 16)).map((v) => v / 255));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // mic unavailable
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    recognitionRef.current?.stop();
    cancelAnimationFrame(rafRef.current);
    setIsRecording(false);
    setFrequencies(new Array(16).fill(0));
  }, []);

  // Send
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    setInputText("");
    setError(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const currentAtts = [...attachments];
    setAttachments([]);

    const userMsg: AiChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      attachments: currentAtts.map((a) => ({
        fileName: a.file.name,
        mimeType: a.file.type,
        blobUrl: a.previewUrl ?? "",
      })),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setStreaming({ content: "", reasoning: "", toolEvents: [] });

    const attachmentIds = await uploadAttachments(currentAtts);

    const handle = apiClient.streamChat({
      message: text,
      conversationId: activeConvId ?? undefined,
      attachmentIds,
      model: aiState?.settings.defaultModel,
    });
    streamHandleRef.current = handle;

    handle.on("connected", (d) => {
      const data = d as { conversationId: string; isNew: boolean };
      setActiveConvId(data.conversationId);
      if (data.isNew) {
        apiClient
          .get<AiUserState>("/user/ai/state")
          .then(setAiState)
          .catch(() => {});
      }
    });

    handle.on("delta", (d) => {
      const { text: chunk } = d as { text: string };
      setStreaming((prev) =>
        prev ? { ...prev, content: prev.content + chunk } : null,
      );
    });

    handle.on("reasoning_delta", (d) => {
      const { text: chunk } = d as { text: string };
      setStreaming((prev) =>
        prev ? { ...prev, reasoning: prev.reasoning + chunk } : null,
      );
    });

    handle.on("tool_call", (d) => {
      const { name, args } = d as { name: string; args: string };
      setStreaming((prev) =>
        prev
          ? {
              ...prev,
              toolEvents: [
                ...prev.toolEvents,
                { name, args, status: "loading" as const },
              ],
            }
          : null,
      );
    });

    handle.on("tool_result", (d) => {
      const { name, result } = d as { name: string; result: unknown };
      setStreaming((prev) =>
        prev
          ? {
              ...prev,
              toolEvents: prev.toolEvents.map((te) =>
                te.name === name && te.status === "loading"
                  ? { ...te, result, status: "done" as const }
                  : te,
              ),
            }
          : null,
      );
    });

    handle.on("done", (d) => {
      const data = d as {
        messageId: string;
        content: string;
        reasoning: string | null;
        model: string;
        toolEvents: unknown;
        artifacts: AiFileItem[];
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      };
      const assistantMsg: AiChatMessage = {
        id: data.messageId,
        role: "assistant",
        content: data.content,
        reasoning: data.reasoning,
        model: data.model,
        toolEvents: data.toolEvents,
        artifacts: data.artifacts as unknown,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        totalTokens: data.totalTokens,
        createdAt: new Date().toISOString(),
      };
      setConvModel(data.model);
      setMessages((prev) => [...prev, assistantMsg]);
      setStreaming(null);
      setIsStreaming(false);
      apiClient
        .get<AiUserState>("/user/ai/state")
        .then(setAiState)
        .catch(() => {});
    });

    handle.on("error", (d) => {
      const { message: msg } = d as { message: string };
      setError(msg);
      setStreaming(null);
      setIsStreaming(false);
    });
  }, [
    inputText,
    isStreaming,
    attachments,
    activeConvId,
    aiState,
    uploadAttachments,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const convTitle = useMemo(() => {
    if (!activeConvId || !aiState?.conversations) return null;
    return (
      aiState.conversations.find((c) => c.id === activeConvId)?.title ?? null
    );
  }, [activeConvId, aiState?.conversations]);

  const hasInput = inputText.trim().length > 0 || attachments.length > 0;

  const sidebarProps = {
    state: aiState,
    activeConvId,
    onNewChat: handleNewChat,
    onSelectConv: loadConversation,
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border/50 lg:flex">
          <SidebarContent {...sidebarProps} />
        </aside>

        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SidebarContent
              {...sidebarProps}
              onClose={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        {/* Main area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/40 px-4">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Brain className="h-5 w-5" />
            </Button>

            <div className="min-w-0 flex-1">
              {convTitle ? (
                <div>
                  <p className="truncate text-sm font-semibold">{convTitle}</p>
                  {convModel && (
                    <p className="font-mono text-[10px] text-muted-foreground/60">
                      {convModel}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm font-semibold text-muted-foreground">
                  Новый чат
                </p>
              )}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCanvasOpen((v) => !v)}
                >
                  {canvasOpen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {canvasOpen ? "Закрыть холст" : "Открыть холст"}
              </TooltipContent>
            </Tooltip>
          </header>

          {/* Body */}
          <div className="flex min-h-0 flex-1">
            {/* Messages column */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {messages.length === 0 && !streaming ? (
                  /* Empty state */
                  <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
                    <div className="text-center">
                      <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
                      >
                        <Sparkles className="h-8 w-8 text-primary" />
                      </motion.div>
                      <h1 className="text-2xl font-bold">Чем могу помочь?</h1>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Спросите о чём угодно или выберите быстрый запрос
                      </p>
                    </div>
                    <div className="grid w-full max-w-md grid-cols-2 gap-2">
                      {QUICK_PROMPTS.map((p) => (
                        <motion.button
                          key={p.text}
                          type="button"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            setInputText(p.text);
                            textareaRef.current?.focus();
                          }}
                          className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-3 text-left text-sm transition-colors hover:bg-muted/60"
                        >
                          <span className="text-base">{p.emoji}</span>
                          <span className="text-xs leading-tight text-muted-foreground">
                            {p.text}
                          </span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
                    <AnimatePresence initial={false}>
                      {messages.map((msg) => (
                        <MessageBubble key={msg.id} message={msg} />
                      ))}
                      {streaming && (
                        <MessageBubble key="streaming" streaming={streaming} />
                      )}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
                  >
                    <span className="flex-1">{error}</span>
                    <button type="button" onClick={() => setError(null)}>
                      <X className="h-4 w-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Input */}
              <div className="shrink-0 px-4 pb-4 pt-2">
                <div
                  className={`mx-auto max-w-3xl overflow-hidden rounded-2xl border transition-all duration-200 ${
                    hasInput
                      ? "border-primary/40 shadow-lg shadow-primary/5"
                      : "border-border/50"
                  } bg-muted/30`}
                >
                  {/* Attachments strip */}
                  <AnimatePresence>
                    {attachments.length > 0 && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-wrap gap-2 p-3 pb-0">
                          {attachments.map((a) => (
                            <AttachmentChip
                              key={a.id}
                              attachment={a}
                              onRemove={() => removeAttachment(a.id)}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex items-end gap-2 p-3">
                    <textarea
                      ref={textareaRef}
                      value={inputText}
                      onChange={(e) => {
                        setInputText(e.target.value);
                        adjustTextarea();
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        isRecording ? "Говорите..." : "Напишите сообщение..."
                      }
                      rows={1}
                      className="flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/60"
                      style={{ maxHeight: 200 }}
                    />

                    <div className="flex shrink-0 items-center gap-1">
                      {/* Attach */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isStreaming}
                          >
                            <Paperclip className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Прикрепить файл</TooltipContent>
                      </Tooltip>

                      {/* Audio */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 transition-colors ${
                              isRecording
                                ? "text-red-400 hover:text-red-400"
                                : "text-muted-foreground"
                            }`}
                            onClick={
                              isRecording ? stopRecording : startRecording
                            }
                            disabled={isStreaming}
                          >
                            <AnimatePresence mode="wait">
                              {isRecording ? (
                                <motion.div
                                  key="rec"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="flex items-center"
                                >
                                  {frequencies.some((f) => f > 0.05) ? (
                                    <AudioEqualizer frequencies={frequencies} />
                                  ) : (
                                    <MicOff className="h-4 w-4" />
                                  )}
                                </motion.div>
                              ) : (
                                <motion.div
                                  key="idle"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                >
                                  <Mic className="h-4 w-4" />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isRecording ? "Остановить запись" : "Голосовой ввод"}
                        </TooltipContent>
                      </Tooltip>

                      {/* Send */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            className="h-8 w-8"
                            disabled={!hasInput || isStreaming}
                            onClick={handleSend}
                          >
                            {isStreaming ? (
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{
                                  duration: 1,
                                  repeat: Infinity,
                                  ease: "linear",
                                }}
                                className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                              />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Отправить (Enter)</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>

                <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
                  lowkey AI · {aiState?.settings.defaultModel ?? ""}
                </p>
              </div>
            </div>

            {/* Canvas */}
            <AnimatePresence>
              {canvasOpen && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 440, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="shrink-0 overflow-hidden border-l border-border/40 bg-background"
                >
                  <CanvasPanel
                    content={canvasContent}
                    onClose={() => setCanvasOpen(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </TooltipProvider>
  );
}
