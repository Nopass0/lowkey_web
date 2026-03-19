/**
 * @fileoverview Billing and payment state management (Zustand).
 *
 * Handles:
 * - Creating a real SBP QR payment via POST /payments/create
 * - Long-polling payment status via GET /payments/:id/status
 * - Purchasing a subscription via POST /subscriptions/purchase
 * - Fetching available subscription plans
 *
 * @example
 * const { startPayment, paymentStatus, qrUrl, purchaseSubscription } = useBilling();
 */

import { create } from "zustand";
import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type {
  PaymentCreateResponse,
  PaymentStatusResponse,
  SubscriptionPlan,
  SubscriptionPurchaseResponse,
} from "@/api/types";

// ── Types ──────────────────────────────────────────────────────

type PaymentStatus = "idle" | "pending" | "success" | "failed" | "expired";

interface PendingSubscription {
  planId: string;
  period: string;
  cost: number;
}

interface BillingState {
  paymentStatus: PaymentStatus;
  /** SBP QR image URL */
  qrUrl: string | null;
  amount: number | null;
  paymentId: string | null;
  /** If set, this subscription is purchased automatically after payment succeeds */
  pendingSubscription: PendingSubscription | null;

  /**
   * Create a new SBP payment. Transitions to "pending" and provides QR URL.
   * @param amount - amount in RUB
   * @param pendingSub - if provided, this subscription is auto-purchased after payment
   */
  startPayment: (
    amount: number,
    pendingSub?: PendingSubscription,
  ) => Promise<void>;

  /**
   * Poll the server for payment status once.
   * @returns true if payment succeeded (caller should stop polling)
   */
  checkStatus: () => Promise<boolean>;

  /**
   * Purchase a subscription directly (when balance is sufficient).
   * @returns new subscription or null on error
   */
  purchaseSubscription: (
    planId: string,
    period: string,
    autoRenewPaymentMethodId?: string,
  ) => Promise<SubscriptionPurchaseResponse | null>;

  /** Reset billing state to idle */
  reset: () => void;
}

// ── Mock data ──────────────────────────────────────────────────

const MOCK_PLANS: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Начальный",
    prices: {
      monthly: 149,
      "3months": 129,
      "6months": 99,
      yearly: 79,
    },
    features: ["1 устройство", "Базовая скорость", "Доступ к 5 локациям"],
  },
  {
    id: "pro",
    name: "Продвинутый",
    prices: {
      monthly: 299,
      "3months": 249,
      "6months": 199,
      yearly: 149,
    },
    features: [
      "3 устройства",
      "Высокая скорость",
      "Доступ ко всем локациям",
      "Kill Switch",
    ],
    isPopular: true,
  },
  {
    id: "advanced",
    name: "Максимальный",
    prices: {
      monthly: 499,
      "3months": 399,
      "6months": 349,
      yearly: 249,
    },
    features: [
      "5 устройств",
      "Максимальная скорость",
      "Доступ ко всем локациям",
      "Kill Switch",
      "Выделенный IP",
      "Приоритетная поддержка",
    ],
  },
];

// ── Store ──────────────────────────────────────────────────────

export const useBilling = create<BillingState>((set, get) => ({
  paymentStatus: "idle",
  qrUrl: null,
  amount: null,
  paymentId: null,
  pendingSubscription: null,

  startPayment: async (amount, pendingSub) => {
    if (API_CONFIG.debug) {
      const mockId = "pay_" + Math.random().toString(36).substring(2, 9);
      set({
        paymentStatus: "pending",
        amount,
        paymentId: mockId,
        pendingSubscription: pendingSub ?? null,
        qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=0&data=SBPMOCK-${mockId}-${amount}`,
      });
      return;
    }
    try {
      const { paymentId, qrUrl } = await apiClient.post<PaymentCreateResponse>(
        "/payments/create",
        { amount },
      );
      set({
        paymentStatus: "pending",
        amount,
        paymentId,
        pendingSubscription: pendingSub ?? null,
        qrUrl,
      });
    } catch {
      set({ paymentStatus: "failed" });
    }
  },

  checkStatus: async () => {
    const { paymentId, paymentStatus } = get();
    if (paymentStatus !== "pending" || !paymentId) return false;

    if (API_CONFIG.debug) {
      // Simulate ~30% chance of success per poll
      if (Math.random() > 0.7) {
        set({ paymentStatus: "success" });
        return true;
      }
      return false;
    }

    try {
      const { status } = await apiClient.get<PaymentStatusResponse>(
        `/payments/${paymentId}/status`,
      );
      if (status === "success") {
        set({ paymentStatus: "success" });
        return true;
      }
      if (status === "failed" || status === "expired") {
        set({ paymentStatus: status });
        return true;
      }
    } catch {
      // Network errors during polling are silently ignored
    }
    return false;
  },

  purchaseSubscription: async (planId, period, autoRenewPaymentMethodId) => {
    if (API_CONFIG.debug) {
      return {
        subscription: {
          planId,
          planName: planId,
          activeUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
          isLifetime: false,
        },
        newBalance: 1000,
      } as SubscriptionPurchaseResponse;
    }
    try {
      return await apiClient.post<SubscriptionPurchaseResponse>(
        "/subscriptions/purchase",
        { planId, period, autoRenewPaymentMethodId },
      );
    } catch {
      return null;
    }
  },

  reset: () =>
    set({
      paymentStatus: "idle",
      qrUrl: null,
      amount: null,
      paymentId: null,
      pendingSubscription: null,
    }),
}));

// ── usePaymentLongPoll ─────────────────────────────────────────

/**
 * Starts long-polling for payment status while `active` is true.
 * Automatically stops on success, failure, expiry, or when deactivated.
 *
 * @param active - set to true while QR modal is open and status is "pending"
 * @param onPaid - called when payment succeeds (before auto-close)
 */
export function usePaymentLongPoll(active: boolean, onPaid?: () => void) {
  const { checkStatus, paymentStatus } = useBilling();

  const poll = useCallback(async () => {
    const done = await checkStatus();
    if (done && paymentStatus === "success") onPaid?.();
  }, [checkStatus, paymentStatus, onPaid]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(poll, API_CONFIG.paymentPollInterval);
    return () => clearInterval(id);
  }, [active, poll]);
}

// ── useSubscriptionPlans ───────────────────────────────────────

/**
 * Fetches available subscription plans from the server.
 * Falls back to hard-coded plans in debug mode.
 */
export function useSubscriptionPlans() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (API_CONFIG.debug) {
      setTimeout(() => {
        setPlans(MOCK_PLANS);
        setIsLoading(false);
      }, 300);
      return;
    }
    apiClient
      .get<SubscriptionPlan[]>("/subscriptions/plans")
      .then((d) => setPlans(d))
      .catch(() => setPlans(MOCK_PLANS))
      .finally(() => setIsLoading(false));
  }, []);

  return { plans, isLoading };
}
