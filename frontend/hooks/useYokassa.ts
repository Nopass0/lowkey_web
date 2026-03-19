/**
 * @fileoverview YooKassa payment hooks.
 * Handles card/SBP/T-Pay top-up, card management, promo subscribe.
 */

import { create } from "zustand";
import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import type {
  PaymentMethod,
  YKTopupResponse,
  YKLinkCardResponse,
  YKPaymentStatusResponse,
  YKPromoSubscribeResponse,
} from "@/api/types";

// ── Types ──────────────────────────────────────────────────────

type YKPaymentStatus = "idle" | "pending" | "success" | "failed" | "redirecting";

export type YKPaymentType = "bank_card" | "sbp" | "tinkoff_bank";

interface YKBillingState {
  status: YKPaymentStatus;
  paymentId: string | null;
  confirmationUrl: string | null;
  amount: number | null;

  startTopup: (
    amount: number,
    paymentType: YKPaymentType,
    opts?: { cardMethodId?: string; subscriptionPlanId?: string; subscriptionPeriod?: string },
  ) => Promise<{ confirmationUrl: string | null } | null>;

  startLinkCard: () => Promise<{ confirmationUrl: string | null } | null>;

  startPromoSubscribe: (planSlug: string, period: string) => Promise<{ confirmationUrl: string | null; promoAmount: number } | null>;

  checkStatus: () => Promise<"success" | "failed" | "pending">;

  reset: () => void;
}

export const useYKBilling = create<YKBillingState>((set, get) => ({
  status: "idle",
  paymentId: null,
  confirmationUrl: null,
  amount: null,

  startTopup: async (amount, paymentType, opts) => {
    try {
      const res = await apiClient.post<YKTopupResponse>("/yokassa/topup", {
        amount,
        paymentType,
        cardMethodId: opts?.cardMethodId,
        subscriptionPlanId: opts?.subscriptionPlanId,
        subscriptionPeriod: opts?.subscriptionPeriod,
      });

      set({
        status: res.confirmationUrl ? "redirecting" : "pending",
        paymentId: res.paymentId,
        confirmationUrl: res.confirmationUrl,
        amount,
      });

      return { confirmationUrl: res.confirmationUrl };
    } catch (err) {
      set({ status: "failed" });
      return null;
    }
  },

  startLinkCard: async () => {
    try {
      const res = await apiClient.post<YKLinkCardResponse>("/yokassa/link-card");
      set({
        status: "redirecting",
        paymentId: res.paymentId,
        confirmationUrl: res.confirmationUrl,
        amount: 1,
      });
      return { confirmationUrl: res.confirmationUrl };
    } catch {
      set({ status: "failed" });
      return null;
    }
  },

  startPromoSubscribe: async (planSlug, period) => {
    try {
      const res = await apiClient.post<YKPromoSubscribeResponse>(
        "/yokassa/subscribe-promo",
        { planSlug, period },
      );
      set({
        status: "redirecting",
        paymentId: res.paymentId,
        confirmationUrl: res.confirmationUrl,
        amount: res.promoAmount,
      });
      return { confirmationUrl: res.confirmationUrl, promoAmount: res.promoAmount };
    } catch {
      set({ status: "failed" });
      return null;
    }
  },

  checkStatus: async () => {
    const { paymentId } = get();
    if (!paymentId) return "pending";
    try {
      const res = await apiClient.get<YKPaymentStatusResponse>(
        `/yokassa/payments/${paymentId}/status`,
      );
      if (res.status === "success") {
        set({ status: "success" });
        return "success";
      }
      if (res.status === "failed" || res.status === "expired") {
        set({ status: "failed" });
        return "failed";
      }
    } catch {}
    return "pending";
  },

  reset: () =>
    set({ status: "idle", paymentId: null, confirmationUrl: null, amount: null }),
}));

// ── usePaymentMethods ──────────────────────────────────────────

export function usePaymentMethods() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const data = await apiClient.get<PaymentMethod[]>("/yokassa/cards");
      setMethods(data);
    } catch {
      setMethods([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const removeCard = useCallback(
    async (id: string) => {
      await apiClient.delete(`/yokassa/cards/${id}`);
      setMethods((prev) => prev.filter((m) => m.id !== id));
    },
    [],
  );

  const setDefault = useCallback(async (id: string) => {
    await apiClient.patch(`/yokassa/cards/${id}/default`);
    setMethods((prev) =>
      prev.map((m) => ({ ...m, isDefault: m.id === id })),
    );
  }, []);

  const setAutoCharge = useCallback(async (id: string, allowAutoCharge: boolean) => {
    const updated = await apiClient.patch<PaymentMethod>(
      `/yokassa/cards/${id}/auto-charge`,
      { allowAutoCharge },
    );
    setMethods((prev) =>
      prev.map((m) => (m.id === id ? { ...m, allowAutoCharge: updated.allowAutoCharge } : m)),
    );
  }, []);

  return { methods, isLoading, refetch, removeCard, setDefault, setAutoCharge };
}
