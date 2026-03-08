/**
 * @fileoverview Admin hook for managing referral withdrawal requests.
 *
 * Admin-only.
 *
 * Endpoints:
 * - GET   /admin/withdrawals          → paginated list (filter by status)
 * - PATCH /admin/withdrawals/:id/approve → approve request
 * - PATCH /admin/withdrawals/:id/reject  → reject request
 *
 * @example
 * const { withdrawals, fetchWithdrawals, approve, reject } = useAdminWithdrawals();
 */

"use client";

import { useState, useCallback } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type { AdminWithdrawal, PaginatedResponse } from "@/api/types";

// ── Mock data ──────────────────────────────────────────────────

const MOCK_WITHDRAWALS: AdminWithdrawal[] = Array.from(
  { length: 18 },
  (_, i) => {
    const logins = [
      "ivan123",
      "alex_vpn",
      "mashenka",
      "vpnpro",
      "gamer99",
      "byte_99",
      "neonblue",
      "stormfly",
      "coldfire",
      "pixelcat",
    ];
    const banks = ["Т-Банк", "Сбербанк", "ВТБ", "Альфа-Банк", "Газпромбанк"];
    const statuses: Array<"pending" | "approved" | "rejected"> = [
      "pending",
      "pending",
      "approved",
      "rejected",
      "pending",
    ];
    return {
      id: String(i + 1),
      userLogin: logins[i % logins.length],
      userId: String(i + 100),
      amount: (i + 1) * 100 + 50,
      target:
        i % 2 === 0
          ? `+7 9${String(i).padStart(2, "0")} 000-00-0${i % 9}`
          : `4276 1234 56${String(i).padStart(2, "0")} 9000`,
      bank: banks[i % banks.length],
      status: statuses[i % statuses.length],
      createdAt: new Date(Date.now() - i * 2 * 86400000).toISOString(),
      processedAt:
        statuses[i % statuses.length] !== "pending"
          ? new Date(Date.now() - i * 86400000).toISOString()
          : null,
    };
  },
);

// ── Hook ───────────────────────────────────────────────────────

/**
 * Management of referral withdrawal requests in the admin panel.
 */
export function useAdminWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Fetch paginated withdrawal requests.
   * @param status - filter by status ("pending" | "approved" | "rejected" | undefined = all)
   * @param page - 1-based page number
   * @param pageSize - items per page
   */
  const fetchWithdrawals = useCallback(
    async (status?: string, page = 1, pageSize = 6) => {
      setIsLoading(true);
      if (API_CONFIG.debug) {
        await new Promise((r) => setTimeout(r, 400));
        const filtered = status
          ? MOCK_WITHDRAWALS.filter((w) => w.status === status)
          : MOCK_WITHDRAWALS;
        const start = (page - 1) * pageSize;
        setWithdrawals(filtered.slice(start, start + pageSize));
        setTotal(filtered.length);
        setIsLoading(false);
        return;
      }
      try {
        const query: Record<string, string | number> = { page, pageSize };
        if (status) query.status = status;
        const data = await apiClient.get<PaginatedResponse<AdminWithdrawal>>(
          "/admin/withdrawals",
          query,
        );
        setWithdrawals(data.items);
        setTotal(data.total);
      } catch {
        setWithdrawals([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Approve a withdrawal request. Optimistic update.
   */
  const approve = useCallback(async (id: string) => {
    setWithdrawals((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, status: "approved", processedAt: new Date().toISOString() }
          : w,
      ),
    );
    if (!API_CONFIG.debug) {
      try {
        await apiClient.patch(`/admin/withdrawals/${id}/approve`);
      } catch {
        setWithdrawals((prev) =>
          prev.map((w) =>
            w.id === id ? { ...w, status: "pending", processedAt: null } : w,
          ),
        );
      }
    }
  }, []);

  /**
   * Reject a withdrawal request. Optimistic update.
   */
  const reject = useCallback(async (id: string) => {
    setWithdrawals((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, status: "rejected", processedAt: new Date().toISOString() }
          : w,
      ),
    );
    if (!API_CONFIG.debug) {
      try {
        await apiClient.patch(`/admin/withdrawals/${id}/reject`);
      } catch {
        setWithdrawals((prev) =>
          prev.map((w) =>
            w.id === id ? { ...w, status: "pending", processedAt: null } : w,
          ),
        );
      }
    }
  }, []);

  return { withdrawals, total, isLoading, fetchWithdrawals, approve, reject };
}
