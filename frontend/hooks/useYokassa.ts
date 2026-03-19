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

const PENDING_PAYMENT_STORAGE_KEY = "lowkey.pending_yk_payment";

function persistPendingPayment(payload: {
  paymentId: string;
  confirmationUrl: string | null;
  amount: number;
}) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    PENDING_PAYMENT_STORAGE_KEY,
    JSON.stringify(payload),
  );
}

function readPendingPayment():
  | { paymentId: string; confirmationUrl: string | null; amount: number }
  | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_PAYMENT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      paymentId: string;
      confirmationUrl: string | null;
      amount: number;
    };
  } catch {
    return null;
  }
}

function clearPendingPayment() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
}

interface YKBillingState {
  status: YKPaymentStatus;
  paymentId: string | null;
  confirmationUrl: string | null;
  amount: number | null;
  restorePending: () => void;

  startTopup: (
    amount: number,
    paymentType: YKPaymentType,
    opts?: { cardMethodId?: string; subscriptionPlanId?: string; subscriptionPeriod?: string },
  ) => Promise<{ confirmationUrl: string | null } | null>;

  startLinkCard: (opts?: {
    subscriptionPlanId?: string;
    subscriptionPeriod?: string;
  }) => Promise<{ confirmationUrl: string | null } | null>;

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

      persistPendingPayment({
        paymentId: res.paymentId,
        confirmationUrl: res.confirmationUrl,
        amount,
      });

      set({
        status: "pending",
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

  startLinkCard: async (opts) => {
    try {
      const res = await apiClient.post<YKLinkCardResponse>("/yokassa/link-card", {
        subscriptionPlanId: opts?.subscriptionPlanId,
        subscriptionPeriod: opts?.subscriptionPeriod,
      });
      persistPendingPayment({
        paymentId: res.paymentId,
        confirmationUrl: res.confirmationUrl,
        amount: 1,
      });
      set({
        status: "pending",
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
      persistPendingPayment({
        paymentId: res.paymentId,
        confirmationUrl: res.confirmationUrl,
        amount: res.promoAmount,
      });
      set({
        status: "pending",
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
        clearPendingPayment();
        set({ status: "success" });
        return "success";
      }
      if (res.status === "failed" || res.status === "expired") {
        clearPendingPayment();
        set({ status: "failed" });
        return "failed";
      }
    } catch {}
    return "pending";
  },

  restorePending: () => {
    const pending = readPendingPayment();
    if (!pending) return;
    set({
      status: "pending",
      paymentId: pending.paymentId,
      confirmationUrl: pending.confirmationUrl,
      amount: pending.amount,
    });
  },

  reset: () => {
    clearPendingPayment();
    set({ status: "idle", paymentId: null, confirmationUrl: null, amount: null });
  },
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
