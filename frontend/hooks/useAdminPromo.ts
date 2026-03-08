/**
 * @fileoverview Admin promo code management hook.
 *
 * Admin-only. CRUD for promo codes with conditions and effects.
 *
 * Endpoints:
 * - GET    /admin/promo           → paginated promo list
 * - POST   /admin/promo           → create promo
 * - PATCH  /admin/promo/:id       → update promo
 * - DELETE /admin/promo/:id       → delete promo
 * - GET    /admin/promo/:id/stats → per-promo activation stats
 *
 * @example
 * const { promos, total, fetchPromos, createPromo, deletePromo } = useAdminPromo();
 */

"use client";

import { useState, useCallback } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type {
  AdminPromoCode,
  AdminPromoUpsertRequest,
  AdminPromoStats,
  PaginatedResponse,
} from "@/api/types";

// ── Mock data ──────────────────────────────────────────────────

const MOCK_PROMOS: AdminPromoCode[] = [
  {
    id: "p1",
    code: "WELCOME100",
    activations: 47,
    maxActivations: 500,
    lastActivatedAt: "2026-03-01T10:00:00Z",
    totalEffectSummary: "+100 ₽ на баланс",
    createdAt: "2026-01-01T00:00:00Z",
    conditions: [
      { key: "new_users_only" },
      { key: "max_activations", value: "500" },
    ],
    effects: [{ key: "add_balance", value: "100" }],
  },
  {
    id: "p2",
    code: "SUMMER20",
    activations: 12,
    maxActivations: null,
    lastActivatedAt: "2026-02-20T00:00:00Z",
    totalEffectSummary: "Скидка 20% + 7 дней",
    createdAt: "2026-02-01T00:00:00Z",
    conditions: [
      { key: "date_range", value: "2026-02-01", value2: "2026-04-30" },
      { key: "no_active_sub" },
    ],
    effects: [
      { key: "plan_discount_pct", value: "20" },
      { key: "free_days", value: "7" },
    ],
  },
];

// ── Hook ───────────────────────────────────────────────────────

/**
 * Full promo code management for the admin panel.
 */
export function useAdminPromo() {
  const [promos, setPromos] = useState<AdminPromoCode[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  /** Fetch paginated promo list */
  const fetchPromos = useCallback(async (page = 1, pageSize = 5) => {
    setIsLoading(true);
    if (API_CONFIG.debug) {
      await new Promise((r) => setTimeout(r, 300));
      const start = (page - 1) * pageSize;
      setPromos(MOCK_PROMOS.slice(start, start + pageSize));
      setTotal(MOCK_PROMOS.length);
      setIsLoading(false);
      return;
    }
    try {
      const data = await apiClient.get<PaginatedResponse<AdminPromoCode>>(
        "/admin/promo",
        { page, pageSize },
      );
      setPromos(data.items);
      setTotal(data.total);
    } catch {
      setPromos([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create a new promo code.
   * @returns the created promo or null on error
   */
  const createPromo = useCallback(
    async (data: AdminPromoUpsertRequest): Promise<AdminPromoCode | null> => {
      if (API_CONFIG.debug) {
        const newPromo: AdminPromoCode = {
          id: "p" + Date.now(),
          ...data,
          activations: 0,
          maxActivations: null,
          lastActivatedAt: null,
          totalEffectSummary: data.effects
            .map((e) => `${e.key}:${e.value ?? ""}`)
            .join(", "),
          createdAt: new Date().toISOString(),
        };
        setPromos((prev) => [newPromo, ...prev]);
        setTotal((prev) => prev + 1);
        return newPromo;
      }
      try {
        const promo = await apiClient.post<AdminPromoCode>(
          "/admin/promo",
          data,
        );
        setPromos((prev) => [promo, ...prev]);
        setTotal((prev) => prev + 1);
        return promo;
      } catch {
        return null;
      }
    },
    [],
  );

  /**
   * Delete a promo code with optimistic removal.
   * @param id - promo ID
   */
  const deletePromo = useCallback(
    async (id: string) => {
      const prev = promos.find((p) => p.id === id);
      setPromos((p) => p.filter((x) => x.id !== id));
      setTotal((t) => t - 1);
      if (!API_CONFIG.debug) {
        try {
          await apiClient.delete(`/admin/promo/${id}`);
        } catch {
          if (prev) setPromos((p) => [prev, ...p]);
          setTotal((t) => t + 1);
        }
      }
    },
    [promos],
  );

  /**
   * Fetch activation stats for a specific promo code.
   */
  const fetchStats = useCallback(
    async (id: string): Promise<AdminPromoStats | null> => {
      if (API_CONFIG.debug) {
        return {
          activations: 12,
          uniqueUsers: 10,
          totalBalanceAwarded: 1200,
          activationsByDay: [],
        };
      }
      try {
        return await apiClient.get<AdminPromoStats>(`/admin/promo/${id}/stats`);
      } catch {
        return null;
      }
    },
    [],
  );

  return {
    promos,
    total,
    isLoading,
    fetchPromos,
    createPromo,
    deletePromo,
    fetchStats,
  };
}
