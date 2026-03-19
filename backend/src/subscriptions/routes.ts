/**
 * @fileoverview Subscription routes: public listing and balance purchase.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { verifyJwt } from "../auth/jwt";
import { redis } from "../redis";
import { getYKSettings } from "../payments/yokassa";

const PERIOD_DAYS: Record<string, number> = {
  monthly: 30,
  "3months": 90,
  "6months": 180,
  yearly: 365,
};

async function listPublicPlans() {
  const [plans, ykSettings] = await Promise.all([
    db.subscriptionPlan.findMany({
      where: { isActive: true },
      include: { prices: true },
      orderBy: { sortOrder: "asc" },
    }),
    getYKSettings(),
  ]);

  const items = plans.map((plan) => {
    const priceMap: Record<string, number> = {};
    for (const price of plan.prices) {
      priceMap[price.period] = price.price;
    }

    return {
      id: plan.slug,
      name: plan.name,
      prices: priceMap,
      features: plan.features,
      isPopular: plan.isPopular,
      promoActive: plan.promoActive,
      promoPrice: plan.promoPrice,
      promoLabel: plan.promoLabel,
    };
  });

  if (ykSettings.testSubscriptionEnabled) {
    items.unshift({
      id: "test-subscription",
      name: "Тестовая подписка",
      prices: { monthly: 10, "3months": 10, "6months": 10, yearly: 10 },
      features: ["Автосписание 10 ₽ каждые 2 минуты", "Тестовый сценарий YooKassa"],
      isPopular: false,
      promoActive: false,
      promoPrice: null,
      promoLabel: "TEST",
    });
  }

  return items;
}

const publicSubscriptionRoutes = new Elysia({ prefix: "/subscriptions" })
  .get("/plans", async () => listPublicPlans())
  .get("/public-plans", async () => listPublicPlans());

const privateSubscriptionRoutes = new Elysia({ prefix: "/subscriptions" }).post(
  "/purchase",
  async ({ headers, body, set }) => {
    try {
      const token = headers.authorization?.replace("Bearer ", "");
      if (!token) {
        set.status = 401;
        return { message: "Unauthorized" };
      }

      const user = await verifyJwt(token);
      if (!user) {
        set.status = 401;
        return { message: "Invalid token" };
      }

      const blocked = await redis.get(`token:blocklist:${user.jti}`);
      if (blocked) {
        set.status = 401;
        return { message: "Token revoked" };
      }

      const isTestSubscription = body.planId === "test-subscription";
      const plan = isTestSubscription
        ? null
        : await db.subscriptionPlan.findFirst({
            where: { slug: body.planId, isActive: true },
            include: { prices: true },
          });

      if (!plan && !isTestSubscription) {
        set.status = 404;
        return { message: "Plan not found" };
      }

      const days = isTestSubscription ? 0 : PERIOD_DAYS[body.period];
      if (!isTestSubscription && !days) {
        set.status = 400;
        return { message: "Invalid billing period" };
      }

      const priceItem = isTestSubscription
        ? { price: 10 }
        : plan?.prices.find((item) => item.period === body.period);

      if (!priceItem) {
        set.status = 400;
        return { message: "Invalid billing period" };
      }

      const months =
        body.period === "3months" ? 3 : body.period === "6months" ? 6 : body.period === "yearly" ? 12 : 1;
      const baseTotalPrice = isTestSubscription ? 10 : priceItem.price * months;

      const dbUser = await db.user.findUnique({
        where: { id: user.userId },
        select: {
          balance: true,
          referredById: true,
          pendingDiscountPct: true,
          pendingDiscountFixed: true,
        },
      });

      if (!dbUser) {
        set.status = 404;
        return { message: "User not found" };
      }

      const fixedDiscount = dbUser.pendingDiscountFixed ?? 0;
      const pctDiscount = dbUser.pendingDiscountPct ?? 0;
      let discountedPrice = baseTotalPrice;

      if (!isTestSubscription && fixedDiscount > 0) {
        discountedPrice = Math.max(0, discountedPrice - fixedDiscount);
      }

      if (!isTestSubscription && pctDiscount > 0) {
        discountedPrice = discountedPrice * (1 - pctDiscount / 100);
      }

      const totalPrice = Math.max(
        1,
        Math.round((isTestSubscription ? 10 : discountedPrice) * 100) / 100,
      );

      if (dbUser.balance < totalPrice) {
        set.status = 402;
        return { message: "Insufficient balance" };
      }

      const now = new Date();
      const activeUntil = isTestSubscription
        ? new Date(now.getTime() + 2 * 60 * 1000)
        : new Date(now.getTime() + (days ?? 30) * 24 * 60 * 60 * 1000);
      const planName = isTestSubscription ? "Тестовая подписка" : plan!.name;
      const planId = isTestSubscription ? "test-subscription" : plan!.slug;
      const periodLabel = isTestSubscription
        ? "2 мин."
        : body.period === "monthly"
          ? "1 мес."
          : body.period === "3months"
            ? "3 мес."
            : body.period === "6months"
              ? "6 мес."
              : "1 год";

      const result = await db.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: user.userId },
          data: {
            balance: { decrement: totalPrice },
            pendingDiscountPct: 0,
            pendingDiscountFixed: 0,
          },
        });

        const discountNote =
          !isTestSubscription && (fixedDiscount > 0 || pctDiscount > 0)
            ? " (скидка)"
            : "";

        await tx.transaction.create({
          data: {
            userId: user.userId,
            type: "subscription",
            amount: -totalPrice,
            title: `${isTestSubscription ? "[TEST] " : ""}Подписка "${planName}" на ${periodLabel}${discountNote}`,
            isTest: isTestSubscription,
          },
        });

        const subscription = await tx.subscription.upsert({
          where: { userId: user.userId },
          update: {
            planId,
            planName,
            activeUntil,
            billingPeriod: isTestSubscription ? "test_2m" : body.period,
            autoRenewal: Boolean(body.autoRenewPaymentMethodId),
            autoRenewPaymentMethodId: body.autoRenewPaymentMethodId ?? null,
          },
          create: {
            userId: user.userId,
            planId,
            planName,
            activeUntil,
            billingPeriod: isTestSubscription ? "test_2m" : body.period,
            autoRenewal: Boolean(body.autoRenewPaymentMethodId),
            autoRenewPaymentMethodId: body.autoRenewPaymentMethodId ?? null,
          },
        });

        if (dbUser.referredById) {
          const referrer = await tx.user.findUnique({
            where: { id: dbUser.referredById },
            select: { referralRate: true },
          });
          const rate = referrer?.referralRate ?? 0.2;
          const commission = totalPrice * rate;

          await tx.user.update({
            where: { id: dbUser.referredById },
            data: { referralBalance: { increment: commission } },
          });

          await tx.transaction.create({
            data: {
              userId: dbUser.referredById,
              type: "referral_earning",
              amount: commission,
              title: "Реферальное начисление",
            },
          });
        }

        return {
          subscription: {
            planId: subscription.planId,
            planName: subscription.planName,
            activeUntil: subscription.activeUntil.toISOString(),
            isLifetime: subscription.isLifetime,
          },
          newBalance: updatedUser.balance,
          originalPrice: baseTotalPrice,
          finalPrice: totalPrice,
          discountApplied: baseTotalPrice !== totalPrice,
        };
      });

      return result;
    } catch (error) {
      console.error("[Subscriptions] Purchase error:", error);
      set.status = 500;
      return { message: "Internal server error" };
    }
  },
  {
    body: t.Object({
      planId: t.String(),
      period: t.String(),
      autoRenewPaymentMethodId: t.Optional(t.Union([t.String(), t.Null()])),
    }),
  },
);

export const subscriptionRoutes = new Elysia()
  .use(publicSubscriptionRoutes)
  .use(privateSubscriptionRoutes);
