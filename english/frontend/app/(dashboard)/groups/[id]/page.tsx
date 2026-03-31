"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Users, BarChart2, Plus, Copy, RefreshCw,
  UserMinus, ChevronRight, Loader2, Crown, GraduationCap,
  Lock, ArrowLeft, Check, Sparkles, Link2
} from "lucide-react";
import { socialApi } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";

type Member = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  level: string;
  role: string;
  joinedAt: string;
};

type Course = {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  color: string;
  level: string;
  blockCount: number;
  isPublished: boolean;
};

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  color: string;
  memberCount: number;
  courseCount: number;
  isPublic: boolean;
  inviteCode: string;
  ownerId: string;
  isMember: boolean;
  myRole: string | null;
  members: Member[];
};

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Начинающий",
  intermediate: "Средний",
  advanced: "Продвинутый",
};

const ROLE_LABELS: Record<string, string> = { owner: "Владелец", teacher: "Учитель", student: "Ученик" };
const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="w-3.5 h-3.5 text-yellow-400" />,
  teacher: <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />,
  student: <BookOpen className="w-3.5 h-3.5 text-emerald-400" />,
};

function Avatar({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover" />;
  return (
    <div style={{ width: size, height: size }} className="rounded-full bg-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-sm">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function GroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const groupId = params.id as string;

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"courses" | "members" | "progress">("courses");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);

  // Progress state
  const [progressData, setProgressData] = useState<any>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      socialApi.getGroup(groupId),
      socialApi.getCourses(groupId),
    ]).then(([g, c]) => {
      setGroup(g);
      setCourses(c);
    }).catch(() => toast.error("Ошибка загрузки группы"))
      .finally(() => setLoading(false));
  }, [groupId]);

  const isTeacher = group?.myRole === "owner" || group?.myRole === "teacher";
  const isOwner = group?.myRole === "owner";

  const copyInvite = () => {
    if (!group) return;
    navigator.clipboard.writeText(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Код скопирован!");
  };

  const copyInviteLink = async () => {
    if (!group || typeof window === "undefined") return;
    const inviteUrl = `${window.location.origin}/groups?groupId=${encodeURIComponent(group.id)}&inviteCode=${encodeURIComponent(group.inviteCode)}`;
    await navigator.clipboard.writeText(inviteUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
    toast.success("Invite link copied");
  };

  const regenInvite = async () => {
    if (!group) return;
    setRegenLoading(true);
    try {
      const { inviteCode } = await socialApi.regenerateInvite(groupId);
      setGroup(g => g ? { ...g, inviteCode } : g);
      toast.success("Код обновлён");
    } catch { toast.error("Ошибка"); }
    finally { setRegenLoading(false); }
  };

  const removeMember = async (userId: string) => {
    try {
      await socialApi.removeMember(groupId, userId);
      setGroup(g => g ? { ...g, members: g.members.filter(m => m.userId !== userId), memberCount: Math.max(0, g.memberCount - 1) } : g);
      toast.success("Участник удалён");
    } catch { toast.error("Ошибка"); }
  };

  const loadProgress = async () => {
    if (progressData) return;
    setProgressLoading(true);
    try {
      const data = await socialApi.getGroupProgress(groupId);
      setProgressData(data);
    } catch { toast.error("Ошибка загрузки прогресса"); }
    finally { setProgressLoading(false); }
  };

  const handleTabChange = (t: "courses" | "members" | "progress") => {
    setTab(t);
    if (t === "progress" && !progressData) loadProgress();
  };

  const createCourse = async () => {
    const title = window.prompt("Course title");
    if (!title?.trim()) return;

    setCreatingCourse(true);
    try {
      const course = await socialApi.createCourse(groupId, {
        title: title.trim(),
        emoji: "📖",
        color: group?.color || "#6366f1",
        level: "beginner",
      });
      setCourses(prev => [...prev, course]);
      setGroup(current => current ? { ...current, courseCount: current.courseCount + 1 } : current);
      router.push(`/groups/${groupId}/courses/${course.id}/edit`);
    } catch {
      toast.error("РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РєСѓСЂСЃР°");
    } finally {
      setCreatingCourse(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-60">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!group) return <div className="text-center text-white/50 py-20">Группа не найдена</div>;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back + Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Назад
        </button>

        <div
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${group.color}55, ${group.color}22)` }}
        >
          <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(circle at 90% 50%, ${group.color}, transparent 60%)` }} />
          <div className="relative flex items-center gap-4">
            <span className="text-4xl">{group.emoji}</span>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white">{group.name}</h1>
              {group.description && <p className="text-white/60 text-sm mt-0.5 line-clamp-2">{group.description}</p>}
              <div className="flex items-center gap-3 mt-2 text-white/50 text-xs">
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{group.memberCount} участников</span>
                <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{group.courseCount} курсов</span>
                {group.myRole && (
                  <span className="flex items-center gap-1">{ROLE_ICONS[group.myRole]} {ROLE_LABELS[group.myRole]}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Invite code (teachers) */}
      {isTeacher && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-2xl p-4 mb-5 flex items-center gap-3">
          <Lock className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white/50 text-xs mb-0.5">Код приглашения</p>
            <p className="text-white font-mono font-bold text-lg tracking-widest">{group.inviteCode}</p>
            <p className="text-white/30 text-xs">ID группы: {group.id}</p>
          </div>
          <button onClick={copyInvite} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/60" />}
          </button>
          <button onClick={copyInviteLink} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            {linkCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Link2 className="w-4 h-4 text-white/60" />}
          </button>
          {isOwner && (
            <button onClick={regenInvite} disabled={regenLoading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <RefreshCw className={cn("w-4 h-4 text-white/60", regenLoading && "animate-spin")} />
            </button>
          )}
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { key: "courses", label: "Курсы", icon: BookOpen },
          { key: "members", label: "Участники", icon: Users },
          ...(isTeacher ? [{ key: "progress", label: "Прогресс", icon: BarChart2 }] : []),
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
              tab === key ? "bg-indigo-500 text-white" : "glass-card text-white/60 hover:text-white"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === "courses" && (
          <motion.div key="courses" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {isTeacher && (
              <div className="flex justify-end mb-4">
                <button
                  onClick={createCourse}
                  disabled={creatingCourse}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl btn-gradient text-white text-sm font-semibold disabled:opacity-50"
                >
                  {creatingCourse ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Новый курс
                </button>
              </div>
            )}

            {courses.length === 0 ? (
              <div className="text-center py-16 text-white/40">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>Курсов пока нет</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {courses.map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link href={`/groups/${groupId}/courses/${c.id}`}>
                      <div className="glass-card rounded-2xl overflow-hidden hover:bg-white/5 transition-colors cursor-pointer group">
                        <div
                          className="h-14 flex items-center px-5"
                          style={{ background: `linear-gradient(135deg, ${c.color}66, ${c.color}22)` }}
                        >
                          <span className="text-2xl">{c.emoji}</span>
                          {!c.isPublished && (
                            <span className="ml-auto text-xs bg-white/10 text-white/40 px-2 py-0.5 rounded-full">Черновик</span>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="flex items-start justify-between">
                            <h3 className="font-semibold text-white text-sm">{c.title}</h3>
                            <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                          </div>
                          {c.description && <p className="text-white/40 text-xs mt-1 line-clamp-1">{c.description}</p>}
                          <div className="flex items-center gap-3 mt-3 text-white/40 text-xs">
                            <span>{LEVEL_LABELS[c.level] || c.level}</span>
                            <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{c.blockCount} блоков</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                    {isTeacher && (
                      <Link href={`/groups/${groupId}/courses/${c.id}/edit`} className="block text-center text-xs text-white/30 hover:text-white/60 mt-1 transition-colors">
                        Редактировать
                      </Link>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {tab === "members" && (
          <motion.div key="members" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass-card rounded-2xl overflow-hidden">
            {group.members.map((m, i) => (
              <div
                key={m.id}
                className="flex items-center gap-3 px-5 py-3.5 border-b border-white/5 last:border-0"
              >
                <Avatar url={m.avatarUrl} name={m.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{m.name}</p>
                  <p className="text-white/40 text-xs">{LEVEL_LABELS[m.level] || m.level}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-white/50">
                    {ROLE_ICONS[m.role]}
                    {ROLE_LABELS[m.role] || m.role}
                  </span>
                  {isOwner && m.userId !== user?.id && (
                    <button
                      onClick={() => removeMember(m.userId)}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {tab === "progress" && isTeacher && (
          <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {progressLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
            ) : progressData ? (
              <div className="glass-card rounded-2xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-3 text-left text-white/50 font-medium">Ученик</th>
                      {progressData.courses?.map((c: any) => (
                        <th key={c.id} className="px-4 py-3 text-center text-white/50 font-medium min-w-[100px]">
                          {c.emoji || "📖"} {c.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {progressData.members?.filter((m: any) => m.role === "student").map((m: any) => (
                      <tr key={m.userId} className="border-b border-white/5 last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar url={m.avatarUrl} name={m.name} size={28} />
                            <span className="text-white text-sm">{m.name}</span>
                          </div>
                        </td>
                        {m.courseProgress?.map((cp: any) => (
                          <td key={cp.courseId} className="px-4 py-3 text-center">
                            <span className={cn(
                              "text-xs px-2 py-1 rounded-full font-semibold",
                              cp.percentComplete === 100 ? "bg-emerald-500/20 text-emerald-400" :
                                cp.percentComplete > 0 ? "bg-indigo-500/20 text-indigo-400" :
                                  "bg-white/5 text-white/30"
                            )}>
                              {cp.percentComplete}%
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-white/40">Нет данных</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
