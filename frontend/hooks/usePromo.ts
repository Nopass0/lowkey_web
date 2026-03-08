/**
 * @fileoverview Promo code activation and history hook.
 *
 * - Activate: POST /user/promo/activate
 * - History:  GET  /user/promo/history (paginated)
 *
 * @example
 * const { activatePromo, isActivating, history, fetchHistory } = usePromo();
 */

"use client";

import { useState, useCallback } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type {
  PromoActivateResponse,
  PromoHistoryItem,
  PaginatedResponse,
} from "@/api/types";

// ── Mock data ──────────────────────────────────────────────────

const MOCK_HISTORY: PromoHistoryItem[] = [
  {
    id: "ph1",
    code: "WELCOME100",
    description: "+100 ₽ на баланс",
    activatedAt: "2026-01-15T10:00:00Z",
  },
  {
    id: "ph2",
    code: "SUMMER20",
    description: "Скидка 20% на подписку + 7 дней",
    activatedAt: "2026-02-01T12:30:00Z",
  },
];

// ── Hook ───────────────────────────────────────────────────────

/**
 * Hook for promo code activation and history.
 * Includes state for activation feedback (success/error message).
 */
export function usePromo() {
  const [isActivating, setIsActivating] = useState(false);
  const [activationResult, setActivationResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [history, setHistory] = useState<PromoHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  /**
   * Activate a promo code. Updates activationResult with success/error info.
   * @param code - The promo code string, e.g. "WELCOME100"
   */
  const activatePromo = useCallback(async (code: string) => {
    setIsActivating(true);
    setActivationResult(null);

    if (API_CONFIG.debug) {
      await new Promise((r) => setTimeout(r, 800));
      const success = code.toUpperCase() === "WELCOME100";
      setActivationResult({
        success,
        message: success
          ? "+100 ₽ зачислено на баланс!"
          : "Промокод не найден или уже использован.",
      });
      setIsActivating(false);
      return success;
    }

    try {
      const res = await apiClient.post<PromoActivateResponse>(
        "/user/promo/activate",
        { code },
      );
      setActivationResult({
        success: true,
        message: res.rewardDescription || res.message,
      });
      return true;
    } catch (e) {
      setActivationResult({ success: false, message: (e as Error).message });
      return false;
    } finally {
      setIsActivating(false);
    }
  }, []);

  /**
   * Fetch paginated promo activation history.
   * @param page - 1-based page number
   * @param pageSize - Items per page
   */
  const fetchHistory = useCallback(async (page = 1, pageSize = 10) => {
    setIsHistoryLoading(true);
    if (API_CONFIG.debug) {
      await new Promise((r) => setTimeout(r, 300));
      const start = (page - 1) * pageSize;
      setHistory(MOCK_HISTORY.slice(start, start + pageSize));
      setHistoryTotal(MOCK_HISTORY.length);
      setIsHistoryLoading(false);
      return;
    }
    try {
      const data = await apiClient.get<PaginatedResponse<PromoHistoryItem>>(
        "/user/promo/history",
        { page, pageSize },
      );
      setHistory(data.items);
      setHistoryTotal(data.total);
    } catch {
      setHistory([]);
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  return {
    activatePromo,
    isActivating,
    activationResult,
    history,
    historyTotal,
    isHistoryLoading,
    fetchHistory,
  };
}
