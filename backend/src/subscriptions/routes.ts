/**
 * @fileoverview Subscription routes: plans listing and purchase.
 * Plans are hardcoded as they rarely change.
 *
 * Discount logic:
 * - If the user has activated a promo code with `plan_discount_pct` or
 *   `plan_discount_fixed`, those values are stored on the User model.
 * - On purchase they are applied, then reset to 0 atomically within the
 *   same Prisma transaction so each promo discount is used only once.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";

/** Duration multipliers in days for each billing period */
const PERIOD_DAYS: Record<string, number> = {
  monthly: 30,
  "3months": 90,
  "6months": 180,
  yearly: 365,
};

/** Hardcoded subscription plans with pricing */
const PLANS = [
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
    isPopular: false,
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
    isPopular: false,
  },
];

/**
 * Subscription routes group.
 * Provides plan listing (public) and purchase endpoint (authenticated).
 */
export const subscriptionRoutes = new Elysia({ prefix: "/subscriptions" })

  // ─── GET /subscriptions/plans ──────────────────────────
  /**
   * @route GET /subscriptions/plans
   * @returns {Array} All available subscription plans with prices and features.
   * @access public
   */
  .get("/plans", async () => {
    const plans = await db.subscriptionPlan.findMany({
      where: { isActive: true },
      include: { prices: true },
      orderBy: { sortOrder: "asc" },
    });

    // Transform to frontend format: { id, name, prices: { monthly: X, ... }, features, isPopular }
    return plans.map((p) => {
      const priceMap: Record<string, number> = {};
      p.prices.forEach((priceItem) => {
        priceMap[priceItem.period] = priceItem.price;
      });

      return {
        id: p.slug,
        name: p.name,
        prices: priceMap,
        features: p.features,
        isPopular: p.isPopular,
      };
    });
  })

  // ─── POST /subscriptions/purchase ──────────────────────
  .use(authMiddleware)
  /**
   * @route POST /subscriptions/purchase
   * @param {string} planId  - Plan slug: "starter" | "pro" | "advanced"
   * @param {string} period  - Billing period: "monthly" | "3months" | "6months" | "yearly"
   * @description Deducts from user balance and creates/updates subscription.
   */
  .post(
    "/purchase",
    async ({ user, body, set }) => {
      try {
        const { planId: slug, period } = body;

        // ── Validate plan in DB ────────────────────────────
        const plan = await db.subscriptionPlan.findUnique({
          where: { slug, isActive: true },
          include: { prices: true },
        });

        if (!plan) {
          set.status = 404;
          return { message: "Plan not found" };
        }

        // ── Validate period ────────────────────────────────
        const priceItem = plan.prices.find((p) => p.period === period);
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

        // ── Base price calculation ─────────────────────────
        const months = days / 30;
        const baseTotalPrice = pricePerMonth * months;

        // ── Fetch user with discount fields ────────────────
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

        // ── Apply promo discounts ──────────────────────────
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

        // ── Balance check ──────────────────────────────────
        if (dbUser.balance < totalPrice) {
          set.status = 402;
          return { message: "Insufficient balance" };
        }

        // ── Date helpers ───────────────────────────────────
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

        // ── Execute in transaction ─────────────────────────
        const result = await db.$transaction(async (tx) => {
          // 1. Deduct balance and reset promo discounts
          const updatedUser = await tx.user.update({
            where: { id: user.userId },
            data: {
              balance: { decrement: totalPrice },
              pendingDiscountPct: 0,
              pendingDiscountFixed: 0,
            },
          });

          // 2. Create transaction record
          const discountNote =
            fixedDiscount > 0 || pctDiscount > 0 ? ` (скидка)` : "";

          await tx.transaction.create({
            data: {
              userId: user.userId,
              type: "subscription",
              amount: -totalPrice,
              title: `Подписка "${plan.name}" на ${periodLabel}${discountNote}`,
            },
          });

          // 3. Upsert subscription
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

          // 4. Award referral commission
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
