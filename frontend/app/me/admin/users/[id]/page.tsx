"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Wallet,
  History,
  TrendingUp,
  CreditCard,
  User as UserIcon,
  ShieldAlert,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Globe,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { AdminUserStatsResponse } from "@/api/types";
import { Loader } from "@/components/ui/loader";
import { DomainStats } from "@/components/admin/domain-stats";
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(current >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatLimitValue(value: number | null, suffix: string, empty = "Без лимита") {
  return value == null ? empty : `${value} ${suffix}`;
}

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
  const [vpnLimitsForm, setVpnLimitsForm] = useState({
    vpnMaxDevices: "",
    vpnMaxConcurrentConnections: "",
    vpnSpeedLimitUpMbps: "",
    vpnSpeedLimitDownMbps: "",
  });
  const [isSavingVpnLimits, setIsSavingVpnLimits] = useState(false);
  const [sessionPage, setSessionPage] = useState(1);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const res = await fetchUserStats(id, startDate, endDate);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [endDate, fetchUserStats, id, startDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData({ silent: true });
    }, 15000);

    return () => window.clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (!data) return;
    setVpnLimitsForm({
      vpnMaxDevices:
        data.user.vpnPolicy.userOverrides.maxDevices?.toString() ?? "",
      vpnMaxConcurrentConnections:
        data.user.vpnPolicy.userOverrides.maxConcurrentConnections?.toString() ??
        "",
      vpnSpeedLimitUpMbps:
        data.user.vpnPolicy.userOverrides.speedLimitUpMbps?.toString() ?? "",
      vpnSpeedLimitDownMbps:
        data.user.vpnPolicy.userOverrides.speedLimitDownMbps?.toString() ?? "",
    });
  }, [data]);

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

  const currentSites = useMemo(() => {
    if (!data) return [];
    return (data.activeDomains ?? [])
      .slice()
      .sort((a, b) => {
        const left = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
        const right = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
        return right - left;
      })
      .slice(0, 12);
  }, [data]);

  const sessionPages = useMemo(() => {
    if (!data?.vpn.recentSessions?.length) return 1;
    return Math.max(1, Math.ceil(data.vpn.recentSessions.length / 10));
  }, [data]);

  const paginatedSessions = useMemo(() => {
    if (!data) return [];
    const current = Math.min(sessionPage, sessionPages);
    const start = (current - 1) * 10;
    return data.vpn.recentSessions.slice(start, start + 10);
  }, [data, sessionPage, sessionPages]);

  useEffect(() => {
    setSessionPage((current) => Math.min(current, sessionPages));
  }, [sessionPages]);

  const handleSaveVpnLimits = async () => {
    const parseValue = (raw: string) => {
      const value = raw.trim();
      if (!value) return null;
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Все лимиты должны быть положительными числами");
      }
      return parsed;
    };

    try {
      const payload = {
        vpnMaxDevices: parseValue(vpnLimitsForm.vpnMaxDevices),
        vpnMaxConcurrentConnections: parseValue(
          vpnLimitsForm.vpnMaxConcurrentConnections,
        ),
        vpnSpeedLimitUpMbps: parseValue(vpnLimitsForm.vpnSpeedLimitUpMbps),
        vpnSpeedLimitDownMbps: parseValue(vpnLimitsForm.vpnSpeedLimitDownMbps),
      };

      setIsSavingVpnLimits(true);

      const res = await apiClient.patch<{
        success: boolean;
        vpnPolicy: AdminUserStatsResponse["user"]["vpnPolicy"];
      }>(`/admin/users/${id}/vpn-limits`, payload);

      setData((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                vpnPolicy: res.vpnPolicy,
              },
            }
          : prev,
      );
      toast.success("VPN-лимиты сохранены");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не удалось сохранить лимиты";
      toast.error(message);
    } finally {
      setIsSavingVpnLimits(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader size={40} />
      </div>
    );
  }

  if (!data) return null;

  const totalVpnBytes =
    data.vpn.totals.totalBytesUp + data.vpn.totals.totalBytesDown;

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
        <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
          <Activity className="w-6 h-6 text-primary" />
          VPN телеметрия
        </h2>

        <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
          <div className="bg-card border border-border/60 rounded-[2rem] p-8 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  Сайты сейчас
                </h3>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                  Активность за последние 2 минуты
                </p>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Auto refresh every 15s
              </div>
              <Badge variant="outline" className="rounded-full">
                {currentSites.length} active
              </Badge>
            </div>

            {currentSites.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-border/70 px-5 py-8 text-sm italic text-muted-foreground">
                Сейчас нет доменов с новой VPN-активностью.
              </div>
            ) : (
              <div className="space-y-3">
                {currentSites.map((site) => (
                  <div
                    key={`${site.domain}:${site.lastVisitAt ?? "none"}`}
                    className="rounded-[1.5rem] border border-border/50 px-5 py-4 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-black truncate">{site.domain}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {site.lastVisitAt
                          ? new Date(site.lastVisitAt).toLocaleTimeString("ru-RU")
                          : "no timestamp"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black tabular-nums">
                        {site.visitCount}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(site.bytesTransferred)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border/60 rounded-[2rem] p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black tracking-tight">
                  VPN-лимиты пользователя
                </h3>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                  Пустое значение = взять из тарифа
                </p>
              </div>
              <Badge variant="outline" className="rounded-full">
                {data.user.plan ?? "no-plan"}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full">
                {data.vpn.totals.activeConnections} conn now
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {data.vpn.totals.activeDeviceCount} devices now
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {data.user.deviceCount} registered
              </Badge>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                  По тарифу
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="rounded-full">
                    {data.user.vpnPolicy.planDefaults.maxDevices} devices
                  </Badge>
                  <Badge variant="secondary" className="rounded-full">
                    {data.user.vpnPolicy.planDefaults.maxConcurrentConnections} conn
                  </Badge>
                  <Badge variant="secondary" className="rounded-full">
                    {formatLimitValue(
                      data.user.vpnPolicy.planDefaults.speedLimitUpMbps,
                      "Mbps up",
                    )}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full">
                    {formatLimitValue(
                      data.user.vpnPolicy.planDefaults.speedLimitDownMbps,
                      "Mbps down",
                    )}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                  Итого действует
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full">
                    {data.user.vpnPolicy.effective.maxDevices} devices
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    {data.user.vpnPolicy.effective.maxConcurrentConnections} conn
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    {formatLimitValue(
                      data.user.vpnPolicy.effective.speedLimitUpMbps,
                      "Mbps up",
                    )}
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    {formatLimitValue(
                      data.user.vpnPolicy.effective.speedLimitDownMbps,
                      "Mbps down",
                    )}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Override: max devices</Label>
                <Input
                  type="number"
                  min={1}
                  value={vpnLimitsForm.vpnMaxDevices}
                  onChange={(e) =>
                    setVpnLimitsForm((prev) => ({
                      ...prev,
                      vpnMaxDevices: e.target.value,
                    }))
                  }
                  placeholder="Из тарифа"
                />
              </div>
              <div className="space-y-2">
                <Label>Override: max concurrent</Label>
                <Input
                  type="number"
                  min={1}
                  value={vpnLimitsForm.vpnMaxConcurrentConnections}
                  onChange={(e) =>
                    setVpnLimitsForm((prev) => ({
                      ...prev,
                      vpnMaxConcurrentConnections: e.target.value,
                    }))
                  }
                  placeholder="Из тарифа"
                />
              </div>
              <div className="space-y-2">
                <Label>Override: upload Mbps</Label>
                <Input
                  type="number"
                  min={1}
                  value={vpnLimitsForm.vpnSpeedLimitUpMbps}
                  onChange={(e) =>
                    setVpnLimitsForm((prev) => ({
                      ...prev,
                      vpnSpeedLimitUpMbps: e.target.value,
                    }))
                  }
                  placeholder="Из тарифа"
                />
              </div>
              <div className="space-y-2">
                <Label>Override: download Mbps</Label>
                <Input
                  type="number"
                  min={1}
                  value={vpnLimitsForm.vpnSpeedLimitDownMbps}
                  onChange={(e) =>
                    setVpnLimitsForm((prev) => ({
                      ...prev,
                      vpnSpeedLimitDownMbps: e.target.value,
                    }))
                  }
                  placeholder="Из тарифа"
                />
              </div>
            </div>

            <Button
              onClick={handleSaveVpnLimits}
              disabled={isSavingVpnLimits}
              className="w-full sm:w-auto"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSavingVpnLimits ? "Сохранение..." : "Сохранить лимиты"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card border border-border/60 rounded-[2rem] p-8 space-y-3">
            <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">
              Активные соединения
            </p>
            <h3 className="text-4xl font-black tabular-nums">
              {data.vpn.totals.activeConnections}
            </h3>
            <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider">
              {data.vpn.totals.totalSessionCount} сессий всего
            </p>
          </div>

          <div className="bg-card border border-border/60 rounded-[2rem] p-8 space-y-3">
            <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">
              Трафик VPN
            </p>
            <h3 className="text-4xl font-black tabular-nums">
              {formatBytes(totalVpnBytes)}
            </h3>
            <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
              <span className="flex items-center gap-1 text-emerald-500">
                <ArrowUpRight className="w-3.5 h-3.5" />
                {formatBytes(data.vpn.totals.totalBytesUp)}
              </span>
              <span className="flex items-center gap-1 text-sky-500">
                <ArrowDownRight className="w-3.5 h-3.5" />
                {formatBytes(data.vpn.totals.totalBytesDown)}
              </span>
            </div>
          </div>

          <div className="bg-card border border-border/60 rounded-[2rem] p-8 space-y-3">
            <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">
              Протоколы
            </p>
            <h3 className="text-4xl font-black tabular-nums">
              {data.vpn.totals.protocolCount}
            </h3>
            <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider">
              Hysteria / VLESS и дальше
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-8">
          <div className="bg-card border border-border/60 rounded-[2.5rem] p-8 space-y-6">
            <div>
              <h3 className="text-lg font-black tracking-tight">
                Распределение по протоколам
              </h3>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                Доля от общего VPN-трафика
              </p>
            </div>

            {data.vpn.protocols.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-border/70 px-6 py-10 text-center text-sm italic text-muted-foreground">
                VPN-статистика пока нет
              </div>
            ) : (
              <div className="space-y-4">
                {data.vpn.protocols.map((protocol) => {
                  const share =
                    totalVpnBytes > 0
                      ? Math.round((protocol.totalBytes / totalVpnBytes) * 100)
                      : 0;

                  return (
                    <div
                      key={protocol.id}
                      className="rounded-[2rem] border border-border/50 px-6 py-5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-base font-black uppercase tracking-wide">
                            {protocol.protocol}
                          </p>
                          <p className="text-xs font-bold text-muted-foreground/70 uppercase tracking-widest mt-1">
                            {protocol.activeConnections} active • {protocol.sessionCount} sessions
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black tabular-nums">
                            {share}%
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                            share
                          </p>
                        </div>
                      </div>

                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(share, share > 0 ? 6 : 0)}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
                        <span className="flex items-center gap-1 text-emerald-500">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {formatBytes(protocol.totalBytesUp)}
                        </span>
                        <span className="flex items-center gap-1 text-sky-500">
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          {formatBytes(protocol.totalBytesDown)}
                        </span>
                        <span>{formatBytes(protocol.totalBytes)} total</span>
                        {protocol.lastSeenAt && (
                          <span>
                            last{" "}
                            {new Date(protocol.lastSeenAt).toLocaleDateString(
                              "ru-RU",
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-card border border-border/60 rounded-[2.5rem] p-8 space-y-6">
            <div>
              <h3 className="text-lg font-black tracking-tight">
                Последние VPN-сессии
              </h3>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                Hysteria live sessions + persisted history
              </p>
            </div>

            {data.vpn.recentSessions.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-border/70 px-6 py-10 text-center text-sm italic text-muted-foreground">
                За выбранный период VPN-сессий нет
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-[2rem] border border-border/50 px-5 py-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black uppercase tracking-wide">
                          {session.protocol}
                        </p>
                        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-1">
                          {session.deviceName ?? "Unknown device"}
                          {session.deviceOs ? ` • ${session.deviceOs}` : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                          session.status === "active"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {session.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
                      <span>{formatBytes(session.bytesUp + session.bytesDown)}</span>
                      <span className="text-emerald-500">
                        up {formatBytes(session.bytesUp)}
                      </span>
                      <span className="text-sky-500">
                        down {formatBytes(session.bytesDown)}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {session.connectedAt
                        ? new Date(session.connectedAt).toLocaleString("ru-RU")
                        : "No connectedAt"}
                    </p>
                  </div>
                ))}

                {sessionPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-muted-foreground">
                      Page {Math.min(sessionPage, sessionPages)} / {sessionPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSessionPage((value) => Math.max(1, value - 1))
                        }
                        disabled={sessionPage <= 1}
                      >
                        Prev
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSessionPage((value) =>
                            Math.min(sessionPages, value + 1),
                          )
                        }
                        disabled={sessionPage >= sessionPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Domain statistics ─────────────────────────────────────── */}
        <DomainStats domains={data.domainStats ?? []} />
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
