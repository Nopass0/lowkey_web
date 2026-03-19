import { API_CONFIG } from "@/api/config";
import type { SubscriptionPlan } from "@/api/types";

export const fallbackPlans: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Начальный",
    prices: { monthly: 199, "3months": 169, "6months": 149, yearly: 129 },
    features: ["1 устройство", "Базовая скорость"],
    isPopular: false,
  },
  {
    id: "pro",
    name: "Продвинутый",
    prices: { monthly: 349, "3months": 299, "6months": 249, yearly: 199 },
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
    prices: { monthly: 549, "3months": 469, "6months": 399, yearly: 299 },
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
    return data.length > 0 ? data : fallbackPlans;
  } catch {
    return fallbackPlans;
  }
}

export function getLowestDisplayedPlanPrice(plans: SubscriptionPlan[]): number {
  const prices = plans.flatMap((plan) =>
    Object.values(plan.prices).filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    ),
  );

  return prices.length > 0 ? Math.min(...prices) : 129;
}
