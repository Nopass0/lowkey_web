"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, CreditCard, BookOpen, Activity, Shield, TrendingUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { adminApi } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "plans" | "broadcast">("overview");
  const [search, setSearch] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user && user.role !== "admin") { router.push("/dashboard"); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    const [s, u, p] = await Promise.all([
      adminApi.getStats(), adminApi.getUsers({ limit: 50 }), adminApi.getPlans(),
    ]).catch(() => [null, [], []]);
    setStats(s); setUsers(u); setPlans(p);
  };

  const handleGivePremium = async (userId: string, days: number) => {
    const until = new Date(Date.now() + days * 86400000).toISOString();
    await adminApi.updateUser(userId, { isPremium: true, premiumUntil: until });
    toast.success(`Premium выдан на ${days} дней`);
    loadData();
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setSending(true);
    try {
      const { sent } = await adminApi.broadcast({ message: broadcastMsg, premiumOnly });
      toast.success(`Отправлено ${sent} пользователям`);
      setBroadcastMsg("");
    } catch { toast.error("Ошибка отправки"); }
    finally { setSending(false); }
  };

  const filteredUsers = users.filter((u) =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (!user || user.role !== "admin") return null;

  const statCards = stats ? [
    { label: "Всего пользователей", value: stats.totalUsers, icon: Users, color: "text-blue-400" },
    { label: "Premium", value: stats.premiumUsers, icon: Shield, color: "text-amber-400" },
    { label: "Карточек создано", value: stats.totalCards, icon: BookOpen, color: "text-purple-400" },
    { label: "Активны сегодня", value: stats.activeToday, icon: Activity, color: "text-green-400" },
    { label: "Платежей", value: stats.totalPayments, icon: CreditCard, color: "text-red-400" },
    { label: "Выручка", value: `${(stats.totalRevenue || 0).toLocaleString("ru")} ₽`, icon: TrendingUp, color: "text-emerald-400" },
  ] : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield size={24} className="text-purple-400" />
        <h1 className="text-2xl font-bold">Панель администратора</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: "overview", label: "Обзор" },
          { id: "users", label: `Пользователи (${users.length})` },
          { id: "plans", label: "Планы" },
          { id: "broadcast", label: "Рассылка" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.id ? "bg-gradient-to-r from-red-500 to-blue-500 text-white" : "bg-accent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {statCards.map((s) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-2xl p-5 flex items-center gap-4">
              <div className={`p-3 rounded-xl bg-current/10 ${s.color}`}>
                <s.icon size={22} className={s.color} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Users */}
      {tab === "users" && (
        <div className="space-y-4">
          <Input placeholder="Поиск по имени или email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="space-y-2">
            {filteredUsers.map((u) => (
              <div key={u.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-400 to-blue-400 flex items-center justify-center text-white font-bold flex-shrink-0">
                  {u.name?.charAt(0) || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-sm text-muted-foreground truncate">{u.email}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>⭐ {u.xp || 0} XP</span>
                    <span>🔥 {u.studyStreak || 0} дней</span>
                    <span>Зарег. {formatDate(u.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {u.isPremium ? (
                    <Badge variant="premium">PRO</Badge>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => handleGivePremium(u.id, 30)} className="text-xs">
                      + 30 дней PRO
                    </Button>
                  )}
                  {u.role === "admin" && <Badge variant="secondary">Admin</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plans */}
      {tab === "plans" && (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="glass-card rounded-xl p-5 flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">{plan.name}</span>
                  <Badge variant={plan.isActive ? "default" : "secondary"}>{plan.isActive ? "Активен" : "Отключён"}</Badge>
                </div>
                <div className="text-2xl font-bold gradient-text">{plan.price.toLocaleString("ru")} ₽</div>
                <div className="text-sm text-muted-foreground">{plan.intervalDays} дней</div>
                <div className="flex gap-2 flex-wrap mt-2">
                  {plan.features?.map((f: string) => <Badge key={f} variant="outline" className="text-xs">{f}</Badge>)}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={async () => {
                await adminApi.updatePlan(plan.id, { isActive: !plan.isActive });
                loadData();
                toast.success("Обновлено");
              }}>
                {plan.isActive ? "Отключить" : "Включить"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Broadcast */}
      {tab === "broadcast" && (
        <div className="glass-card rounded-2xl p-6 space-y-4 max-w-lg">
          <h3 className="font-semibold flex items-center gap-2"><Send size={18} />Telegram рассылка</h3>
          <textarea
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
            placeholder="Сообщение (поддерживается Markdown *жирный* _курсив_)..."
            rows={5}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="premiumOnly" checked={premiumOnly} onChange={(e) => setPremiumOnly(e.target.checked)} />
            <label htmlFor="premiumOnly" className="text-sm">Только Premium пользователям</label>
          </div>
          <Button variant="gradient" onClick={handleBroadcast} disabled={sending || !broadcastMsg.trim()} className="w-full gap-2">
            <Send size={16} />
            {sending ? "Отправка..." : "Отправить рассылку"}
          </Button>
        </div>
      )}
    </div>
  );
}
