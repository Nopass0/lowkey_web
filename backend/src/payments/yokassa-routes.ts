/**
 * @fileoverview YooKassa payment routes.
 * Handles card/SBP/T-Pay top-up, card binding, unlink, webhook.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";
import { config } from "../config";
import {
  createYKPayment,
  getYKPayment,
  onYKPaymentSuccess,
  type YKWebhookEvent,
} from "./yokassa";

const YOKASSA_RETURN_URL = `${config.SITE_URL}/me/billing`;

// ─── User-facing routes (require auth) ────────────────────────────────────

export const yokassaPaymentRoutes = new Elysia({ prefix: "/yokassa" })
  .use(authMiddleware)

  // ─── GET /yokassa/cards ─────────────────────────────────────
  .get("/cards", async ({ user }) => {
    const methods = await db.paymentMethod.findMany({
      where: { userId: user.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return methods;
  })

  // ─── POST /yokassa/topup ────────────────────────────────────
  /**
   * Create a payment for balance top-up.
   * paymentType: "bank_card" | "sbp" | "tinkoff_bank"
   * If cardMethodId is provided, charge a saved card directly.
   */
  .post(
    "/topup",
    async ({ user, body, set }) => {
      const {
        amount,
        paymentType = "bank_card",
        cardMethodId,
        subscriptionPlanId,
        subscriptionPeriod,
      } = body;

      if (amount < 10) {
        set.status = 400;
        return { message: "Minimum amount is 10 RUB" };
      }

      const idempotencyKey = crypto.randomUUID();
      const metadata: Record<string, string> = {
        userId: user.userId,
        purpose: "topup",
      };
      if (subscriptionPlanId) metadata.subscriptionPlanId = subscriptionPlanId;
      if (subscriptionPeriod) metadata.subscriptionPeriod = subscriptionPeriod;

      let paymentData;
      try {
        if (cardMethodId) {
          // Charge a saved card
          const dbMethod = await db.paymentMethod.findFirst({
            where: { id: cardMethodId, userId: user.userId },
          });
          if (!dbMethod) {
            set.status = 404;
            return { message: "Payment method not found" };
          }
          paymentData = await createYKPayment(
            {
              amount: { value: amount.toFixed(2), currency: "RUB" },
              payment_method_id: dbMethod.yokassaMethodId,
              capture: true,
              description: `Пополнение баланса lowkey VPN`,
              metadata,
            },
            idempotencyKey,
          );
        } else {
          paymentData = await createYKPayment(
            {
              amount: { value: amount.toFixed(2), currency: "RUB" },
              payment_method_type:
                paymentType === "bank_card"
                  ? "bank_card"
                  : paymentType === "sbp"
                    ? "sbp"
                    : "tinkoff_bank",
              capture: true,
              save_payment_method: paymentType === "bank_card",
              description: `Пополнение баланса lowkey VPN`,
              confirmation: {
                type: "redirect",
                return_url: YOKASSA_RETURN_URL,
              },
              metadata,
            },
            idempotencyKey,
          );
        }
      } catch (err) {
        console.error("[YK] topup create error:", err);
        set.status = 500;
        return { message: "Ошибка создания платежа" };
      }

      const expiresAt = new Date(
        paymentData.expires_at
          ? new Date(paymentData.expires_at).getTime()
          : Date.now() + 60 * 60 * 1000,
      );

      const payment = await db.payment.create({
        data: {
          userId: user.userId,
          yokassaPaymentId: paymentData.id,
          amount,
          status: "pending",
          provider: "yokassa",
          paymentType,
          confirmationUrl:
            paymentData.confirmation?.confirmation_url ?? null,
          description: `Пополнение баланса на ${amount} ₽`,
          metadata,
          expiresAt,
        },
      });

      return {
        paymentId: payment.id,
        yokassaPaymentId: paymentData.id,
        status: paymentData.status,
        confirmationUrl: paymentData.confirmation?.confirmation_url ?? null,
        amount,
      };
    },
    {
      body: t.Object({
        amount: t.Number(),
        paymentType: t.Optional(
          t.Union([
            t.Literal("bank_card"),
            t.Literal("sbp"),
            t.Literal("tinkoff_bank"),
          ]),
        ),
        cardMethodId: t.Optional(t.String()),
        subscriptionPlanId: t.Optional(t.String()),
        subscriptionPeriod: t.Optional(t.String()),
      }),
    },
  )

  // ─── POST /yokassa/link-card ─────────────────────────────────
  /**
   * Create a 1 RUB payment to bind a card (will be refunded automatically by YooKassa).
   * Actually we just create a small payment with save_payment_method=true.
   */
  .post("/link-card", async ({ user, set }) => {
    const idempotencyKey = crypto.randomUUID();
    try {
      const paymentData = await createYKPayment(
        {
          amount: { value: "1.00", currency: "RUB" },
          payment_method_type: "bank_card",
          capture: true,
          save_payment_method: true,
          description: "Привязка карты lowkey VPN",
          confirmation: {
            type: "redirect",
            return_url: `${YOKASSA_RETURN_URL}?linked=1`,
          },
          metadata: { userId: user.userId, purpose: "link_card" },
        },
        idempotencyKey,
      );

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const payment = await db.payment.create({
        data: {
          userId: user.userId,
          yokassaPaymentId: paymentData.id,
          amount: 1,
          status: "pending",
          provider: "yokassa",
          paymentType: "link_card",
          confirmationUrl: paymentData.confirmation?.confirmation_url ?? null,
          description: "Привязка карты",
          metadata: { userId: user.userId, purpose: "link_card" },
          expiresAt,
        },
      });

      return {
        paymentId: payment.id,
        yokassaPaymentId: paymentData.id,
        confirmationUrl: paymentData.confirmation?.confirmation_url,
      };
    } catch (err) {
      console.error("[YK] link-card error:", err);
      set.status = 500;
      return { message: "Ошибка привязки карты" };
    }
  })

  // ─── DELETE /yokassa/cards/:id ───────────────────────────────
  .delete(
    "/cards/:id",
    async ({ user, params, set }) => {
      const method = await db.paymentMethod.findFirst({
        where: { id: params.id, userId: user.userId },
      });
      if (!method) {
        set.status = 404;
        return { message: "Карта не найдена" };
      }
      await db.paymentMethod.delete({ where: { id: params.id } });
      return { success: true };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // ─── PATCH /yokassa/cards/:id/default ───────────────────────
  .patch(
    "/cards/:id/default",
    async ({ user, params, set }) => {
      const method = await db.paymentMethod.findFirst({
        where: { id: params.id, userId: user.userId },
      });
      if (!method) {
        set.status = 404;
        return { message: "Карта не найдена" };
      }
      // Unset all, then set this one
      await db.paymentMethod.updateMany({
        where: { userId: user.userId },
        data: { isDefault: false },
      });
      await db.paymentMethod.update({
        where: { id: params.id },
        data: { isDefault: true },
      });
      return { success: true };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // ─── GET /yokassa/payments/:id/status ───────────────────────
  .get(
    "/payments/:id/status",
    async ({ user, params, set }) => {
      const payment = await db.payment.findFirst({
        where: { id: params.id, userId: user.userId },
      });
      if (!payment) {
        set.status = 404;
        return { message: "Платёж не найден" };
      }

      if (payment.status !== "pending") {
        return {
          paymentId: payment.id,
          status: payment.status,
          amount: payment.amount,
        };
      }

      if (!payment.yokassaPaymentId) {
        return { paymentId: payment.id, status: payment.status, amount: payment.amount };
      }

      try {
        const ykPayment = await getYKPayment(payment.yokassaPaymentId);

        if (ykPayment.status === "succeeded") {
          await db.payment.update({
            where: { id: payment.id },
            data: { status: "success" },
          });

          const metadata = (payment.metadata as Record<string, string>) ?? {};
          if (metadata.purpose === "topup" || metadata.purpose === undefined) {
            await onYKPaymentSuccess(user.userId, payment.amount, metadata);
          }

          return { paymentId: payment.id, status: "success", amount: payment.amount };
        } else if (ykPayment.status === "canceled") {
          await db.payment.update({
            where: { id: payment.id },
            data: { status: "failed" },
          });
          return { paymentId: payment.id, status: "failed", amount: payment.amount };
        }
      } catch (err) {
        console.error("[YK] status check error:", err);
      }

      return { paymentId: payment.id, status: "pending", amount: payment.amount };
    },
    { params: t.Object({ id: t.String() }) },
  )

  // ─── POST /yokassa/subscribe-promo ──────────────────────────
  /**
   * Subscribe with promo price — create payment for promo amount with card binding.
   */
  .post(
    "/subscribe-promo",
    async ({ user, body, set }) => {
      const { planSlug, period } = body;

      const plan = await db.subscriptionPlan.findUnique({
        where: { slug: planSlug, isActive: true },
        include: { prices: true },
      });
      if (!plan) {
        set.status = 404;
        return { message: "Тариф не найден" };
      }
      if (!plan.promoActive || plan.promoPrice === null) {
        set.status = 400;
        return { message: "Акция на этот тариф не активна" };
      }
      if (plan.promoMaxUses && plan.promoUsed >= plan.promoMaxUses) {
        set.status = 400;
        return { message: "Акция закончилась" };
      }

      const promoAmount = plan.promoPrice;
      const idempotencyKey = crypto.randomUUID();

      try {
        const paymentData = await createYKPayment(
          {
            amount: { value: promoAmount.toFixed(2), currency: "RUB" },
            payment_method_type: "bank_card",
            capture: true,
            save_payment_method: true,
            description: `${plan.promoLabel ?? "Акция"}: тариф "${plan.name}"`,
            confirmation: {
              type: "redirect",
              return_url: `${YOKASSA_RETURN_URL}?subscribed=1`,
            },
            metadata: {
              userId: user.userId,
              purpose: "promo_subscribe",
              planSlug,
              period,
            },
          },
          idempotencyKey,
        );

        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        const payment = await db.payment.create({
          data: {
            userId: user.userId,
            yokassaPaymentId: paymentData.id,
            amount: promoAmount,
            status: "pending",
            provider: "yokassa",
            paymentType: "promo_subscribe",
            confirmationUrl: paymentData.confirmation?.confirmation_url ?? null,
            description: `Акционная подписка "${plan.name}"`,
            metadata: {
              userId: user.userId,
              purpose: "promo_subscribe",
              planSlug,
              period,
            },
            expiresAt,
          },
        });

        return {
          paymentId: payment.id,
          yokassaPaymentId: paymentData.id,
          confirmationUrl: paymentData.confirmation?.confirmation_url,
          promoAmount,
          promoLabel: plan.promoLabel,
        };
      } catch (err) {
        console.error("[YK] subscribe-promo error:", err);
        set.status = 500;
        return { message: "Ошибка создания акционного платежа" };
      }
    },
    {
      body: t.Object({
        planSlug: t.String(),
        period: t.String(),
      }),
    },
  );

// ─── Webhook (no auth) ─────────────────────────────────────────────────────

export const yokassaWebhookRoute = new Elysia()
  .post("/yokassa-notify", async ({ body, set }) => {
    try {
      const event = body as YKWebhookEvent;
      console.log("[YK webhook] event:", event?.type, event?.object?.id);

      if (!event?.type || !event?.object) {
        set.status = 400;
        return { ok: false };
      }

      const ykPayment = event.object;
      const ykId = ykPayment.id;

      const dbPayment = await db.payment.findFirst({
        where: { yokassaPaymentId: ykId },
      });

      if (!dbPayment) {
        console.warn("[YK webhook] Payment not found in DB:", ykId);
        return { ok: true }; // Return 200 so YK stops retrying
      }

      const metadata =
        (dbPayment.metadata as Record<string, string> | null) ?? {};
      const userId = dbPayment.userId;

      if (
        event.type === "payment.succeeded" &&
        ykPayment.status === "succeeded"
      ) {
        if (dbPayment.status !== "success") {
          await db.payment.update({
            where: { id: dbPayment.id },
            data: { status: "success" },
          });

          if (metadata.purpose === "topup") {
            await onYKPaymentSuccess(userId, dbPayment.amount, metadata);
          } else if (metadata.purpose === "promo_subscribe") {
            // Promo: activate subscription and save card
            await handlePromoSubscribeSuccess(userId, dbPayment, ykPayment, metadata);
          } else if (metadata.purpose === "link_card") {
            // Card linking: save the payment method, credit 1 rub to balance
            await handleCardLinkSuccess(userId, ykPayment);
            // Credit 1 rub so net cost is 0 for user
            await db.user.update({
              where: { id: userId },
              data: { balance: { increment: 1 } },
            });
            await db.transaction.create({
              data: {
                userId,
                type: "topup",
                amount: 1,
                title: "Возврат за привязку карты",
              },
            });
          }
        }
      } else if (
        event.type === "payment.waiting_for_capture" &&
        ykPayment.status === "waiting_for_capture"
      ) {
        // For most cases we use capture:true, but handle just in case
        await db.payment.update({
          where: { id: dbPayment.id },
          data: { status: "pending" },
        });
      } else if (
        event.type === "payment.canceled" &&
        ykPayment.status === "canceled"
      ) {
        await db.payment.update({
          where: { id: dbPayment.id },
          data: { status: "failed" },
        });
      } else if (event.type === "payment_method.active") {
        // Saved card is ready — store it
        const pm = ykPayment.payment_method;
        if (pm?.saved) {
          await savePaymentMethod(userId, pm);
        }
      }

      return { ok: true };
    } catch (err) {
      console.error("[YK webhook] error:", err);
      set.status = 500;
      return { ok: false };
    }
  });

// ─── Helpers ───────────────────────────────────────────────────────────────

async function handleCardLinkSuccess(
  userId: string,
  ykPayment: import("./yokassa").YKPaymentResponse,
) {
  const pm = ykPayment.payment_method;
  if (pm?.saved) {
    await savePaymentMethod(userId, pm);
  }
}

async function savePaymentMethod(
  userId: string,
  pm: import("./yokassa").YKPaymentMethod,
) {
  const existing = await db.paymentMethod.findUnique({
    where: { yokassaMethodId: pm.id },
  });
  if (existing) return existing;

  const hasDefault = await db.paymentMethod.count({
    where: { userId },
  });

  const cardLast4 = pm.card?.last4 ?? null;
  const cardBrand = pm.card?.card_type ?? null;
  const expMonth = pm.card?.expiry_month
    ? parseInt(pm.card.expiry_month, 10)
    : null;
  const expYear = pm.card?.expiry_year
    ? parseInt(pm.card.expiry_year, 10)
    : null;

  return db.paymentMethod.create({
    data: {
      userId,
      yokassaMethodId: pm.id,
      type: pm.type,
      title:
        pm.title ??
        (pm.card
          ? `${pm.card.card_type ?? "Карта"} •••• ${pm.card.last4}`
          : "Банковская карта"),
      cardLast4,
      cardBrand,
      cardExpMonth: expMonth,
      cardExpYear: expYear,
      isDefault: hasDefault === 0,
    },
  });
}

const PERIOD_DAYS: Record<string, number> = {
  monthly: 30,
  "3months": 90,
  "6months": 180,
  yearly: 365,
};

async function handlePromoSubscribeSuccess(
  userId: string,
  dbPayment: { id: string; amount: number },
  ykPayment: import("./yokassa").YKPaymentResponse,
  metadata: Record<string, string>,
) {
  const { planSlug, period } = metadata;
  if (!planSlug || !period) return;

  const plan = await db.subscriptionPlan.findUnique({
    where: { slug: planSlug, isActive: true },
  });
  if (!plan) return;

  const days = PERIOD_DAYS[period];
  if (!days) return;

  const now = new Date();
  const activeUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  await db.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { userId },
      update: {
        planId: plan.slug,
        planName: plan.name,
        activeUntil,
        autoRenewal: true,
      },
      create: {
        userId,
        planId: plan.slug,
        planName: plan.name,
        activeUntil,
        autoRenewal: true,
      },
    });

    await tx.transaction.create({
      data: {
        userId,
        type: "subscription",
        amount: -dbPayment.amount,
        title: `Акционная подписка "${plan.name}"`,
      },
    });

    // Increment promo usage
    await tx.subscriptionPlan.update({
      where: { id: plan.id },
      data: { promoUsed: { increment: 1 } },
    });
  });

  // Save card if provided
  const pm = ykPayment.payment_method;
  if (pm?.saved) {
    await savePaymentMethod(userId, pm);
  }
}
