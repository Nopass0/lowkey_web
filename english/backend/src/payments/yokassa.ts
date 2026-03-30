import { config } from "../config";
import { db } from "../db";

const YOKASSA_API = "https://api.yookassa.ru/v3";

function getCredentials() {
  if (config.yokassa.testMode) {
    return { shopId: config.yokassa.testShopId, secret: config.yokassa.testSecret };
  }
  return { shopId: config.yokassa.shopId, secret: config.yokassa.secret };
}

function getAuthHeader(): string {
  const { shopId, secret } = getCredentials();
  return "Basic " + Buffer.from(`${shopId}:${secret}`).toString("base64");
}

export async function createPayment(opts: {
  amount: number;
  currency?: string;
  description: string;
  returnUrl: string;
  metadata?: Record<string, string>;
  idempotencyKey: string;
}) {
  const res = await fetch(`${YOKASSA_API}/payments`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": opts.idempotencyKey,
    },
    body: JSON.stringify({
      amount: { value: opts.amount.toFixed(2), currency: opts.currency || "RUB" },
      confirmation: { type: "redirect", return_url: opts.returnUrl },
      description: opts.description,
      metadata: opts.metadata || {},
      capture: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YooKassa error: ${res.status} ${text}`);
  }

  return res.json();
}

export async function getPayment(paymentId: string) {
  const res = await fetch(`${YOKASSA_API}/payments/${paymentId}`, {
    headers: { Authorization: getAuthHeader() },
  });
  if (!res.ok) throw new Error(`YooKassa error: ${res.status}`);
  return res.json();
}

export async function handleWebhook(event: any) {
  if (event.type !== "payment.succeeded") return;

  const payment = event.object;
  const metadata = payment.metadata || {};
  const userId = metadata.userId;
  const planId = metadata.planId;
  const paymentDbId = metadata.paymentDbId;

  if (!userId || !planId) return;

  // Update payment record
  if (paymentDbId) {
    await db.update("EnglishPayments", paymentDbId, {
      status: "succeeded",
      yokassaPaymentId: payment.id,
    });
  }

  // Get plan
  const plan = await db.findOne("EnglishSubscriptionPlans", [db.filter.eq("id", planId)]);
  if (!plan) return;

  // Create or extend subscription
  const now = new Date();
  const endsAt = new Date(now.getTime() + plan.intervalDays * 86400000);

  const existingSub = await db.findOne("EnglishSubscriptions", [
    db.filter.eq("userId", userId),
    db.filter.eq("status", "active"),
  ]);

  if (existingSub) {
    const currentEnd = new Date(existingSub.endsAt);
    const newEnd = currentEnd > now
      ? new Date(currentEnd.getTime() + plan.intervalDays * 86400000)
      : endsAt;
    await db.update("EnglishSubscriptions", existingSub.id, {
      endsAt: newEnd.toISOString(),
      paymentId: payment.id,
    });
    await db.update("EnglishUsers", userId, {
      isPremium: true,
      premiumUntil: newEnd.toISOString(),
    });
  } else {
    await db.create("EnglishSubscriptions", {
      userId,
      planId,
      status: "active",
      startsAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
      paymentId: payment.id,
      autoRenew: true,
    });
    await db.update("EnglishUsers", userId, {
      isPremium: true,
      premiumUntil: endsAt.toISOString(),
    });
  }
}
