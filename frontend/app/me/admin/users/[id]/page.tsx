"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Wallet,
  History,
  Calendar,
  TrendingUp,
  CreditCard,
  User as UserIcon,
  ShieldAlert,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { AdminUserStatsResponse } from "@/api/types";
import { Loader } from "@/components/ui/loader";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Input } from "@/components/ui/input";

export default function AdminUserDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { fetchUserStats } = useAdminUsers();

  const [data, setData] = useState<AdminUserStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const loadData = async () => {
    try {
      const res = await fetchUserStats(id, startDate, endDate);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id, startDate, endDate]);

  const stats = useMemo(() => {
    if (!data) return null;
    return {
      totalReferrals: data.dailyStats.reduce(
        (acc, curr) => acc + curr.referrals,
        0,
      ),
      totalReferralEarnings: data.dailyStats.reduce(
        (acc, curr) => acc + curr.referralEarnings,
        0,
      ),
      totalTopups: data.dailyStats.reduce((acc, curr) => acc + curr.topups, 0),
    };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader size={40} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="rounded-xl h-10 w-10 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <UserIcon className="w-8 h-8 text-primary" />
            Профиль: {data.user.login}
          </h1>
          <p className="text-muted-foreground font-medium text-sm">
            ID: {data.user.id} · В системе с{" "}
            {new Date(data.user.joinedAt).toLocaleDateString("ru-RU")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border/60 rounded-[2rem] p-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="p-3 rounded-2xl bg-primary/10 text-primary">
              <Wallet className="w-6 h-6" />
            </div>
            {data.user.isBanned && (
              <span className="bg-destructive/10 text-destructive text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                ЗАБЛОКИРОВАН
              </span>
            )}
          </div>
          <div>
            <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">
              Баланс
            </p>
            <h2 className="text-4xl font-black mt-1 tabular-nums">
              {data.user.balance} ₽
            </h2>
          </div>
          <div className="pt-4 border-t border-border/40">
            <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
              <span>Реферальный</span>
              <span className="text-violet-500">
                {data.user.referralBalance} ₽
              </span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border/60 rounded-[2rem] p-8 space-y-4">
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 w-fit">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">
              Подписка
            </p>
            <h2 className="text-2xl font-black mt-1">
              {data.user.plan ? (
                <span className="text-primary">{data.user.plan}</span>
              ) : (
                <span className="text-muted-foreground/50 italic font-medium">
                  Нет подписки
                </span>
              )}
            </h2>
          </div>
          {data.user.activeUntil && (
            <div className="pt-4 border-t border-border/40">
              <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider">
                Действует до{" "}
                {new Date(data.user.activeUntil).toLocaleDateString("ru-RU")}
              </p>
            </div>
          )}
        </div>

        <div className="bg-card border border-border/60 rounded-[2rem] p-8 space-y-4">
          <div className="p-3 rounded-2xl bg-violet-500/10 text-violet-500 w-fit">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">
              Рефералы
            </p>
            <h2 className="text-4xl font-black mt-1 tabular-nums">
              {data.user.referralCount}
            </h2>
          </div>
          <div className="pt-4 border-t border-border/40">
            <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider">
              {data.user.deviceCount} активных устройств
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-primary" />
            Динамика активности
          </h2>
          <div className="flex items-center gap-3 bg-muted/30 p-1 rounded-2xl border border-border/50">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-36 border-none bg-transparent font-bold text-xs cursor-pointer shadow-none focus-visible:ring-0"
            />
            <span className="text-muted-foreground/50 text-xs font-black select-none">
              По
            </span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 w-36 border-none bg-transparent font-bold text-xs cursor-pointer shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-card border border-border/60 rounded-[2.5rem] p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-lg font-black tracking-tight">
                  Реферальный заработок
                </h3>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                  Итого: {stats?.totalReferralEarnings} ₽
                </p>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailyStats}>
                  <defs>
                    <linearGradient id="colorRef" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-background border border-border/80 p-3 rounded-2xl shadow-2xl">
                            <p className="text-[10px] font-black uppercase text-muted-foreground/60 mb-1">
                              {label}
                            </p>
                            <p className="text-sm font-black text-violet-500">
                              {payload[0].value} ₽
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <XAxis dataKey="date" hide />
                  <Area
                    type="monotone"
                    dataKey="referralEarnings"
                    stroke="#8b5cf6"
                    strokeWidth={4}
                    fillOpacity={1}
                    fill="url(#colorRef)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card border border-border/60 rounded-[2.5rem] p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-lg font-black tracking-tight">
                  Пополнения баланса
                </h3>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                  Итого: {stats?.totalTopups} ₽
                </p>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailyStats}>
                  <defs>
                    <linearGradient id="colorTopup" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-background border border-border/80 p-3 rounded-2xl shadow-2xl">
                            <p className="text-[10px] font-black uppercase text-muted-foreground/60 mb-1">
                              {label}
                            </p>
                            <p className="text-sm font-black text-blue-500">
                              {payload[0].value} ₽
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <XAxis dataKey="date" hide />
                  <Area
                    type="monotone"
                    dataKey="topups"
                    stroke="#3b82f6"
                    strokeWidth={4}
                    fillOpacity={1}
                    fill="url(#colorTopup)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
          <History className="w-6 h-6 text-primary" />
          История транзакций
        </h2>

        <div className="bg-card border border-border/60 rounded-[2.5rem] overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-8 py-5 bg-muted/30 border-b border-border/50 text-xs font-black text-muted-foreground uppercase tracking-widest">
            <div>Операция</div>
            <div className="text-right">Дата</div>
            <div className="text-right w-24">Сумма</div>
          </div>
          <div className="divide-y divide-border/40">
            {data.transactions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground italic text-sm">
                Нет транзакций за этот период
              </div>
            ) : (
              data.transactions.map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-4 px-8 py-5 items-center hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-xl shrink-0 ${
                        t.type === "topup" || t.type === "referral_earning"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {t.type === "topup" && <CreditCard className="w-4 h-4" />}
                      {t.type === "referral_earning" && (
                        <Users className="w-4 h-4" />
                      )}
                      {t.type === "subscription" && (
                        <ShieldAlert className="w-4 h-4" />
                      )}
                      {t.type === "withdrawal" && (
                        <Wallet className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{t.title}</p>
                      <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">
                        {t.type}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div
                    className={`text-right w-24 font-black ${
                      t.type === "topup" || t.type === "referral_earning"
                        ? "text-emerald-500"
                        : "text-foreground"
                    }`}
                  >
                    {t.type === "topup" || t.type === "referral_earning"
                      ? "+"
                      : "-"}
                    {t.amount} ₽
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
