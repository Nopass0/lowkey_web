import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import cron from "node-cron";
import { mkdir } from "fs/promises";
import { config } from "./config";
import { authRoutes } from "./auth/routes";
import { cardsRoutes } from "./cards/routes";
import { aiRoutes } from "./ai/routes";
import { recordingsRoutes } from "./recordings/routes";
import { gamesRoutes } from "./games/routes";
import { paymentsRoutes } from "./payments/routes";
import { adminRoutes } from "./admin/routes";
import { progressRoutes } from "./progress/routes";
import { initBot, sendDailyReminders, getBot } from "./telegram/bot";
import { db } from "./db";

await mkdir(config.uploadsDir, { recursive: true });
await mkdir(`${config.uploadsDir}/recordings`, { recursive: true });

async function seedPlans() {
  const existing = await db.findMany("EnglishSubscriptionPlans", { limit: 1 });
  if (existing.length > 0) {
    return;
  }

  await db.create("EnglishSubscriptionPlans", {
    name: "Premium Monthly",
    slug: "premium-monthly",
    description: "Full access to all LowKey English features for 30 days.",
    price: 299,
    currency: "RUB",
    intervalDays: 30,
    features: [
      "Unlimited flashcards",
      "AI flashcard generation",
      "OpenRouter AI generation",
      "Pronunciation analysis",
      "Bulk generation from text",
      "Priority support",
    ],
    isActive: true,
  });

  await db.create("EnglishSubscriptionPlans", {
    name: "Premium Yearly",
    slug: "premium-yearly",
    description: "Full access for 365 days with the best yearly price.",
    price: 1999,
    currency: "RUB",
    intervalDays: 365,
    features: [
      "Unlimited flashcards",
      "AI flashcard generation",
      "OpenRouter AI generation",
      "Pronunciation analysis",
      "Bulk generation from text",
      "Priority support",
      "Exclusive vocabulary packs",
    ],
    isActive: true,
  });

  console.log("[seed] subscription plans created");
}

const app = new Elysia()
  .use(cors({
    origin: config.corsOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }))
  .use(staticPlugin({ assets: config.uploadsDir, prefix: "/uploads" }))
  .get("/health", () => ({
    status: "ok",
    service: "english-backend",
    ts: new Date().toISOString(),
  }))
  .post("/telegram/webhook", async ({ body }) => {
    const bot = getBot();
    if (!bot) {
      return { ok: false };
    }

    try {
      await bot.handleUpdate(body as any);
    } catch (error) {
      console.error("[telegram] webhook error:", error);
    }

    return { ok: true };
  })
  .use(authRoutes)
  .use(cardsRoutes)
  .use(aiRoutes)
  .use(recordingsRoutes)
  .use(gamesRoutes)
  .use(paymentsRoutes)
  .use(adminRoutes)
  .use(progressRoutes)
  .onError(({ error, set }) => {
    console.error("[error]", error);
    const message = error instanceof Error ? error.message : "Internal server error";

    if (message === "Unauthorized") {
      set.status = 401;
      return { error: message };
    }

    if (message === "Forbidden") {
      set.status = 403;
      return { error: message };
    }

    if (message === "Not found") {
      set.status = 404;
      return { error: message };
    }

    set.status = 500;
    return { error: message };
  })
  .listen({ hostname: config.host, port: config.port });

await seedPlans().catch(console.error);
await initBot().catch(console.error);

cron.schedule("0 9 * * *", () => {
  sendDailyReminders().catch(console.error);
}, { timezone: "Europe/Moscow" });

cron.schedule("0 19 * * *", () => {
  sendDailyReminders().catch(console.error);
}, { timezone: "Europe/Moscow" });

console.log(`\n[english-backend] listening on http://${config.host}:${config.port}`);
