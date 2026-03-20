/**
 * @fileoverview YooKassa payment routes.
 * Supports top-ups, saved cards, auto-renew wiring, refunds, and webhooks.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";
import { config } from "../config";
import { sendTelegramMessage } from "../telegram";
import {
  activatePromoSubscription,
  autoPurchaseSubscription,
  buildYKReceipt,
  createAutoPayment,
  createYKPayment,
  createYKRefund,
  getYKPayment,
  isYKTestMode,
  onYKPaymentSuccess,
  type YKPaymentMethod,
  type YKPaymentResponse,
  type YKWebhookEvent,
} from "./yokassa";

const YOKASSA_RETURN_URL = `${config.SITE_URL}/me/billing`;

function getMetadataValue(
  metadata: unknown,
  key: string,
): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

async function savePaymentMethod(userId: string, method: YKPaymentMethod) {
  const existing = await db.paymentMethod.findUnique({
    where: { yokassaMethodId: method.id },
  });

  if (existing) {
    return existing;
  }

  const hasMethods = await db.paymentMethod.count({ where: { userId } });
  const expMonth = method.card?.expiry_month
    ? Number.parseInt(method.card.expiry_month, 10)
    : null;
  const expYear = method.card?.expiry_year
    ? Number.parseInt(method.card.expiry_year, 10)
    : null;

  return db.paymentMethod.create({
    data: {
      userId,
      yokassaMethodId: method.id,
      type: method.type,
      title:
        method.title ??
        (method.card
          ? `${method.card.card_type ?? "Карта"} •••• ${method.card.last4}`
          : "Банковская карта"),
      cardLast4: method.card?.last4 ?? null,
      cardBrand: method.card?.card_type ?? null,
      cardExpMonth: expMonth,
      cardExpYear: expYear,
      isDefault: hasMethods === 0,
    },
  });
}

async function notifyTelegramSubscriptionPurchased(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      telegramId: true,
      subscription: {
        select: {
          planName: true,
          activeUntil: true,
          autoRenewal: true,
        },
      },
    },
  });

  if (!user?.telegramId || !user.subscription) {
    return;
  }

  const nextChargeText = user.subscription.autoRenewal
    ? `Следующее списание: ${user.subscription.activeUntil.toLocaleString("ru-RU")}`
    : `Подписка активна до: ${user.subscription.activeUntil.toLocaleString("ru-RU")}`;

  await sendTelegramMessage({
    chatId: user.telegramId.toString(),
    text:
      `✅ Подписка "${user.subscription.planName}" оформлена.\n\n${nextChargeText}`,
    buttonText: "Моя подписка",
    callbackData: "menu_profile",
  }).catch((error) => {
    console.error("[telegram] subscription notification failed", error);
  });
}

async function handleCompletedYKPayment(
  paymentId: string,
  ykPayment: YKPaymentResponse,
) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    return;
  }

  const purpose = getMetadataValue(payment.metadata, "purpose") ?? "topup";

  if (purpose === "topup" || purpose === "subscription_topup") {
    await onYKPaymentSuccess(payment.id);

    const shouldAutoRenew = getMetadataValue(payment.metadata, "subscriptionPlanId");
    if (ykPayment.payment_method?.saved) {
      const saved = await savePaymentMethod(payment.userId, ykPayment.payment_method);
      if (shouldAutoRenew) {
        await db.subscription.updateMany({
          where: { userId: payment.userId },
          data: {
            autoRenewal: true,
            autoRenewPaymentMethodId: saved.id,
            billingPeriod:
              getMetadataValue(payment.metadata, "subscriptionPeriod") ?? "monthly",
          },
        });
      }
    }

    if (shouldAutoRenew) {
      await notifyTelegramSubscriptionPurchased(payment.userId);
    }
    return;
  }

  if (purpose === "link_card") {
    let savedMethodId: string | null = null;
    if (ykPayment.payment_method?.saved) {
      const savedMethod = await savePaymentMethod(payment.userId, ykPayment.payment_method);
      savedMethodId = savedMethod.id;
    }

    await db.$transaction(async (tx) => {
      const current = await tx.payment.findUnique({
        where: { id: payment.id },
        select: { creditedAt: true },
      });
      if (current?.creditedAt) {
        return;
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "success",
          creditedAt: new Date(),
        },
      });

      await tx.user.update({
        where: { id: payment.userId },
        data: { balance: { increment: payment.amount } },
      });

      await tx.transaction.create({
        data: {
          userId: payment.userId,
          type: "topup",
          amount: payment.amount,
          title: `${payment.isTest ? "[TEST] " : ""}Возврат за привязку карты`,
          isTest: payment.isTest,
          paymentId: payment.id,
        },
      });
    });

    const planId = getMetadataValue(payment.metadata, "subscriptionPlanId");
    const period = getMetadataValue(payment.metadata, "subscriptionPeriod");
    if (planId && period && savedMethodId) {
      await autoPurchaseSubscription(
        payment.userId,
        planId,
        period,
        savedMethodId,
        payment.isTest,
      );
      await notifyTelegramSubscriptionPurchased(payment.userId);
    }
    return;
  }

  if (purpose === "promo_subscribe") {
    const planSlug = getMetadataValue(payment.metadata, "planSlug");
    if (planSlug) {
      const saved = ykPayment.payment_method?.saved
        ? await savePaymentMethod(payment.userId, ykPayment.payment_method)
        : null;

      await activatePromoSubscription({
        userId: payment.userId,
        planSlug,
        paymentMethodId: saved?.id ?? null,
        isTest: payment.isTest,
      });

      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: "success",
          creditedAt: new Date(),
        },
      });
      await notifyTelegramSubscriptionPurchased(payment.userId);
    }
    return;
  }

    if (purpose === "autorenew") {
    const planSlug = getMetadataValue(payment.metadata, "subscriptionPlanId");
    const period = getMetadataValue(payment.metadata, "subscriptionPeriod") ?? "monthly";
    const paymentMethodId =
      getMetadataValue(payment.metadata, "autoRenewPaymentMethodId") ?? null;

    if (planSlug) {
      await autoPurchaseSubscription(payment.userId, planSlug, period, paymentMethodId);
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: "success",
          creditedAt: new Date(),
        },
      });
    }
  }
}

export const yokassaPaymentRoutes = new Elysia({ prefix: "/yokassa" })
  .use(authMiddleware)
  .get("/cards", async ({ user }) => {
    return db.paymentMethod.findMany({
      where: { userId: user.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  })
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
        return { message: "Минимальная сумма пополнения 10 ₽" };
      }

      const isTest = await isYKTestMode();
      const metadata: Record<string, string> = {
        userId: user.userId,
        purpose: subscriptionPlanId ? "subscription_topup" : "topup",
      };

      if (subscriptionPlanId) {
        metadata.subscriptionPlanId = subscriptionPlanId;
        metadata.subscriptionPeriod = subscriptionPeriod ?? "monthly";
      }

      let paymentMethodDbId: string | undefined;
      let ykPayment;

      try {
        if (cardMethodId) {
          const method = await db.paymentMethod.findFirst({
            where: { id: cardMethodId, userId: user.userId },
          });

          if (!method) {
            set.status = 404;
            return { message: "Карта не найдена" };
          }

          paymentMethodDbId = method.id;
          metadata.autoRenewPaymentMethodId = method.id;

          ykPayment = await createAutoPayment(
            user.userId,
            method.yokassaMethodId,
            amount,
            `${isTest ? "[TEST] " : ""}Пополнение баланса lowkey`,
            metadata,
          );
        } else {
          const receipt = await buildYKReceipt(
            user.userId,
            amount,
            "Пополнение баланса lowkey",
            "full_prepayment",
          );
          ykPayment = await createYKPayment(
            {
              amount: { value: amount.toFixed(2), currency: "RUB" },
              payment_method_type: paymentType,
              capture: true,
              save_payment_method:
                paymentType === "bank_card" || paymentType === "sbp",
              description: `${isTest ? "[TEST] " : ""}Пополнение баланса lowkey`,
              confirmation: {
                type: "redirect",
                return_url: YOKASSA_RETURN_URL,
              },
              metadata,
              ...(receipt ? { receipt } : {}),
            },
            crypto.randomUUID(),
          );
        }
      } catch (error) {
        console.error("[YK] topup create error:", error);
        set.status = 500;
        return {
          message:
            error instanceof Error ? error.message : "Ошибка создания платежа",
        };
      }

      const payment = await db.payment.create({
        data: {
          userId: user.userId,
          yokassaPaymentId: ykPayment.id,
          amount,
          status:
            ykPayment.status === "succeeded"
              ? "success"
              : ykPayment.status === "canceled"
                ? "failed"
                : "pending",
          provider: "yokassa",
          paymentType,
          confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
          description: `${isTest ? "[TEST] " : ""}Пополнение на ${amount} ₽`,
          metadata: paymentMethodDbId
            ? { ...metadata, autoRenewPaymentMethodId: paymentMethodDbId }
            : metadata,
          isTest: ykPayment.test ?? isTest,
          expiresAt: new Date(
            ykPayment.expires_at
              ? new Date(ykPayment.expires_at).getTime()
              : Date.now() + 60 * 60 * 1000,
          ),
        },
      });

      if (ykPayment.status === "succeeded") {
        await handleCompletedYKPayment(payment.id, ykPayment);
      }

      return {
        paymentId: payment.id,
        yokassaPaymentId: ykPayment.id,
        status: ykPayment.status,
        confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
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
  .post("/link-card", async ({ user, body, set }) => {
    try {
      const isTest = await isYKTestMode();
      const receipt = await buildYKReceipt(
        user.userId,
        1,
        "Привязка карты lowkey",
        "full_prepayment",
      );
      const ykPayment = await createYKPayment(
        {
          amount: { value: "1.00", currency: "RUB" },
          payment_method_type: "bank_card",
          capture: true,
          save_payment_method: true,
          description: `${isTest ? "[TEST] " : ""}Привязка карты lowkey`,
          confirmation: {
            type: "redirect",
            return_url: `${YOKASSA_RETURN_URL}?linked=1`,
          },
          metadata: {
            userId: user.userId,
            purpose: "link_card",
            ...(body.subscriptionPlanId
              ? {
                  subscriptionPlanId: body.subscriptionPlanId,
                  subscriptionPeriod: body.subscriptionPeriod ?? "monthly",
                }
              : {}),
          },
          ...(receipt ? { receipt } : {}),
        },
        crypto.randomUUID(),
      );

      const payment = await db.payment.create({
        data: {
          userId: user.userId,
          yokassaPaymentId: ykPayment.id,
          amount: 1,
          status: "pending",
          provider: "yokassa",
          paymentType: "link_card",
          confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
          description: `${isTest ? "[TEST] " : ""}Привязка карты`,
          metadata: {
            userId: user.userId,
            purpose: "link_card",
            ...(body.subscriptionPlanId
              ? {
                  subscriptionPlanId: body.subscriptionPlanId,
                  subscriptionPeriod: body.subscriptionPeriod ?? "monthly",
                }
              : {}),
          },
          isTest: ykPayment.test ?? isTest,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      return {
        paymentId: payment.id,
        yokassaPaymentId: ykPayment.id,
        confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
      };
    } catch (error) {
      console.error("[YK] link-card error:", error);
      set.status = 500;
      return {
        message:
          error instanceof Error ? error.message : "Ошибка привязки карты",
      };
    }
  }, {
    body: t.Optional(t.Object({
      subscriptionPlanId: t.Optional(t.String()),
      subscriptionPeriod: t.Optional(t.String()),
    })),
  })
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

      await db.paymentMethod.updateMany({
        where: { userId: user.userId },
        data: { isDefault: false },
      });

      await db.paymentMethod.update({
        where: { id: params.id },
        data: { isDefault: true },
      });

      await db.subscription.updateMany({
        where: { userId: user.userId, autoRenewal: true },
        data: { autoRenewPaymentMethodId: params.id },
      });

      return { success: true };
    },
    { params: t.Object({ id: t.String() }) },
  )
  .patch(
    "/cards/:id/auto-charge",
    async ({ user, params, body, set }) => {
      const method = await db.paymentMethod.findFirst({
        where: { id: params.id, userId: user.userId },
      });
      if (!method) {
        set.status = 404;
        return { message: "Карта не найдена" };
      }

      const updated = await db.paymentMethod.update({
        where: { id: params.id },
        data: { allowAutoCharge: body.allowAutoCharge },
      });

      if (!body.allowAutoCharge) {
        await db.subscription.updateMany({
          where: { userId: user.userId, autoRenewPaymentMethodId: params.id },
          data: { autoRenewal: false, autoRenewPaymentMethodId: null },
        });
      }

      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ allowAutoCharge: t.Boolean() }),
    },
  )
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

      await db.subscription.updateMany({
        where: { userId: user.userId, autoRenewPaymentMethodId: params.id },
        data: { autoRenewal: false, autoRenewPaymentMethodId: null },
      });

      await db.paymentMethod.delete({ where: { id: params.id } });
      return { success: true };
    },
    { params: t.Object({ id: t.String() }) },
  )
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

      if (payment.status !== "pending" || !payment.yokassaPaymentId) {
        return {
          paymentId: payment.id,
          status: payment.status,
          amount: payment.amount,
          isTest: payment.isTest,
        };
      }

      try {
        const ykPayment = await getYKPayment(payment.yokassaPaymentId);

        if (ykPayment.status === "succeeded") {
          await handleCompletedYKPayment(payment.id, ykPayment);
          return {
            paymentId: payment.id,
            status: "success",
            amount: payment.amount,
            isTest: payment.isTest,
          };
        }

        if (ykPayment.status === "canceled") {
          await db.payment.update({
            where: { id: payment.id },
            data: { status: "failed" },
          });
          return {
            paymentId: payment.id,
            status: "failed",
            amount: payment.amount,
            isTest: payment.isTest,
          };
        }
      } catch (error) {
        console.error("[YK] status check error:", error);
      }

      return {
        paymentId: payment.id,
        status: "pending",
        amount: payment.amount,
        isTest: payment.isTest,
      };
    },
    { params: t.Object({ id: t.String() }) },
  )
  .post(
    "/subscribe-promo",
    async ({ user, body, set }) => {
      const plan = await db.subscriptionPlan.findUnique({
        where: { slug: body.planSlug },
      });

      if (!plan || !plan.isActive || !plan.promoActive || plan.promoPrice == null) {
        set.status = 400;
        return { message: "Промо для тарифа недоступно" };
      }

      const isTest = await isYKTestMode();

      try {
        const receipt = await buildYKReceipt(
          user.userId,
          plan.promoPrice,
          `Промо-подписка ${plan.name}`,
          "full_prepayment",
        );
        const ykPayment = await createYKPayment(
          {
            amount: { value: plan.promoPrice.toFixed(2), currency: "RUB" },
            payment_method_type: "bank_card",
            capture: true,
            save_payment_method: true,
            description: `${isTest ? "[TEST] " : ""}${plan.promoLabel ?? "Промо"}: ${plan.name}`,
            confirmation: {
              type: "redirect",
              return_url: `${YOKASSA_RETURN_URL}?subscribed=1`,
            },
            metadata: {
              userId: user.userId,
              purpose: "promo_subscribe",
              planSlug: body.planSlug,
              nextBillingPeriod: "monthly",
            },
            ...(receipt ? { receipt } : {}),
          },
          crypto.randomUUID(),
        );

        const payment = await db.payment.create({
          data: {
            userId: user.userId,
            yokassaPaymentId: ykPayment.id,
            amount: plan.promoPrice,
            status: "pending",
            provider: "yokassa",
            paymentType: "promo_subscribe",
            confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
            description: `${isTest ? "[TEST] " : ""}Промо-подписка "${plan.name}"`,
            metadata: {
              userId: user.userId,
              purpose: "promo_subscribe",
              planSlug: body.planSlug,
              nextBillingPeriod: "monthly",
            },
            isTest: ykPayment.test ?? isTest,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        });

        return {
          paymentId: payment.id,
          yokassaPaymentId: ykPayment.id,
          confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
          promoAmount: plan.promoPrice,
          promoLabel: plan.promoLabel ?? null,
        };
      } catch (error) {
        console.error("[YK] subscribe-promo error:", error);
        set.status = 500;
        return {
          message:
            error instanceof Error ? error.message : "Ошибка создания платежа",
        };
      }
    },
    {
      body: t.Object({
        planSlug: t.String(),
        period: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/refunds/:id",
    async ({ user, params, set }) => {
      const payment = await db.payment.findFirst({
        where: {
          id: params.id,
          userId: user.userId,
          status: "success",
          provider: "yokassa",
        },
      });

      if (!payment) {
        set.status = 404;
        return { message: "Платёж не найден" };
      }

      if (!payment.yokassaPaymentId || payment.refundedAt) {
        set.status = 400;
        return { message: "Возврат для платежа недоступен" };
      }

      const purpose = getMetadataValue(payment.metadata, "purpose") ?? "topup";
      if (purpose !== "topup") {
        set.status = 400;
        return { message: "Возврат доступен только для обычного пополнения баланса" };
      }

      if (Date.now() - payment.createdAt.getTime() > 2 * 60 * 60 * 1000) {
        set.status = 400;
        return { message: "С момента пополнения прошло более 2 часов" };
      }

      const subscriptionSpend = await db.transaction.findFirst({
        where: {
          userId: user.userId,
          type: "subscription",
          createdAt: { gte: payment.createdAt },
        },
      });

      if (subscriptionSpend) {
        set.status = 400;
        return { message: "После пополнения уже была оплачена подписка с баланса" };
      }

      const currentUser = await db.user.findUnique({
        where: { id: user.userId },
        select: { balance: true },
      });

      if (!currentUser || currentUser.balance < payment.amount) {
        set.status = 400;
        return { message: "Возврат невозможен: средства уже израсходованы" };
      }

      const refundAmount = Math.round(payment.amount * 0.7 * 100) / 100;

      try {
        const refundReceipt = await buildYKReceipt(
          user.userId,
          refundAmount,
          "Возврат пополнения баланса lowkey",
          "full_payment",
        );
        await createYKRefund(
          payment.yokassaPaymentId,
          refundAmount,
          `Возврат пополнения lowkey (${refundAmount} ₽ после комиссии 30%)`,
          refundReceipt,
        );

        await db.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user.userId },
            data: { balance: { decrement: payment.amount } },
          });

          await tx.payment.update({
            where: { id: payment.id },
            data: {
              refundedAt: new Date(),
              refundAmount,
              refundReason: "Возврат с удержанием комиссии 30%",
            },
          });

          await tx.transaction.create({
            data: {
              userId: user.userId,
              type: "withdrawal",
              amount: -payment.amount,
              title: `${payment.isTest ? "[TEST] " : ""}Возврат пополнения (${refundAmount} ₽ на карту, комиссия 30%)`,
              isTest: payment.isTest,
              paymentId: payment.id,
            },
          });
        });

        return { success: true, refundAmount };
      } catch (error) {
        console.error("[YK] refund error:", error);
        set.status = 500;
        return {
          message:
            error instanceof Error ? error.message : "Ошибка возврата средств",
        };
      }
    },
    { params: t.Object({ id: t.String() }) },
  );

export const yokassaWebhookRoute = new Elysia().post(
  "/yokassa-notify",
  async ({ body, set }) => {
    try {
      const event = body as YKWebhookEvent;
      const ykId = event?.object?.id;

      if (!event?.type || !ykId) {
        set.status = 400;
        return { ok: false };
      }

      const payment = await db.payment.findFirst({
        where: { yokassaPaymentId: ykId },
      });

      if (!payment) {
        return { ok: true };
      }

      if (event.type === "payment.succeeded" && event.object.status === "succeeded") {
        await handleCompletedYKPayment(payment.id, event.object);
      }

      if (event.type === "payment.canceled" && event.object.status === "canceled") {
        await db.payment.update({
          where: { id: payment.id },
          data: { status: "failed" },
        });
      }

      if (event.type === "refund.succeeded") {
        await db.payment.updateMany({
          where: { yokassaPaymentId: ykId },
          data: { refundedAt: new Date() },
        });
      }

      return { ok: true };
    } catch (error) {
      console.error("[YK webhook] error:", error);
      set.status = 500;
      return { ok: false };
    }
  },
);
