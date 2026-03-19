/**
 * @fileoverview Subscription routes: public plan listing and authenticated purchase.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";

const PERIOD_DAYS: Record<string, number> = {
  monthly: 30,
  "3months": 90,
  "6months": 180,
  yearly: 365,
};

async function listPublicPlans() {
  const plans = await db.subscriptionPlan.findMany({
    where: { isActive: true },
    include: { prices: true },
    orderBy: { sortOrder: "asc" },
  });

  return plans.map((plan) => {
    const priceMap: Record<string, number> = {};
    plan.prices.forEach((priceItem) => {
      priceMap[priceItem.period] = priceItem.price;
    });

    return {
      id: plan.slug,
      name: plan.name,
      prices: priceMap,
      features: plan.features,
      isPopular: plan.isPopular,
    };
  });
}

const publicSubscriptionRoutes = new Elysia({ prefix: "/subscriptions" })
  .get("/plans", async () => listPublicPlans())
  .get("/public-plans", async () => listPublicPlans());

const privateSubscriptionRoutes = new Elysia({ prefix: "/subscriptions" })
  .use(authMiddleware)
  .post(
    "/purchase",
    async ({ user, body, set }) => {
      try {
        const { planId: slug, period } = body;

        const plan = await db.subscriptionPlan.findUnique({
          where: { slug, isActive: true },
          include: { prices: true },
        });

        if (!plan) {
          set.status = 404;
          return { message: "Plan not found" };
        }

        const priceItem = plan.prices.find((item) => item.period === period);
        if (!priceItem) {
          set.status = 400;
          return { message: "Invalid billing period" };
        }

        const days = PERIOD_DAYS[period];
        if (!days) {
          set.status = 400;
          return { message: "Invalid billing period" };
        }

        const pricePerMonth = priceItem.price;
        const months = days / 30;
        const baseTotalPrice = pricePerMonth * months;

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

        if (fixedDiscount > 0) {
          discountedPrice = Math.max(0, discountedPrice - fixedDiscount);
        }
        if (pctDiscount > 0) {
          discountedPrice = discountedPrice * (1 - pctDiscount / 100);
        }
        const totalPrice = Math.max(1, Math.round(discountedPrice * 100) / 100);

        if (dbUser.balance < totalPrice) {
          set.status = 402;
          return { message: "Insufficient balance" };
        }

        const now = new Date();
        const activeUntil = new Date(
          now.getTime() + days * 24 * 60 * 60 * 1000,
        );
        const periodLabel =
          period === "monthly"
            ? "1 мес."
            : period === "3months"
              ? "3 мес."
              : period === "6months"
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
            fixedDiscount > 0 || pctDiscount > 0 ? " (скидка)" : "";

          await tx.transaction.create({
            data: {
              userId: user.userId,
              type: "subscription",
              amount: -totalPrice,
              title: `Подписка "${plan.name}" на ${periodLabel}${discountNote}`,
            },
          });

          const subscription = await tx.subscription.upsert({
            where: { userId: user.userId },
            update: { planId: plan.slug, planName: plan.name, activeUntil },
            create: {
              userId: user.userId,
              planId: plan.slug,
              planName: plan.name,
              activeUntil,
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
      } catch (err) {
        console.error("[Subscriptions] Purchase error:", err);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        planId: t.String(),
        period: t.String(),
      }),
    },
  );

export const subscriptionRoutes = new Elysia()
  .use(publicSubscriptionRoutes)
  .use(privateSubscriptionRoutes);
