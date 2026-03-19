import { API_CONFIG } from "@/api/config";
import type { SubscriptionPlan } from "@/api/types";

export const fallbackPlans: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Начальный",
    prices: { monthly: 149, "3months": 129, "6months": 99, yearly: 79 },
    features: ["1 устройство", "Базовая скорость", "Доступ к 5 локациям"],
    isPopular: false,
  },
  {
    id: "pro",
    name: "Продвинутый",
    prices: { monthly: 299, "3months": 249, "6months": 199, yearly: 149 },
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
    prices: { monthly: 499, "3months": 399, "6months": 349, yearly: 249 },
    features: [
      "5 устройств",
      "Максимальная скорость",
      "Доступ ко всем локациям",
      "Kill Switch",
      "Выделенный IP",
      "Приоритетная поддержка",
    ],
    isPopular: false,
  },
];

export async function fetchPublicPlans(): Promise<SubscriptionPlan[]> {
  try {
    const response = await fetch(
      `${API_CONFIG.baseUrl}/subscriptions/public-plans`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as SubscriptionPlan[];
    return data;
  } catch {
    return [];
  }
}

export function getLowestDisplayedPlanPrice(plans: SubscriptionPlan[]): number {
  const prices = plans.flatMap((plan) =>
    Object.values(plan.prices).filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    ),
  );

  return prices.length > 0 ? Math.min(...prices) : 0;
}
