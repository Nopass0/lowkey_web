"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, LogIn, BookOpen, Crown, GraduationCap,
  Loader2, X, ChevronRight, Globe, Lock
} from "lucide-react";
import { socialApi } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type Group = {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  color: string;
  memberCount: number;
  courseCount: number;
  isPublic: boolean;
  myRole?: string;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  teacher: "Учитель",
  student: "Ученик",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-yellow-500/20 text-yellow-400",
  teacher: "bg-indigo-500/20 text-indigo-400",
  student: "bg-emerald-500/20 text-emerald-400",
};

function GroupCard({ group, onClick }: { group: Group; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="glass-card rounded-2xl overflow-hidden cursor-pointer group"
    >
      {/* Color banner */}
      <div
        className="h-16 flex items-center px-5 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${group.color}99, ${group.color}44)` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{ background: `radial-gradient(circle at 80% 50%, ${group.color}, transparent 60%)` }}
        />
        <span className="text-3xl relative z-10">{group.emoji}</span>
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {group.isPublic ? (
            <Globe className="w-3.5 h-3.5 text-white/50" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-white/50" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-white text-sm leading-tight">{group.name}</h3>
          <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0 mt-0.5 group-hover:text-white/60 transition-colors" />
        </div>
        {group.description && (
          <p className="text-white/40 text-xs mb-3 line-clamp-2">{group.description}</p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-white/50 text-xs">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {group.memberCount}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              {group.courseCount}
            </span>
          </div>
          {group.myRole && (
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", ROLE_COLORS[group.myRole])}>
              {ROLE_LABELS[group.myRole] || group.myRole}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (g: Group) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("📚");
  const [color, setColor] = useState("#6366f1");
  const [loading, setLoading] = useState(false);

  const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];
  const EMOJIS = ["📚", "🎓", "✏️", "📝", "🔬", "🌍", "🎯", "💡", "🏆", "⚡"];

  const submit = async () => {
    if (!name.trim()) { toast.error("Введите название"); return; }
    setLoading(true);
    try {
      const g = await socialApi.createGroup({ name: name.trim(), description: description || null, emoji, color });
      toast.success("Группа создана!");
      onCreated(g);
    } catch {
      toast.error("Ошибка создания группы");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-card rounded-2xl w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Создать группу</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5 text-white/50" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Название *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Например: Английский 8Б"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Описание</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Краткое описание группы"
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Эмодзи</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={cn(
                    "w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all",
                    emoji === e ? "bg-indigo-500/40 ring-2 ring-indigo-500" : "bg-white/5 hover:bg-white/10"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Цвет</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ background: c }}
                  className={cn(
                    "w-8 h-8 rounded-full transition-all",
                    color === c ? "ring-2 ring-white ring-offset-2 ring-offset-transparent" : ""
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/70 text-sm hover:bg-white/10 transition-colors">
            Отмена
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 btn-gradient py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Создать
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function JoinGroupModal({
  onClose,
  onJoined,
  initialCode,
  initialGroupId,
}: {
  onClose: () => void;
  onJoined: (g: Group) => void;
  initialCode?: string;
  initialGroupId?: string;
}) {
  const [code, setCode] = useState(initialCode || "");
  const [groupId, setGroupId] = useState(initialGroupId || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialCode) setCode(initialCode.toUpperCase());
    if (initialGroupId) setGroupId(initialGroupId);
  }, [initialCode, initialGroupId]);

  const submit = async () => {
    if (!code.trim() || !groupId.trim()) { toast.error("Введите ID группы и код"); return; }
    setLoading(true);
    try {
      const { group } = await socialApi.joinGroup(groupId.trim(), code.trim().toUpperCase());
      toast.success("Вы вступили в группу!");
      onJoined(group);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Неверный код или ID группы");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-card rounded-2xl w-full max-w-sm p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Войти в группу</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5 text-white/50" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-white/60 text-xs mb-1.5 block">ID группы</label>
            <input
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              placeholder="Вставьте ID группы"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Код приглашения</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXXX"
              maxLength={6}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500 font-mono tracking-widest uppercase"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/70 text-sm hover:bg-white/10 transition-colors">
            Отмена
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 btn-gradient py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Вступить
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function GroupsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const inviteGroupId = searchParams.get("groupId") || searchParams.get("group") || "";
  const inviteCode = (searchParams.get("inviteCode") || searchParams.get("code") || "").toUpperCase();

  useEffect(() => {
    socialApi.getGroups()
      .then(setGroups)
      .catch(() => toast.error("Ошибка загрузки групп"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (inviteGroupId && inviteCode) {
      setShowJoin(true);
    }
  }, [inviteCode, inviteGroupId]);

  const handleCreated = (g: Group) => {
    setGroups(prev => [{ ...g, myRole: "owner" }, ...prev]);
    setShowCreate(false);
  };

  const handleJoined = (g: Group) => {
    setGroups(prev => {
      if (prev.find(x => x.id === g.id)) return prev;
      return [{ ...g, myRole: "student" }, ...prev];
    });
    setShowJoin(false);
  };

  return (
    <>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <div className="flex items-center gap-3 mb-1">
              <GraduationCap className="w-7 h-7 text-indigo-400" />
              <h1 className="text-2xl font-bold text-white">Группы</h1>
            </div>
            <p className="text-white/50 text-sm">Учитесь вместе с другими</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowJoin(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-sm transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Войти</span>
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl btn-gradient text-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Создать</span>
            </button>
          </div>
        </motion.div>

        {/* Groups grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <GraduationCap className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/50 mb-2">У вас нет групп</p>
            <p className="text-white/30 text-sm mb-6">Создайте группу или войдите по коду приглашения</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowJoin(true)} className="px-5 py-2.5 rounded-xl bg-white/10 text-white/70 text-sm hover:bg-white/15 transition-colors">
                Войти по коду
              </button>
              <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 rounded-xl btn-gradient text-white text-sm font-semibold">
                Создать группу
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {groups.map((g, i) => (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <GroupCard group={g} onClick={() => router.push(`/groups/${g.id}`)} />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
        {showJoin && (
          <JoinGroupModal
            onClose={() => setShowJoin(false)}
            onJoined={handleJoined}
            initialGroupId={inviteGroupId}
            initialCode={inviteCode}
          />
        )}
      </AnimatePresence>
    </>
  );
}
