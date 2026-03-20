/**
 * @fileoverview YooKassa gateway helpers.
 * Centralizes credentials, payment/refund calls, test-mode flags, and
 * post-payment actions such as balance crediting and auto-purchase.
 */

import { config } from "../config";
import { db } from "../db";

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
  receipt?: YKReceipt;
}

export interface YKReceipt {
  customer: {
    email: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    amount: YKPaymentAmount;
    vat_code: number;
    payment_mode: "full_prepayment" | "full_payment";
    payment_subject: "service";
  }>;
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
  test?: boolean;
}

export interface YKRefundResponse {
  id: string;
  status: "pending" | "succeeded" | "canceled";
  amount: YKPaymentAmount;
  payment_id: string;
  created_at: string;
  description?: string;
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

type YKMode = "test" | "production";

const PERIOD_MS: Record<string, number> = {
  monthly: 30 * 24 * 60 * 60 * 1000,
  "3months": 90 * 24 * 60 * 60 * 1000,
  "6months": 180 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
  test_2m: 2 * 60 * 1000,
};

export async function getYKSettings() {
  return db.yokassaSettings.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global", mode: "test", testSubscriptionEnabled: false },
  });
}

export async function getYKMode(): Promise<YKMode> {
  const settings = await getYKSettings();
  return settings.mode === "production" ? "production" : "test";
}

export async function isYKTestMode(): Promise<boolean> {
  return (await getYKMode()) === "test";
}

export async function getYKCredentials(): Promise<{
  mode: YKMode;
  shopId: string;
  secret: string;
}> {
  const mode = await getYKMode();
  const creds =
    mode === "production"
      ? {
          shopId: config.YOKASSA_SHOP_ID,
          secret: config.YOKASSA_SECRET,
        }
      : {
          shopId: config.YOKASSA_TEST_SHOP_ID,
          secret: config.YOKASSA_TEST_SECRET,
        };

  if (!creds.shopId || !creds.secret) {
    throw new Error(
      mode === "production"
        ? "YooKassa production credentials are not configured"
        : "YooKassa test credentials are not configured",
    );
  }

  return { mode, ...creds };
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
    const raw = await res.text();
    throw new Error(`YooKassa ${method} ${path} -> ${res.status}: ${raw}`);
  }

  return res.json() as Promise<T>;
}

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

export async function getYKPayment(
  paymentId: string,
): Promise<YKPaymentResponse> {
  return ykRequest<YKPaymentResponse>("GET", `/payments/${paymentId}`);
}

export async function createYKRefund(
  paymentId: string,
  amount: number,
  description: string,
  receipt?: YKReceipt,
): Promise<YKRefundResponse> {
  return ykRequest<YKRefundResponse>(
    "POST",
    "/refunds",
    {
      payment_id: paymentId,
      amount: { value: amount.toFixed(2), currency: "RUB" },
      description,
      ...(receipt ? { receipt } : {}),
    },
    crypto.randomUUID(),
  );
}

export async function getYKPaymentMethod(
  methodId: string,
): Promise<YKPaymentMethod> {
  return ykRequest<YKPaymentMethod>("GET", `/payment_methods/${methodId}`);
}

export async function createAutoPayment(
  userId: string,
  methodId: string,
  amount: number,
  description: string,
  metadata?: Record<string, string>,
): Promise<YKPaymentResponse> {
  const receipt = await buildYKReceipt(userId, amount, description, "full_prepayment");
  return createYKPayment(
    {
      amount: { value: amount.toFixed(2), currency: "RUB" },
      payment_method_id: methodId,
      capture: true,
      description,
      metadata,
      ...(receipt ? { receipt } : {}),
    },
    crypto.randomUUID(),
  );
}

async function getReceiptEmail(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { login: true },
  });

  const login = user?.login?.trim();
  if (login && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) {
    return login;
  }

  return config.YOKASSA_RECEIPT_EMAIL;
}

export async function buildYKReceipt(
  userId: string,
  amount: number,
  description: string,
  paymentMode: "full_prepayment" | "full_payment" = "full_prepayment",
): Promise<YKReceipt | undefined> {
  const mode = await getYKMode();
  if (mode !== "production") {
    return undefined;
  }

  const email = await getReceiptEmail(userId);
  return {
    customer: { email },
    items: [
      {
        description: description.slice(0, 128),
        quantity: 1,
        amount: { value: amount.toFixed(2), currency: "RUB" },
        vat_code: 1,
        payment_mode: paymentMode,
        payment_subject: "service",
      },
    ],
  };
}

export function getRenewalPeriodMs(period: string) {
  return PERIOD_MS[period] ?? PERIOD_MS.monthly;
}

function getPromoDurationMs(count: number, unit: string) {
  const safeCount = Math.max(1, Number.isFinite(count) ? count : 1);
  if (unit === "day") {
    return safeCount * 24 * 60 * 60 * 1000;
  }
  if (unit === "week") {
    return safeCount * 7 * 24 * 60 * 60 * 1000;
  }
  return safeCount * 30 * 24 * 60 * 60 * 1000;
}

async function grantSubscriptionAccess(params: {
  userId: string;
  planSlug: string;
  planName: string;
  transactionAmount: number;
  transactionTitle: string;
  activeUntil: Date;
  billingPeriod: string;
  paymentMethodId?: string | null;
  isTest: boolean;
  debitBalance: boolean;
  incrementPromoUsed?: boolean;
}) {
  await db.$transaction(async (tx) => {
    if (params.debitBalance) {
      await tx.user.update({
        where: { id: params.userId },
        data: { balance: { decrement: params.transactionAmount } },
      });
    }

    await tx.transaction.create({
      data: {
        userId: params.userId,
        type: "subscription",
        amount: -params.transactionAmount,
        title: `${params.isTest ? "[TEST] " : ""}${params.transactionTitle}`,
        isTest: params.isTest,
      },
    });

    await tx.subscription.upsert({
      where: { userId: params.userId },
      update: {
        planId: params.planSlug,
        planName: params.planName,
        activeUntil: params.activeUntil,
        autoRenewal: Boolean(params.paymentMethodId),
        billingPeriod: params.billingPeriod,
        autoRenewPaymentMethodId: params.paymentMethodId ?? null,
      },
      create: {
        userId: params.userId,
        planId: params.planSlug,
        planName: params.planName,
        activeUntil: params.activeUntil,
        autoRenewal: Boolean(params.paymentMethodId),
        billingPeriod: params.billingPeriod,
        autoRenewPaymentMethodId: params.paymentMethodId ?? null,
      },
    });

    if (params.incrementPromoUsed) {
      await tx.subscriptionPlan.updateMany({
        where: { slug: params.planSlug },
        data: { promoUsed: { increment: 1 } },
      });
    }
  });
}

export async function getSubscriptionCharge(
  planSlug: string,
  period: string,
  isTestSubscription: boolean,
) {
  if (isTestSubscription || period === "test_2m") {
    return { amount: 10, title: "Тестовая подписка" };
  }

  const plan = await db.subscriptionPlan.findFirst({
    where: { slug: planSlug, isActive: true },
    include: { prices: true },
  });

  if (!plan) {
    throw new Error("Plan not found");
  }

  const priceItem = plan.prices.find((item) => item.period === period);
  if (!priceItem) {
    throw new Error("Invalid billing period");
  }

  const months =
    period === "3months" ? 3 : period === "6months" ? 6 : period === "yearly" ? 12 : 1;

  return {
    amount: Math.round(priceItem.price * months * 100) / 100,
    title: plan.name,
  };
}

export async function onYKPaymentSuccess(paymentId: string) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (payment.creditedAt) {
    return;
  }

  const metadata = (payment.metadata as Record<string, string> | null) ?? {};
  const purpose = metadata.purpose ?? "topup";

  await db.$transaction(async (tx) => {
    const current = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { creditedAt: true },
    });

    if (current?.creditedAt) {
      return;
    }

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: "success",
        creditedAt: new Date(),
      },
    });

    if (purpose === "topup" || purpose === "subscription_topup") {
      await tx.user.update({
        where: { id: payment.userId },
        data: { balance: { increment: payment.amount } },
      });

      await tx.transaction.create({
        data: {
          userId: payment.userId,
          type: "topup",
          amount: payment.amount,
          title: `${payment.isTest ? "[TEST] " : ""}Пополнение через YooKassa на ${payment.amount} ₽`,
          isTest: payment.isTest,
          paymentId: payment.id,
        },
      });
    }
  });

  if (
    metadata.subscriptionPlanId &&
    metadata.subscriptionPeriod &&
    (purpose === "topup" || purpose === "subscription_topup")
  ) {
    await autoPurchaseSubscription(
      payment.userId,
      metadata.subscriptionPlanId,
      metadata.subscriptionPeriod,
      metadata.autoRenewPaymentMethodId ?? null,
      payment.isTest,
    );
  }
}

export async function autoPurchaseSubscription(
  userId: string,
  planSlug: string,
  period: string,
  paymentMethodId?: string | null,
  isTestOverride?: boolean,
) {
  const isTestSubscription = period === "test_2m";
  const charge = await getSubscriptionCharge(planSlug, period, isTestSubscription);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });

  if (!user || user.balance < charge.amount) {
    throw new Error("Insufficient balance for subscription purchase");
  }

  const plan =
    isTestSubscription || planSlug === "test-subscription"
      ? { slug: "test-subscription", name: "Тестовая подписка" }
      : await db.subscriptionPlan.findFirst({
          where: { slug: planSlug, isActive: true },
          select: { slug: true, name: true },
        });

  if (!plan) {
    throw new Error("Plan not found");
  }

  const now = new Date();
  const extensionMs = getRenewalPeriodMs(period);
  const currentSubscription = await db.subscription.findUnique({
    where: { userId },
    select: { activeUntil: true },
  });
  const base = currentSubscription?.activeUntil && currentSubscription.activeUntil > now
    ? currentSubscription.activeUntil
    : now;
  const activeUntil = new Date(base.getTime() + extensionMs);
  const isTest =
    typeof isTestOverride === "boolean" ? isTestOverride : await isYKTestMode();

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: charge.amount } },
    });

    await tx.transaction.create({
      data: {
        userId,
        type: "subscription",
        amount: -charge.amount,
        title: `${isTest ? "[TEST] " : ""}Подписка "${plan.name}"`,
        isTest,
      },
    });

    await tx.subscription.upsert({
      where: { userId },
      update: {
        planId: plan.slug,
        planName: plan.name,
        activeUntil,
        autoRenewal: Boolean(paymentMethodId),
        billingPeriod: period,
        autoRenewPaymentMethodId: paymentMethodId ?? null,
      },
      create: {
        userId,
        planId: plan.slug,
        planName: plan.name,
        activeUntil,
        autoRenewal: Boolean(paymentMethodId),
        billingPeriod: period,
        autoRenewPaymentMethodId: paymentMethodId ?? null,
      },
    });
  });
}

export async function activatePromoSubscription(params: {
  userId: string;
  planSlug: string;
  paymentMethodId?: string | null;
  isTest: boolean;
}) {
  const plan = await db.subscriptionPlan.findFirst({
    where: { slug: params.planSlug, isActive: true, promoActive: true },
    select: {
      slug: true,
      name: true,
      promoPrice: true,
      promoDurationCount: true,
      promoDurationUnit: true,
      promoMaxUses: true,
      promoUsed: true,
    },
  });

  if (!plan || plan.promoPrice == null) {
    throw new Error("Promo plan not found");
  }

  if (plan.promoMaxUses != null && plan.promoUsed >= plan.promoMaxUses) {
    throw new Error("Promo is no longer available");
  }

  const now = new Date();
  const currentSubscription = await db.subscription.findUnique({
    where: { userId: params.userId },
    select: { activeUntil: true },
  });
  const base =
    currentSubscription?.activeUntil && currentSubscription.activeUntil > now
      ? currentSubscription.activeUntil
      : now;
  const activeUntil = new Date(
    base.getTime() +
      getPromoDurationMs(
        plan.promoDurationCount ?? 1,
        plan.promoDurationUnit ?? "month",
      ),
  );

  await grantSubscriptionAccess({
    userId: params.userId,
    planSlug: plan.slug,
    planName: plan.name,
    transactionAmount: plan.promoPrice,
    transactionTitle: `РђРєС†РёСЏ "${plan.name}"`,
    activeUntil,
    billingPeriod: "monthly",
    paymentMethodId: params.paymentMethodId,
    isTest: params.isTest,
    debitBalance: false,
    incrementPromoUsed: true,
  });
}

export async function processAutoRenewals() {
  const settings = await getYKSettings();
  const now = new Date();
  const dueSubscriptions = await db.subscription.findMany({
    where: {
      autoRenewal: true,
      activeUntil: { lte: now },
      autoRenewPaymentMethodId: { not: null },
    },
    take: 25,
  });

  for (const subscription of dueSubscriptions) {
    try {
      const method = await db.paymentMethod.findFirst({
        where: {
          id: subscription.autoRenewPaymentMethodId ?? undefined,
          userId: subscription.userId,
          allowAutoCharge: true,
        },
      });

      if (!method) {
        await db.subscription.update({
          where: { userId: subscription.userId },
          data: { autoRenewal: false },
        });
        continue;
      }

      const isTestSubscription =
        settings.testSubscriptionEnabled && subscription.planId === "test-subscription";
      const period = isTestSubscription ? "test_2m" : subscription.billingPeriod;
      const charge = await getSubscriptionCharge(
        subscription.planId,
        period,
        isTestSubscription,
      );
      const isTest = await isYKTestMode();

      const ykPayment = await createAutoPayment(
        subscription.userId,
        method.yokassaMethodId,
        charge.amount,
        `${isTest ? "[TEST] " : ""}Автопродление ${subscription.planName}`,
        {
          userId: subscription.userId,
          purpose: "autorenew",
          subscriptionPlanId: subscription.planId,
          subscriptionPeriod: period,
          autoRenewPaymentMethodId: method.id,
        },
      );

      await db.payment.create({
        data: {
          userId: subscription.userId,
          yokassaPaymentId: ykPayment.id,
          amount: charge.amount,
          status: ykPayment.status === "succeeded" ? "success" : "pending",
          provider: "yokassa",
          paymentType: "autorenew",
          confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
          description: `${isTest ? "[TEST] " : ""}Автопродление ${subscription.planName}`,
          metadata: {
            userId: subscription.userId,
            purpose: "autorenew",
            subscriptionPlanId: subscription.planId,
            subscriptionPeriod: period,
            autoRenewPaymentMethodId: method.id,
          },
          isTest,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          creditedAt: ykPayment.status === "succeeded" ? new Date() : null,
        },
      });

      if (ykPayment.status === "succeeded") {
        const extensionMs = getRenewalPeriodMs(period);
        await db.transaction.create({
          data: {
            userId: subscription.userId,
            type: "subscription",
            amount: -charge.amount,
            title: `${isTest ? "[TEST] " : ""}Автопродление "${subscription.planName}"`,
            isTest,
          },
        });

        await db.subscription.update({
          where: { userId: subscription.userId },
          data: {
            activeUntil: new Date(now.getTime() + extensionMs),
            billingPeriod: period,
          },
        });
      }
    } catch (error) {
      console.error("[YK] auto-renew failed:", subscription.userId, error);
    }
  }
}
