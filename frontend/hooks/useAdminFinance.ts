"use client";

import { useCallback, useState } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type {
  FinanceBalance,
  FinanceBusinessWithdrawal,
  FinanceBusinessWithdrawalCreateRequest,
  FinanceDataPoint,
  FinanceSettings,
  FinanceSettingsUpdateRequest,
  FinanceStats,
} from "@/api/types";

function getMockDate(offset: number): string {
  const date = new Date("2026-03-07T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function genMockPoints(days: number): FinanceDataPoint[] {
  let totalUsers = 320;

  return Array.from({ length: days }, (_, index) => {
    const topups = Math.round(1800 + Math.random() * 2200);
    const subscriptions = Math.round(700 + Math.random() * 1100);
    const refPaid = Math.round(120 + Math.random() * 220);
    const financeWithdrawals =
      index % 9 === 0 ? Math.round(500 + Math.random() * 1800) : 0;
    const acquiringFee = Number((topups * 0.025).toFixed(2));
    const profitBeforeTax =
      topups - refPaid - financeWithdrawals - acquiringFee;
    const taxAmount = Number((Math.max(profitBeforeTax, 0) * 0.06).toFixed(2));
    const netProfit = Number((profitBeforeTax - taxAmount).toFixed(2));
    const newUsers = Math.round(2 + Math.random() * 6);
    totalUsers += newUsers;

    return {
      date: getMockDate(index - days + 1),
      topups,
      subscriptions,
      refPaid,
      financeWithdrawals,
      acquiringFee,
      taxAmount,
      netProfit,
      newUsers,
      totalUsers,
    };
  });
}

const MOCK_SETTINGS: FinanceSettings = {
  taxRate: 6,
  acquiringFeeRate: 2.5,
  updatedAt: "2026-03-07T12:00:00.000Z",
};

const MOCK_BALANCE: FinanceBalance = {
  currentBalance: 142_800,
  pendingWithdrawals: 1_350,
  refHoldReserve: 8_540,
  totalBusinessWithdrawals: 23_500,
  acquiringFees: 9_410,
  taxAmount: 5_932,
  profitBeforeTax: 98_870,
  availableProfit: 92_938,
  taxRate: 6,
  acquiringFeeRate: 2.5,
};

const MOCK_WITHDRAWALS: FinanceBusinessWithdrawal[] = [
  {
    id: "bw-1",
    title: "Вывод на операционные расходы",
    note: "Маркетинг и подрядчики",
    amount: 12_000,
    withdrawalDate: "2026-03-01T00:00:00.000Z",
    createdAt: "2026-03-01T10:00:00.000Z",
    createdBy: { id: "admin-1", login: "nopass" },
  },
  {
    id: "bw-2",
    title: "Перевод собственнику",
    note: null,
    amount: 11_500,
    withdrawalDate: "2026-02-20T00:00:00.000Z",
    createdAt: "2026-02-20T18:20:00.000Z",
    createdBy: { id: "admin-1", login: "nopass" },
  },
];

interface FinanceStatsParams {
  period?: string;
  startDate?: string;
  endDate?: string;
}

export function useAdminFinance() {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [balance, setBalance] = useState<FinanceBalance | null>(null);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [withdrawals, setWithdrawals] = useState<FinanceBusinessWithdrawal[]>(
    [],
  );
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [isWithdrawalsLoading, setIsWithdrawalsLoading] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isCreatingWithdrawal, setIsCreatingWithdrawal] = useState(false);

  const fetchStats = useCallback(async (params: FinanceStatsParams) => {
    setIsStatsLoading(true);

    if (API_CONFIG.debug) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const points = genMockPoints(30);
      setStats({
        range: {
          startDate: `${params.startDate ?? getMockDate(-29)}T00:00:00.000Z`,
          endDate: `${params.endDate ?? getMockDate(0)}T23:59:59.999Z`,
          groupBy: "day",
        },
        settings: {
          taxRate: MOCK_SETTINGS.taxRate,
          acquiringFeeRate: MOCK_SETTINGS.acquiringFeeRate,
        },
        points,
        totals: {
          topups: points.reduce((sum, point) => sum + point.topups, 0),
          subscriptions: points.reduce(
            (sum, point) => sum + point.subscriptions,
            0,
          ),
          refPaid: points.reduce((sum, point) => sum + point.refPaid, 0),
          financeWithdrawals: points.reduce(
            (sum, point) => sum + point.financeWithdrawals,
            0,
          ),
          acquiringFee: Number(
            points
              .reduce((sum, point) => sum + point.acquiringFee, 0)
              .toFixed(2),
          ),
          taxAmount: Number(
            points.reduce((sum, point) => sum + point.taxAmount, 0).toFixed(2),
          ),
          netProfit: Number(
            points.reduce((sum, point) => sum + point.netProfit, 0).toFixed(2),
          ),
          users: points.reduce((sum, point) => sum + point.newUsers, 0),
          totalUsers: points.at(-1)?.totalUsers ?? 0,
          revenue: points.reduce(
            (sum, point) => sum + point.topups + point.subscriptions,
            0,
          ),
        },
      });
      setIsStatsLoading(false);
      return;
    }

    try {
      const query: Record<string, string> = {};
      if (params.period) query.period = params.period;
      if (params.startDate) query.startDate = params.startDate;
      if (params.endDate) query.endDate = params.endDate;

      const data = await apiClient.get<FinanceStats>("/admin/finance/stats", query);
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    setIsBalanceLoading(true);

    if (API_CONFIG.debug) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      setBalance(MOCK_BALANCE);
      setIsBalanceLoading(false);
      return;
    }

    try {
      const data = await apiClient.get<FinanceBalance>("/admin/finance/balance");
      setBalance(data);
    } catch {
      setBalance(null);
    } finally {
      setIsBalanceLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    setIsSettingsLoading(true);

    if (API_CONFIG.debug) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      setSettings(MOCK_SETTINGS);
      setIsSettingsLoading(false);
      return;
    }

    try {
      const data = await apiClient.get<FinanceSettings>("/admin/finance/settings");
      setSettings(data);
    } catch {
      setSettings(null);
    } finally {
      setIsSettingsLoading(false);
    }
  }, []);

  const updateSettings = useCallback(
    async (payload: FinanceSettingsUpdateRequest) => {
      setIsSavingSettings(true);

      try {
        const data = API_CONFIG.debug
          ? {
              ...payload,
              updatedAt: new Date().toISOString(),
            }
          : await apiClient.patch<FinanceSettings>(
              "/admin/finance/settings",
              payload,
            );

        setSettings(data);
        return data;
      } finally {
        setIsSavingSettings(false);
      }
    },
    [],
  );

  const fetchBusinessWithdrawals = useCallback(async () => {
    setIsWithdrawalsLoading(true);

    if (API_CONFIG.debug) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      setWithdrawals(MOCK_WITHDRAWALS);
      setIsWithdrawalsLoading(false);
      return;
    }

    try {
      const data = await apiClient.get<FinanceBusinessWithdrawal[]>(
        "/admin/finance/withdrawals",
      );
      setWithdrawals(data);
    } catch {
      setWithdrawals([]);
    } finally {
      setIsWithdrawalsLoading(false);
    }
  }, []);

  const createBusinessWithdrawal = useCallback(
    async (payload: FinanceBusinessWithdrawalCreateRequest) => {
      setIsCreatingWithdrawal(true);

      try {
        const created = API_CONFIG.debug
          ? {
              id: crypto.randomUUID(),
              title: payload.title,
              note: payload.note ?? null,
              amount: payload.amount,
              withdrawalDate: `${payload.withdrawalDate}T00:00:00.000Z`,
              createdAt: new Date().toISOString(),
              createdBy: { id: "admin-1", login: "nopass" },
            }
          : await apiClient.post<FinanceBusinessWithdrawal>(
              "/admin/finance/withdrawals",
              payload,
            );

        setWithdrawals((prev) =>
          [created, ...prev].sort((a, b) =>
            b.withdrawalDate.localeCompare(a.withdrawalDate),
          ),
        );
        return created;
      } finally {
        setIsCreatingWithdrawal(false);
      }
    },
    [],
  );

  const deleteBusinessWithdrawal = useCallback(async (id: string) => {
    const previous = withdrawals;
    setWithdrawals((prev) => prev.filter((item) => item.id !== id));

    try {
      if (!API_CONFIG.debug) {
        await apiClient.delete(`/admin/finance/withdrawals/${id}`);
      }
    } catch (error) {
      setWithdrawals(previous);
      throw error;
    }
  }, [withdrawals]);

  return {
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
  };
}
