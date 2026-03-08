/**
 * @fileoverview Admin hook for managing users (list, ban, subscription edit).
 *
 * Admin-only. All methods throw if current user is not admin.
 *
 * Endpoints:
 * - GET   /admin/users               → paginated user list (with search)
 * - PATCH /admin/users/:id/ban       → toggle ban
 * - PATCH /admin/users/:id/subscription → update plan + expiry
 *
 * @example
 * const { users, total, fetchUsers, toggleBan, updateSubscription } = useAdminUsers();
 */

"use client";

import { useState, useCallback } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type {
  AdminUser,
  AdminUpdateSubscriptionRequest,
  PaginatedResponse,
} from "@/api/types";

// ── Mock data ──────────────────────────────────────────────────

const MOCK_USERS: AdminUser[] = Array.from({ length: 25 }, (_, i) => {
  const names = [
    "nopass",
    "ivan123",
    "alex_vpn",
    "mashenka",
    "testuser",
    "vpnpro",
    "user_42",
    "gamer99",
    "crypto_fan",
    "darkwave",
    "speedking",
    "netrunner",
    "shadowx",
    "pulsar",
    "byte_99",
    "quantumq",
    "neonblue",
    "vortex1",
    "pixelcat",
    "irondog",
    "stormfly",
    "coldfire",
    "lunar99",
    "duskfall",
    "apex_v",
  ];
  const plans = [null, "Начальный", "Рабочий", "Продвинутый"];
  const plan = plans[i % 4];
  return {
    id: String(i + 1),
    login: names[i],
    balance: i * 50 + 100,
    referralBalance: i * 10,
    isBanned: i % 7 === 3,
    plan,
    activeUntil: plan
      ? new Date(Date.now() + (i + 1) * 12 * 86400000).toISOString()
      : null,
    joinedAt: new Date(Date.now() - i * 15 * 86400000).toISOString(),
    deviceCount: (i % 4) + 1,
  } satisfies AdminUser;
});

// ── Hook ───────────────────────────────────────────────────────

/**
 * Admin hook for user management with search and pagination.
 */
export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Fetch paginated user list.
   * @param page - 1-based page number
   * @param pageSize - items per page
   * @param search - optional login search string
   */
  const fetchUsers = useCallback(
    async (page = 1, pageSize = 8, search = "") => {
      setIsLoading(true);
      if (API_CONFIG.debug) {
        await new Promise((r) => setTimeout(r, 400));
        const filtered = search
          ? MOCK_USERS.filter((u) => u.login.includes(search.toLowerCase()))
          : MOCK_USERS;
        const start = (page - 1) * pageSize;
        setUsers(filtered.slice(start, start + pageSize));
        setTotal(filtered.length);
        setIsLoading(false);
        return;
      }
      try {
        const query: Record<string, string | number> = { page, pageSize };
        if (search) query.search = search;
        const data = await apiClient.get<PaginatedResponse<AdminUser>>(
          "/admin/users",
          query,
        );
        setUsers(data.items);
        setTotal(data.total);
      } catch {
        setUsers([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Toggle ban status for a user. Uses optimistic update.
   * @param id - user ID
   */
  const toggleBan = useCallback(
    async (id: string) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, isBanned: !u.isBanned } : u)),
      );
      if (!API_CONFIG.debug) {
        const user = users.find((u) => u.id === id);
        try {
          await apiClient.patch(`/admin/users/${id}/ban`, {
            isBanned: !user?.isBanned,
          });
        } catch {
          // Rollback
          setUsers((prev) =>
            prev.map((u) =>
              u.id === id ? { ...u, isBanned: user?.isBanned ?? false } : u,
            ),
          );
        }
      }
    },
    [users],
  );

  /**
   * Update a user's subscription plan and expiry date.
   * @param id - user ID
   * @param plan - plan name or null to remove subscription
   * @param activeUntil - ISO date string or null
   */
  const updateSubscription = useCallback(
    async (id: string, plan: string | null, activeUntil: string | null) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, plan, activeUntil } : u)),
      );
      if (!API_CONFIG.debug) {
        try {
          await apiClient.patch(`/admin/users/${id}/subscription`, {
            plan,
            activeUntil,
          } satisfies AdminUpdateSubscriptionRequest);
        } catch {}
      }
    },
    [],
  );

  const updateBalance = useCallback(
    async (id: string, balance: number, referralBalance: number) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, balance, referralBalance } : u)),
      );
      if (!API_CONFIG.debug) {
        try {
          await apiClient.patch(`/admin/users/${id}/balance`, {
            balance,
            referralBalance,
          });
        } catch {}
      }
    },
    [],
  );

  const fetchUserStats = useCallback(
    async (id: string, startDate?: string, endDate?: string) => {
      setIsLoading(true);
      try {
        const query: Record<string, string> = {};
        if (startDate) query.startDate = startDate;
        if (endDate) query.endDate = endDate;

        return await apiClient.get<any>(`/admin/users/${id}/stats`, query);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return {
    users,
    total,
    isLoading,
    fetchUsers,
    toggleBan,
    updateSubscription,
    updateBalance,
    fetchUserStats,
  };
}
