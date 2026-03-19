/**
 * @fileoverview YooKassa payment gateway client.
 * Supports card payments, SBP, T-Pay, card binding, and auto-renewing subscriptions.
 */

import { config } from "../config";
import { db } from "../db";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface YKPaymentAmount {
  value: string;
  currency: "RUB";
}

export type YKPaymentMethodType =
  | "bank_card"
  | "sbp"
  | "tinkoff_bank"
  | "yoo_money"
  | "sberbank";

export interface YKConfirmation {
  type: "redirect";
  return_url: string;
}

export interface YKPaymentRequest {
  amount: YKPaymentAmount;
  payment_method_type?: YKPaymentMethodType;
  payment_method_id?: string;
  capture?: boolean;
  save_payment_method?: boolean;
  confirmation?: YKConfirmation | { type: "embedded" };
  description?: string;
  metadata?: Record<string, string>;
}

export interface YKPaymentMethod {
  id: string;
  type: YKPaymentMethodType;
  saved: boolean;
  title?: string;
  card?: {
    first6?: string;
    last4: string;
    expiry_month: string;
    expiry_year: string;
    card_type: string;
    issuer_name?: string;
  };
}

export interface YKPaymentResponse {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  amount: YKPaymentAmount;
  description?: string;
  payment_method?: YKPaymentMethod;
  confirmation?: {
    type: string;
    confirmation_url?: string;
    confirmation_token?: string;
  };
  captured_at?: string;
  created_at: string;
  expires_at?: string;
  metadata?: Record<string, string>;
  paid: boolean;
}

export interface YKWebhookEvent {
  type:
    | "payment.succeeded"
    | "payment.waiting_for_capture"
    | "payment.canceled"
    | "payment_method.active"
    | "refund.succeeded";
  event: string;
  object: YKPaymentResponse;
}

// ─── Client ────────────────────────────────────────────────────────────────

/**
 * Get current YooKassa credentials based on mode stored in DB.
 */
export async function getYKCredentials(): Promise<{
  shopId: string;
  secret: string;
}> {
  let mode = "test";
  try {
    const settings = await db.yokassaSettings.findUnique({
      where: { id: "global" },
    });
    mode = settings?.mode ?? "test";
  } catch {
    // table may not exist yet — fallback to test
  }

  if (mode === "production") {
    return {
      shopId: config.YOKASSA_SHOP_ID,
      secret: config.YOKASSA_SECRET,
    };
  }
  return {
    shopId: config.YOKASSA_TEST_SHOP_ID,
    secret: config.YOKASSA_TEST_SECRET,
  };
}

async function ykRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const { shopId, secret } = await getYKCredentials();
  const credentials = btoa(`${shopId}:${secret}`);

  const headers: Record<string, string> = {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) {
    headers["Idempotence-Key"] = idempotencyKey;
  }

  const res = await fetch(`https://api.yookassa.ru/v3${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `YooKassa ${method} ${path} -> ${res.status}: ${JSON.stringify(err)}`,
    );
  }

  return res.json() as Promise<T>;
}

/**
 * Create a YooKassa payment.
 */
export async function createYKPayment(
  payload: YKPaymentRequest,
  idempotencyKey: string,
): Promise<YKPaymentResponse> {
  return ykRequest<YKPaymentResponse>(
    "POST",
    "/payments",
    { capture: true, ...payload },
    idempotencyKey,
  );
}

/**
 * Get YooKassa payment by ID.
 */
export async function getYKPayment(paymentId: string): Promise<YKPaymentResponse> {
  return ykRequest<YKPaymentResponse>("GET", `/payments/${paymentId}`);
}

/**
 * Cancel a payment that is in waiting_for_capture state.
 */
export async function cancelYKPayment(paymentId: string): Promise<YKPaymentResponse> {
  return ykRequest<YKPaymentResponse>(
    "POST",
    `/payments/${paymentId}/cancel`,
    {},
    crypto.randomUUID(),
  );
}

/**
 * Get a saved payment method by ID.
 */
export async function getYKPaymentMethod(methodId: string): Promise<YKPaymentMethod> {
  return ykRequest<YKPaymentMethod>("GET", `/payment_methods/${methodId}`);
}

/**
 * Create a payment using a saved card (auto-payment).
 */
export async function createAutoPayment(
  methodId: string,
  amount: number,
  description: string,
  metadata?: Record<string, string>,
): Promise<YKPaymentResponse> {
  const idempotencyKey = crypto.randomUUID();
  return createYKPayment(
    {
      amount: { value: amount.toFixed(2), currency: "RUB" },
      payment_method_id: methodId,
      capture: true,
      description,
      metadata,
    },
    idempotencyKey,
  );
}

/**
 * Handle successful payment: credit user balance and optionally buy subscription.
 */
export async function onYKPaymentSuccess(
  userId: string,
  amount: number,
  metadata?: Record<string, string>,
) {
  // Credit balance
  await db.user.update({
    where: { id: userId },
    data: { balance: { increment: amount } },
  });

  await db.transaction.create({
    data: {
      userId,
      type: "topup",
      amount,
      title: `Пополнение через ЮKassa на ${amount} ₽`,
    },
  });

  // Auto-buy subscription if metadata says so
  if (metadata?.subscriptionPlanId && metadata?.subscriptionPeriod) {
    await autoPurchaseSubscription(
      userId,
      metadata.subscriptionPlanId,
      metadata.subscriptionPeriod,
    );
  }
}

const PERIOD_DAYS: Record<string, number> = {
  monthly: 30,
  "3months": 90,
  "6months": 180,
  yearly: 365,
};

async function autoPurchaseSubscription(
  userId: string,
  planSlug: string,
  period: string,
) {
  try {
    const plan = await db.subscriptionPlan.findUnique({
      where: { slug: planSlug, isActive: true },
      include: { prices: true },
    });
    if (!plan) return;

    const priceItem = plan.prices.find((p) => p.period === period);
    if (!priceItem) return;

    const days = PERIOD_DAYS[period];
    if (!days) return;

    const months = days / 30;
    const totalPrice = priceItem.price * months;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });
    if (!user || user.balance < totalPrice) return;

    const now = new Date();
    const activeUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: totalPrice } },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "subscription",
          amount: -totalPrice,
          title: `Подписка "${plan.name}"`,
        },
      });

      await tx.subscription.upsert({
        where: { userId },
        update: { planId: plan.slug, planName: plan.name, activeUntil },
        create: {
          userId,
          planId: plan.slug,
          planName: plan.name,
          activeUntil,
        },
      });
    });
  } catch (err) {
    console.error("[YK] autoPurchaseSubscription error:", err);
  }
}
