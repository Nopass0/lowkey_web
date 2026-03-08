"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownToLine,
  BarChart2,
  Calculator,
  CreditCard,
  Loader2,
  PiggyBank,
  RefreshCw,
  Settings2,
  TrendingUp,
  Wallet,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useAdminFinance } from "@/hooks/useAdminFinance";

type Period = "7d" | "30d" | "3m" | "year" | "all";

const periodOptions: { value: Period; label: string; days?: number }[] = [
  { value: "7d", label: "7 дней", days: 7 },
  { value: "30d", label: "30 дней", days: 30 },
  { value: "3m", label: "3 месяца", days: 90 },
  { value: "year", label: "Год", days: 365 },
  { value: "all", label: "Все время" },
];

const financeChartConfig = {
  topups: { label: "Пополнения", color: "#0f766e" },
  financeWithdrawals: { label: "Выводы", color: "#dc2626" },
  netProfit: { label: "Чистая прибыль", color: "#2563eb" },
};

const usersChartConfig = {
  newUsers: { label: "Новые пользователи", color: "#16a34a" },
  totalUsers: { label: "Всего пользователей", color: "#7c3aed" },
};

function formatCurrency(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU");
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function getPresetRange(period: Period) {
  const end = new Date();
  const option = periodOptions.find((item) => item.value === period);

  if (!option?.days) {
    return {
      startDate: "2024-01-01",
      endDate: end.toISOString().slice(0, 10),
    };
  }

  const start = new Date(end);
  start.setDate(start.getDate() - (option.days - 1));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function formatAxisDate(date: string, groupBy?: "day" | "month") {
  if (groupBy === "month") {
    const [year, month] = date.split("-");
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
      "ru-RU",
      { month: "short", year: "2-digit" },
    );
  }

  return new Date(date).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
  });
}

function StatCard({
  icon: Icon,
  title,
  value,
  hint,
  colorClass,
  bgClass,
}: {
  icon: typeof Wallet;
  title: string;
  value: string;
  hint: string;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5">
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${bgClass}`}>
        <Icon className={`h-5 w-5 ${colorClass}`} />
      </div>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <div className={`mt-2 text-3xl font-black tracking-tight ${colorClass}`}>
        {value}
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{hint}</div>
    </div>
  );
}

export default function AdminFinancePage() {
  const initialRange = getPresetRange("30d");
  const [period, setPeriod] = useState<Period>("30d");
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [taxRateInput, setTaxRateInput] = useState("");
  const [acquiringRateInput, setAcquiringRateInput] = useState("");
  const [withdrawalTitle, setWithdrawalTitle] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalDate, setWithdrawalDate] = useState(getTodayInputValue());
  const [withdrawalNote, setWithdrawalNote] = useState("");

  const {
    stats,
    balance,
    settings,
    withdrawals,
    isStatsLoading,
    isBalanceLoading,
    isSettingsLoading,
    isWithdrawalsLoading,
    isSavingSettings,
    isCreatingWithdrawal,
    fetchStats,
    fetchBalance,
    fetchSettings,
    updateSettings,
    fetchBusinessWithdrawals,
    createBusinessWithdrawal,
    deleteBusinessWithdrawal,
  } = useAdminFinance();

  const refreshAll = useCallback(
    async (
      nextPeriod = period,
      nextStartDate = startDate,
      nextEndDate = endDate,
    ) => {
      await Promise.all([
        fetchStats({
          period: nextPeriod,
          startDate: nextStartDate,
          endDate: nextEndDate,
        }),
        fetchBalance(),
        fetchSettings(),
        fetchBusinessWithdrawals(),
      ]);
    },
    [
      endDate,
      fetchBalance,
      fetchBusinessWithdrawals,
      fetchSettings,
      fetchStats,
      period,
      startDate,
    ],
  );

  useEffect(() => {
    const firstRange = getPresetRange("30d");
    void Promise.all([
      fetchStats({
        period: "30d",
        startDate: firstRange.startDate,
        endDate: firstRange.endDate,
      }),
      fetchBalance(),
      fetchSettings(),
      fetchBusinessWithdrawals(),
    ]);
  }, [fetchBalance, fetchBusinessWithdrawals, fetchSettings, fetchStats]);

  const chartData = useMemo(
    () =>
      (stats?.points ?? []).map((point) => ({
        ...point,
        label: formatAxisDate(point.date, stats?.range.groupBy),
      })),
    [stats],
  );

  const topProfitDays = useMemo(
    () =>
      [...(stats?.points ?? [])]
        .sort((a, b) => b.netProfit - a.netProfit)
        .slice(0, 5),
    [stats],
  );

  const handlePresetChange = async (value: Period) => {
    const nextRange = getPresetRange(value);
    setPeriod(value);
    setStartDate(nextRange.startDate);
    setEndDate(nextRange.endDate);
    await fetchStats({
      period: value,
      startDate: nextRange.startDate,
      endDate: nextRange.endDate,
    });
  };

  const handleApplyRange = async () => {
    if (!startDate || !endDate) {
      toast.error("Укажите диапазон дат");
      return;
    }

    if (startDate > endDate) {
      toast.error("Дата начала должна быть раньше даты окончания");
      return;
    }

    await fetchStats({ period, startDate, endDate });
  };

  const handleSaveSettings = async () => {
    const taxRate = Number(
      (taxRateInput || String(settings?.taxRate ?? 0)).replace(",", "."),
    );
    const acquiringFeeRate = Number(
      (acquiringRateInput || String(settings?.acquiringFeeRate ?? 0)).replace(
        ",",
        ".",
      ),
    );

    if (
      Number.isNaN(taxRate) ||
      Number.isNaN(acquiringFeeRate) ||
      taxRate < 0 ||
      acquiringFeeRate < 0
    ) {
      toast.error("Ставки должны быть неотрицательными числами");
      return;
    }

    try {
      await updateSettings({ taxRate, acquiringFeeRate });
      await Promise.all([
        fetchBalance(),
        fetchStats({ period, startDate, endDate }),
      ]);
      toast.success("Финансовые настройки обновлены");
    } catch {
      toast.error("Не удалось сохранить настройки");
    }
  };

  const handleCreateWithdrawal = async () => {
    const amount = Number(withdrawalAmount.replace(",", "."));

    if (!withdrawalTitle.trim()) {
      toast.error("Укажите назначение вывода");
      return;
    }

    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Сумма вывода должна быть больше нуля");
      return;
    }

    try {
      await createBusinessWithdrawal({
        title: withdrawalTitle.trim(),
        amount,
        withdrawalDate,
        note: withdrawalNote.trim() || undefined,
      });
      setWithdrawalTitle("");
      setWithdrawalAmount("");
      setWithdrawalNote("");
      setWithdrawalDate(getTodayInputValue());
      await Promise.all([
        fetchBalance(),
        fetchStats({ period, startDate, endDate }),
      ]);
      toast.success("Вывод средств добавлен");
    } catch {
      toast.error("Не удалось создать вывод");
    }
  };

  const handleDeleteWithdrawal = async (id: string) => {
    try {
      await deleteBusinessWithdrawal(id);
      await Promise.all([
        fetchBalance(),
        fetchStats({ period, startDate, endDate }),
      ]);
      toast.success("Вывод удален");
    } catch {
      toast.error("Не удалось удалить вывод");
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <section className="rounded-[2rem] border border-border/60 bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.16),_transparent_30%),linear-gradient(135deg,_rgba(255,255,255,0.92),_rgba(240,249,255,0.9))] p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <BarChart2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  Финансовая аналитика
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Доходы, выводы, налоги, комиссия эквайринга и рост
                  пользовательской базы в одном экране.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))]">
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-11 rounded-2xl border-border/60 bg-background/90"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-11 rounded-2xl border-border/60 bg-background/90"
            />
            <Button
              variant="outline"
              onClick={() => void handleApplyRange()}
              className="h-11 rounded-2xl border-border/60 bg-background/90"
            >
              Применить даты
            </Button>
            <Button
              variant="outline"
              onClick={() => void refreshAll()}
              className="h-11 rounded-2xl border-border/60 bg-background/90"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Обновить
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => void handlePresetChange(option.value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                period === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/80 text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {balance && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatCard
            icon={Wallet}
            title="Баланс клиентов"
            value={formatCurrency(balance.currentBalance)}
            hint="Суммарный остаток на пользовательских балансах"
            colorClass="text-slate-900"
            bgClass="bg-slate-100"
          />
          <StatCard
            icon={ArrowDownToLine}
            title="Выведено из бизнеса"
            value={formatCurrency(balance.totalBusinessWithdrawals)}
            hint="Все созданные выводы средств в аналитике"
            colorClass="text-rose-600"
            bgClass="bg-rose-100"
          />
          <StatCard
            icon={PiggyBank}
            title="Доступная прибыль"
            value={formatCurrency(balance.availableProfit)}
            hint="Уже с учетом налога, эквайринга, реферальных выплат и выводов"
            colorClass="text-emerald-600"
            bgClass="bg-emerald-100"
          />
          <StatCard
            icon={CreditCard}
            title="Комиссия эквайринга"
            value={formatCurrency(balance.acquiringFees)}
            hint={`${balance.acquiringFeeRate}% от пополнений`}
            colorClass="text-amber-600"
            bgClass="bg-amber-100"
          />
          <StatCard
            icon={Calculator}
            title="Налог"
            value={formatCurrency(balance.taxAmount)}
            hint={`${balance.taxRate}% от положительной прибыли до налога`}
            colorClass="text-blue-600"
            bgClass="bg-blue-100"
          />
          <StatCard
            icon={Users}
            title="Резерв и ожидание"
            value={formatCurrency(balance.refHoldReserve + balance.pendingWithdrawals)}
            hint="Реферальный резерв плюс заявки на реферальный вывод"
            colorClass="text-violet-600"
            bgClass="bg-violet-100"
          />
        </section>
      )}

      {(isBalanceLoading || isStatsLoading || isSettingsLoading) && !stats && !balance ? (
        <div className="flex h-40 items-center justify-center rounded-3xl border border-border/60 bg-card text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Загружаю аналитику
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="rounded-3xl border border-border/60 bg-card p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Деньги по периодам</h2>
              <p className="text-sm text-muted-foreground">
                Пополнения, выводы средств и чистая прибыль на одной шкале.
              </p>
            </div>
          </div>

          <ChartContainer
            config={financeChartConfig}
            className="h-[340px] w-full"
          >
            <ComposedChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={88}
                tickFormatter={(value) => `${Math.round(Number(value) / 1000)}к`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <>
                        <span className="text-muted-foreground">
                          {financeChartConfig[name as keyof typeof financeChartConfig]
                            ?.label ?? name}
                        </span>
                        <span className="font-mono font-semibold">
                          {formatCurrency(Number(value))}
                        </span>
                      </>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="topups"
                fill="var(--color-topups)"
                radius={[10, 10, 0, 0]}
                maxBarSize={34}
              />
              <Bar
                dataKey="financeWithdrawals"
                fill="var(--color-financeWithdrawals)"
                radius={[10, 10, 0, 0]}
                maxBarSize={26}
              />
              <Line
                type="monotone"
                dataKey="netProfit"
                stroke="var(--color-netProfit)"
                strokeWidth={3}
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold">Рост пользователей</h2>
            <p className="text-sm text-muted-foreground">
              Видно и ежедневный приток, и общий размер базы.
            </p>
          </div>

          <ChartContainer
            config={usersChartConfig}
            className="h-[340px] w-full"
          >
            <LineChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis tickLine={false} axisLine={false} width={64} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <>
                        <span className="text-muted-foreground">
                          {usersChartConfig[name as keyof typeof usersChartConfig]
                            ?.label ?? name}
                        </span>
                        <span className="font-mono font-semibold">
                          {formatNumber(Number(value))}
                        </span>
                      </>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                type="monotone"
                dataKey="newUsers"
                fill="var(--color-newUsers)"
                stroke="var(--color-newUsers)"
                fillOpacity={0.18}
              />
              <Line
                type="monotone"
                dataKey="totalUsers"
                stroke="var(--color-totalUsers)"
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </div>
      </section>

      {stats && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-border/60 bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Пополнения
            </div>
            <div className="mt-2 text-3xl font-black text-teal-700">
              {formatCurrency(stats.totals.topups)}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Валовый входящий денежный поток за диапазон
            </div>
          </div>
          <div className="rounded-3xl border border-border/60 bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Выводы и комиссии
            </div>
            <div className="mt-2 text-3xl font-black text-rose-600">
              {formatCurrency(
                stats.totals.financeWithdrawals + stats.totals.acquiringFee,
              )}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Выводы бизнеса и комиссия эквайринга
            </div>
          </div>
          <div className="rounded-3xl border border-border/60 bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Чистая прибыль
            </div>
            <div className="mt-2 text-3xl font-black text-emerald-600">
              {formatCurrency(stats.totals.netProfit)}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              После реферальных выплат, налогов, комиссии и выводов
            </div>
          </div>
          <div className="rounded-3xl border border-border/60 bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Пользователи
            </div>
            <div className="mt-2 text-3xl font-black text-violet-600">
              {formatNumber(stats.totals.totalUsers)}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              +{formatNumber(stats.totals.users)} новых за выбранный период
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-border/60 bg-card p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <Settings2 className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Финансовые настройки</h2>
              <p className="text-sm text-muted-foreground">
                Эти ставки сразу влияют на доступную прибыль и графики.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Налоговая ставка, %</label>
              <Input
                value={taxRateInput || String(settings?.taxRate ?? 0)}
                onChange={(event) => setTaxRateInput(event.target.value)}
                className="h-11 rounded-2xl"
                placeholder="Например 6"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Комиссия эквайринга, %</label>
              <Input
                value={
                  acquiringRateInput || String(settings?.acquiringFeeRate ?? 0)
                }
                onChange={(event) => setAcquiringRateInput(event.target.value)}
                className="h-11 rounded-2xl"
                placeholder="Например 2.5"
              />
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
            {settings ? (
              <span>
                Последнее обновление:{" "}
                {new Date(settings.updatedAt).toLocaleString("ru-RU")}
              </span>
            ) : (
              <span>Настройки еще не загружены</span>
            )}
          </div>

          <Button
            onClick={() => void handleSaveSettings()}
            disabled={isSavingSettings}
            className="mt-4 h-11 rounded-2xl"
          >
            {isSavingSettings ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Сохраняю
              </>
            ) : (
              "Сохранить настройки"
            )}
          </Button>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100">
              <ArrowDownToLine className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Создать вывод средств</h2>
              <p className="text-sm text-muted-foreground">
                Новый вывод сразу уменьшит доступную прибыль и отразится в
                аналитике.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Назначение</label>
              <Input
                value={withdrawalTitle}
                onChange={(event) => setWithdrawalTitle(event.target.value)}
                className="h-11 rounded-2xl"
                placeholder="Например: вывод собственнику"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Сумма, ₽</label>
              <Input
                value={withdrawalAmount}
                onChange={(event) => setWithdrawalAmount(event.target.value)}
                className="h-11 rounded-2xl"
                placeholder="15000"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Дата вывода</label>
              <Input
                type="date"
                value={withdrawalDate}
                onChange={(event) => setWithdrawalDate(event.target.value)}
                className="h-11 rounded-2xl"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Комментарий</label>
              <Textarea
                value={withdrawalNote}
                onChange={(event) => setWithdrawalNote(event.target.value)}
                className="min-h-24 rounded-2xl"
                placeholder="Необязательно"
              />
            </div>
          </div>

          <Button
            onClick={() => void handleCreateWithdrawal()}
            disabled={isCreatingWithdrawal}
            className="mt-4 h-11 rounded-2xl bg-rose-600 hover:bg-rose-600/90"
          >
            {isCreatingWithdrawal ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Создаю вывод
              </>
            ) : (
              "Добавить вывод"
            )}
          </Button>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-border/60 bg-card p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Топ дней по чистой прибыли</h2>
              <p className="text-sm text-muted-foreground">
                Самые сильные дни в выбранном диапазоне.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {topProfitDays.map((day) => (
              <div
                key={day.date}
                className="grid gap-3 rounded-2xl border border-border/50 bg-muted/20 p-4 md:grid-cols-[160px_1fr_1fr_1fr]"
              >
                <div className="font-semibold">
                  {new Date(day.date).toLocaleDateString("ru-RU")}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Пополнения
                  </div>
                  <div className="mt-1 font-bold text-teal-700">
                    {formatCurrency(day.topups)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Выводы
                  </div>
                  <div className="mt-1 font-bold text-rose-600">
                    {formatCurrency(day.financeWithdrawals)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Чистая прибыль
                  </div>
                  <div className="mt-1 font-bold text-emerald-600">
                    {formatCurrency(day.netProfit)}
                  </div>
                </div>
              </div>
            ))}

            {topProfitDays.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
                Для выбранного диапазона данных пока нет.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold">История выводов бизнеса</h2>
            <p className="text-sm text-muted-foreground">
              Последние созданные выводы средств.
            </p>
          </div>

          {isWithdrawalsLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Загружаю выводы
            </div>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border/50 bg-muted/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{item.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {new Date(item.withdrawalDate).toLocaleDateString("ru-RU")}
                        {item.createdBy ? ` • ${item.createdBy.login}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-rose-600">
                        {formatCurrency(item.amount)}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteWithdrawal(item.id)}
                        className="mt-1 h-8 rounded-xl px-2 text-xs text-muted-foreground hover:text-destructive"
                      >
                        Удалить
                      </Button>
                    </div>
                  </div>
                  {item.note ? (
                    <div className="mt-3 text-sm text-muted-foreground">
                      {item.note}
                    </div>
                  ) : null}
                </div>
              ))}

              {withdrawals.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  Выводов еще нет.
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
