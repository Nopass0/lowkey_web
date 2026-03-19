/**
 * @fileoverview User profile, balance, subscription and transaction history hook.
 *
 * Fetches profile on mount (or manually via `refetch`).
 * Transactions support server-side pagination.
 *
 * @example
 * const { profile, isLoading, refetch } = useUser();
 * const { transactions, fetchTransactions } = useUserTransactions();
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type {
  UserProfile,
  Transaction,
  PaginatedResponse,
  Subscription,
  UserVpnAccess,
} from "@/api/types";

// ── Mock data ──────────────────────────────────────────────────

const MOCK_PROFILE: UserProfile = {
  id: "u1",
  login: "nopass",
  avatarHash: "7A3F8Cff",
  balance: 1500,
  referralBalance: 120,
  hideAiMenu: false,
  hideAiMenuForAll: false,
  subscription: {
    planId: "pro",
    planName: "Рабочий",
    activeUntil: "2026-04-15T00:00:00Z",
    isLifetime: false,
  } satisfies Subscription,
  joinedAt: "2025-01-01T00:00:00Z",
  telegramId: null,
  telegramLinkCode: null,
  referralRate: 10,
  vpnAccess: {
    serverIp: "46.226.166.226",
    location: "RU",
    protocols: ["VLESS"],
    vlessLink:
      "vless://demo-user@46.226.166.226:443?type=tcp&security=tls#lowkey-demo",
  } satisfies UserVpnAccess,
};

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: "t1",
    type: "topup",
    amount: 500,
    title: "Пополнение через СБП",
    createdAt: "2026-02-28T14:00:00Z",
  },
  {
    id: "t2",
    type: "subscription",
    amount: -350,
    title: "Подписка Рабочий · 1 мес.",
    createdAt: "2026-02-28T14:01:00Z",
  },
  {
    id: "t3",
    type: "referral_earning",
    amount: 60,
    title: "Реферальное начисление от ivan***",
    createdAt: "2026-02-25T10:00:00Z",
  },
  {
    id: "t4",
    type: "topup",
    amount: 1000,
    title: "Пополнение через СБП",
    createdAt: "2026-02-20T09:00:00Z",
  },
];

// ── useUser ────────────────────────────────────────────────────

/**
 * Hook for current user profile (balance, subscription, avatar).
 * Refetches on component mount.
 */
export function useUser() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    if (API_CONFIG.debug) {
      await new Promise((r) => setTimeout(r, 400));
      setProfile(MOCK_PROFILE);
      setIsLoading(false);
      return;
    }
    try {
      const data = await apiClient.get<UserProfile>("/user/profile");
      setProfile(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, isLoading, error, refetch: fetchProfile, setProfile };
}

// ── useUserTransactions ────────────────────────────────────────

/**
 * Paginated transaction history for the current user.
 *
 * @example
 * const { transactions, total, fetchPage } = useUserTransactions();
 * fetchPage(1, 10);
 */
export function useUserTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (page = 1, pageSize = 10) => {
    setIsLoading(true);
    setError(null);
    if (API_CONFIG.debug) {
      await new Promise((r) => setTimeout(r, 300));
      const start = (page - 1) * pageSize;
      setTransactions(MOCK_TRANSACTIONS.slice(start, start + pageSize));
      setTotal(MOCK_TRANSACTIONS.length);
      setIsLoading(false);
      return;
    }
    try {
      const data = await apiClient.get<PaginatedResponse<Transaction>>(
        "/user/transactions",
        { page, pageSize },
      );
      setTransactions(data.items);
      setTotal(data.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { transactions, total, isLoading, error, fetchPage };
}
