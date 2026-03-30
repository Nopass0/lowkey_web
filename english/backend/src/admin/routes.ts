import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db } from "../db";
import { config } from "../config";
import { getPublicAiSettings, saveAiSettings } from "../ai/settings";

async function getAdmin(headers: any, jwtInstance: any, set: any) {
  const token = headers.authorization?.replace("Bearer ", "");
  if (!token) { set.status = 401; throw new Error("Unauthorized"); }
  const payload = await jwtInstance.verify(token);
  if (!payload) { set.status = 401; throw new Error("Invalid token"); }
  const user = await db.findOne("EnglishUsers", [db.filter.eq("id", (payload as any).userId)]);
  if (!user) { set.status = 404; throw new Error("Not found"); }
  if (user.role !== "admin") { set.status = 403; throw new Error("Forbidden"); }
  return user;
}

export const adminRoutes = new Elysia({ prefix: "/admin" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  .get("/stats", async ({ headers, jwt, set }) => {
    await getAdmin(headers, jwt, set);
    const [totalUsers, premiumUsers, totalCards, totalPayments] = await Promise.all([
      db.count("EnglishUsers"),
      db.count("EnglishUsers", [db.filter.eq("isPremium", true)]),
      db.count("EnglishCards"),
      db.count("EnglishPayments", [db.filter.eq("status", "succeeded")]),
    ]);
    const payments = await db.findMany("EnglishPayments", {
      filters: [db.filter.eq("status", "succeeded")],
      limit: 1000,
    });
    const totalRevenue = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);

    const today = new Date().toISOString().split("T")[0];
    const todayProgress = await db.findMany("EnglishProgress", {
      filters: [db.filter.eq("date", today)],
      limit: 1000,
    });
    const activeToday = todayProgress.length;

    return { totalUsers, premiumUsers, totalCards, totalPayments, totalRevenue, activeToday };
  })

  .get("/ai-settings", async ({ headers, jwt, set }) => {
    await getAdmin(headers, jwt, set);
    return getPublicAiSettings();
  })

  .patch("/ai-settings", async ({ headers, body, jwt, set }) => {
    await getAdmin(headers, jwt, set);
    return saveAiSettings(body);
  }, {
    body: t.Object({
      apiKey: t.Optional(t.String()),
      clearApiKey: t.Optional(t.Boolean()),
      model: t.Optional(t.String()),
      baseUrl: t.Optional(t.String()),
      siteUrl: t.Optional(t.String()),
      siteName: t.Optional(t.String()),
      temperature: t.Optional(t.Number()),
      maxTokens: t.Optional(t.Number()),
    }),
  })

  .get("/users", async ({ headers, query, jwt, set }) => {
    await getAdmin(headers, jwt, set);
    const users = await db.findMany("EnglishUsers", {
      sort: [{ field: "createdAt", direction: "desc" }],
      limit: parseInt(query.limit || "50"),
      offset: parseInt(query.offset || "0"),
    });
    return users.map((u: any) => { const { passwordHash: _, ...safe } = u; return safe; });
  })

  .get("/users/:id", async ({ headers, params, jwt, set }) => {
    await getAdmin(headers, jwt, set);
    const user = await db.findOne("EnglishUsers", [db.filter.eq("id", params.id)]);
    if (!user) { set.status = 404; return { error: "Not found" }; }
    const { passwordHash: _, ...safe } = user;
    const [cardCount, sessionCount, payments] = await Promise.all([
      db.count("EnglishCards", [db.filter.eq("userId", params.id)]),
      db.count("EnglishStudySessions", [db.filter.eq("userId", params.id)]),
      db.findMany("EnglishPayments", { filters: [db.filter.eq("userId", params.id)], limit: 20 }),
    ]);
    return { ...safe, cardCount, sessionCount, payments };
  })

  .patch("/users/:id", async ({ headers, params, body, jwt, set }) => {
    await getAdmin(headers, jwt, set);
    return db.update("EnglishUsers", params.id, body);
  }, {
    body: t.Object({
      role: t.Optional(t.String()),
      isPremium: t.Optional(t.Boolean()),
      premiumUntil: t.Optional(t.String()),
      level: t.Optional(t.String()),
    }),
  })

  // Subscription plans management
  .get("/plans", async ({ headers, jwt, set }) => {
    await getAdmin(headers, jwt, set);
    return db.findMany("EnglishSubscriptionPlans", {
      sort: [{ field: "price", direction: "asc" }],
    });
  })
  .post("/plans", async ({ headers, body, jwt, set }) => {
    await getAdmin(headers, jwt, set);
    return db.create("EnglishSubscriptionPlans", body);
  }, {
    body: t.Object({
      name: t.String(),
      slug: t.String(),
      description: t.String(),
      price: t.Number(),
      currency: t.Optional(t.String()),
      intervalDays: t.Number(),
      features: t.Array(t.String()),
      isActive: t.Optional(t.Boolean()),
    }),
  })
  .patch("/plans/:id", async ({ headers, params, body, jwt, set }) => {
    await getAdmin(headers, jwt, set);
    return db.update("EnglishSubscriptionPlans", params.id, body);
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      description: t.Optional(t.String()),
      price: t.Optional(t.Number()),
      intervalDays: t.Optional(t.Number()),
      features: t.Optional(t.Array(t.String())),
      isActive: t.Optional(t.Boolean()),
    }),
  })

  // Revenue stats
  .get("/revenue", async ({ headers, query, jwt, set }) => {
    await getAdmin(headers, jwt, set);
    const days = parseInt(query.days || "30");
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const payments = await db.findMany("EnglishPayments", {
      filters: [db.filter.eq("status", "succeeded"), db.filter.gte("createdAt", from)],
      sort: [{ field: "createdAt", direction: "desc" }],
      limit: 1000,
    });
    const byDay: Record<string, number> = {};
    for (const p of payments) {
      const day = new Date(p.createdAt).toISOString().split("T")[0];
      byDay[day] = (byDay[day] || 0) + (p.amount || 0);
    }
    return {
      total: payments.reduce((s: number, p: any) => s + (p.amount || 0), 0),
      count: payments.length,
      byDay,
    };
  })

  // Broadcast message via Telegram
  .post("/broadcast", async ({ headers, body, jwt, set }) => {
    await getAdmin(headers, jwt, set);
    const { message, premiumOnly } = body;
    const filters: any[] = [db.filter.eq("isActive", true)];
    const links = await db.findMany("EnglishTelegramLinks", { filters, limit: 10000 });
    let sent = 0;

    // Import bot dynamically to avoid circular deps
    const { getBot } = await import("../telegram/bot");
    const bot = getBot();
    if (!bot) { set.status = 503; return { error: "Bot not initialized" }; }

    for (const link of links) {
      try {
        if (premiumOnly) {
          const user = await db.findOne("EnglishUsers", [db.filter.eq("id", link.userId)]);
          if (!user?.isPremium) continue;
        }
        await bot.api.sendMessage(link.telegramId, message, { parse_mode: "Markdown" });
        sent++;
        await new Promise(r => setTimeout(r, 50)); // rate limit
      } catch {}
    }
    return { sent };
  }, {
    body: t.Object({ message: t.String(), premiumOnly: t.Optional(t.Boolean()) }),
  });
