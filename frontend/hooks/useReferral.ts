/**
 * @fileoverview Referral program hooks: info, referral list, and withdrawal management.
 *
 * Endpoints:
 * - GET  /user/referral          → referral code, balance, link
 * - GET  /user/referral/list     → paginated list of referred users
 * - GET  /user/referral/withdrawals → withdrawal request list
 * - POST /user/referral/withdrawals → create withdrawal request
 *
 * @example
 * const { info, isLoading } = useReferralInfo();
 * const { referrals, fetchReferrals } = useReferralList();
 * const { withdrawals, createWithdrawal } = useWithdrawals();
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type {
  ReferralInfo,
  ReferralItem,
  WithdrawalItem,
  WithdrawalCreateRequest,
  PaginatedResponse,
} from "@/api/types";

// ── Mock data ──────────────────────────────────────────────────

const MOCK_INFO: ReferralInfo = {
  code: "NOPASS7X",
  link: "https://lowkey.su/r/NOPASS7X",
  balance: 120,
  rate: 0.2,
  totalEarned: 220,
};

const MOCK_REFERRALS: ReferralItem[] = [
  {
    id: "r1",
    maskedLogin: "ivan***",
    joinedAt: "2026-01-12T00:00:00Z",
    earned: 60,
    planName: "Рабочий",
  },
  {
    id: "r2",
    maskedLogin: "alex***",
    joinedAt: "2026-01-28T00:00:00Z",
    earned: 40,
    planName: "Рабочий",
  },
  {
    id: "r3",
    maskedLogin: "mash***",
    joinedAt: "2026-02-15T00:00:00Z",
    earned: 20,
    planName: "Начальный",
  },
  {
    id: "r4",
    maskedLogin: "vpnp***",
    joinedAt: "2026-02-20T00:00:00Z",
    earned: 80,
    planName: "Продвинутый",
  },
  {
    id: "r5",
    maskedLogin: "game***",
    joinedAt: "2026-02-22T00:00:00Z",
    earned: 30,
    planName: "Начальный",
  },
  {
    id: "r6",
    maskedLogin: "byte***",
    joinedAt: "2026-02-25T00:00:00Z",
    earned: 60,
    planName: "Рабочий",
  },
  {
    id: "r7",
    maskedLogin: "neon***",
    joinedAt: "2026-02-27T00:00:00Z",
    earned: 40,
    planName: "Рабочий",
  },
];

const MOCK_WITHDRAWALS: WithdrawalItem[] = [
  {
    id: "w1",
    amount: 100,
    target: "+7 999 000-00-00",
    bank: "Сбербанк",
    status: "approved",
    createdAt: "2026-02-01T00:00:00Z",
  },
];

// ── useReferralInfo ────────────────────────────────────────────

/**
 * Fetches the current user's referral code, link, and balance.
 */
export function useReferralInfo() {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (API_CONFIG.debug) {
      setTimeout(() => {
        if (mounted) {
          setInfo(MOCK_INFO);
          setIsLoading(false);
        }
      }, 400);
      return () => {
        mounted = false;
      };
    }
    apiClient
      .get<ReferralInfo>("/user/referral")
      .then((d) => {
        if (mounted) {
          setInfo(d);
          setIsLoading(false);
        }
      })
      .catch((e) => {
        if (mounted) {
          setError((e as Error).message);
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const updateBalance = useCallback((delta: number) => {
    setInfo((prev) =>
      prev ? { ...prev, balance: prev.balance - delta } : null,
    );
  }, []);

  return { info, isLoading, error, updateBalance };
}

// ── useReferralList ────────────────────────────────────────────

/**
 * Paginated list of users referred by the current user.
 */
export function useReferralList() {
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReferrals = useCallback(async (page = 1, pageSize = 5) => {
    setIsLoading(true);
    if (API_CONFIG.debug) {
      await new Promise((r) => setTimeout(r, 300));
      const start = (page - 1) * pageSize;
      setReferrals(MOCK_REFERRALS.slice(start, start + pageSize));
      setTotal(MOCK_REFERRALS.length);
      setIsLoading(false);
      return;
    }
    try {
      const data = await apiClient.get<PaginatedResponse<ReferralItem>>(
        "/user/referral/list",
        { page, pageSize },
      );
      setReferrals(data.items);
      setTotal(data.total);
    } catch {
      setReferrals([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { referrals, total, isLoading, fetchReferrals };
}

// ── useWithdrawals ─────────────────────────────────────────────

/**
 * Referral balance withdrawal requests — list and creation.
 */
export function useWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (API_CONFIG.debug) {
      setTimeout(() => {
        if (mounted) {
          setWithdrawals(MOCK_WITHDRAWALS);
          setIsLoading(false);
        }
      }, 400);
      return () => {
        mounted = false;
      };
    }
    apiClient
      .get<WithdrawalItem[]>("/user/referral/withdrawals")
      .then((d) => {
        if (mounted) {
          setWithdrawals(d);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Submit a new withdrawal request.
   * @returns the created withdrawal item, or null on error
   */
  const createWithdrawal = useCallback(
    async (req: WithdrawalCreateRequest): Promise<WithdrawalItem | null> => {
      setIsCreating(true);
      if (API_CONFIG.debug) {
        await new Promise((r) => setTimeout(r, 600));
        const newItem: WithdrawalItem = {
          id: "w" + Date.now(),
          amount: req.amount,
          target: req.target,
          bank: req.bank,
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        setWithdrawals((prev) => [newItem, ...prev]);
        setIsCreating(false);
        return newItem;
      }
      try {
        const item = await apiClient.post<WithdrawalItem>(
          "/user/referral/withdrawals",
          req,
        );
        setWithdrawals((prev) => [item, ...prev]);
        return item;
      } catch {
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  return { withdrawals, isLoading, isCreating, createWithdrawal };
}
