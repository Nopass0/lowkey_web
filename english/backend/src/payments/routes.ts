import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db } from "../db";
import { config } from "../config";
import { createPayment, handleWebhook } from "./yokassa";
import { nanoid } from "nanoid";

async function getUser(headers: any, jwtInstance: any, set: any) {
  const token = headers.authorization?.replace("Bearer ", "");
  if (!token) { set.status = 401; throw new Error("Unauthorized"); }
  const payload = await jwtInstance.verify(token);
  if (!payload) { set.status = 401; throw new Error("Invalid token"); }
  return db.findOne("EnglishUsers", [db.filter.eq("id", (payload as any).userId)]);
}

export const paymentsRoutes = new Elysia({ prefix: "/payments" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  .get("/plans", async () => {
    return db.findMany("EnglishSubscriptionPlans", {
      filters: [db.filter.eq("isActive", true)],
      sort: [{ field: "price", direction: "asc" }],
    });
  })

  .post("/subscribe", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }

    const plan = await db.findOne("EnglishSubscriptionPlans", [db.filter.eq("id", body.planId)]);
    if (!plan) { set.status = 404; return { error: "Plan not found" }; }

    const payment = await db.create("EnglishPayments", {
      userId: user.id,
      planId: plan.id,
      amount: plan.price,
      currency: plan.currency || "RUB",
      status: "pending",
      description: `LowKey English — ${plan.name}`,
    });

    const idempotencyKey = nanoid();
    const yokassaPayment = await createPayment({
      amount: plan.price,
      currency: plan.currency || "RUB",
      description: `LowKey English — ${plan.name}`,
      returnUrl: `${config.frontendUrl}/payment/success?paymentId=${payment.id}`,
      metadata: {
        userId: user.id,
        planId: plan.id,
        paymentDbId: payment.id,
      },
      idempotencyKey,
    });

    await db.update("EnglishPayments", payment.id, {
      yokassaPaymentId: yokassaPayment.id,
    });

    return {
      paymentId: payment.id,
      confirmationUrl: yokassaPayment.confirmation?.confirmation_url,
    };
  }, {
    body: t.Object({ planId: t.String() }),
  })

  .post("/webhook", async ({ body, set }) => {
    try {
      await handleWebhook(body);
      return { success: true };
    } catch (e) {
      console.error("[Payments] Webhook error:", e);
      set.status = 500;
      return { error: "Webhook processing failed" };
    }
  })

  .get("/history", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    return db.findMany("EnglishPayments", {
      filters: [db.filter.eq("userId", user.id)],
      sort: [{ field: "createdAt", direction: "desc" }],
    });
  })

  .get("/subscription", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    const sub = await db.findOne("EnglishSubscriptions", [
      db.filter.eq("userId", user.id),
      db.filter.eq("status", "active"),
    ]);
    if (!sub) return { active: false };
    const plan = sub.planId ? await db.findOne("EnglishSubscriptionPlans", [db.filter.eq("id", sub.planId)]) : null;
    return { active: true, subscription: sub, plan };
  });
