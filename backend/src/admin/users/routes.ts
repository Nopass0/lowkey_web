/**
 * @fileoverview Admin user management routes.
 * All routes require admin authentication.
 */

import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";

/**
 * Admin users routes group.
 * Provides user listing, ban toggle, and subscription management.
 */
export const adminUserRoutes = new Elysia({ prefix: "/admin/users" })
  .use(adminMiddleware)

  // ─── GET /admin/users ──────────────────────────────────
  .get(
    "/",
    async ({ query, set }) => {
      try {
        const page = parseInt(query.page ?? "1");
        const pageSize = parseInt(query.pageSize ?? "8");
        const skip = (page - 1) * pageSize;
        const search = query.search ?? "";

        const where = search
          ? { login: { contains: search, mode: "insensitive" as const } }
          : {};

        const [users, total] = await Promise.all([
          db.user.findMany({
            where,
            include: {
              subscription: true,
              _count: { select: { devices: true } },
            },
            orderBy: { joinedAt: "desc" },
            skip,
            take: pageSize,
          }),
          db.user.count({ where }),
        ]);

        return {
          items: users.map((u: any) => ({
            id: u.id,
            login: u.login,
            balance: u.balance,
            referralBalance: u.referralBalance,
            isBanned: u.isBanned,
            plan: u.subscription?.planId ?? null,
            activeUntil: u.subscription?.activeUntil.toISOString() ?? null,
            joinedAt: u.joinedAt.toISOString(),
            deviceCount: u._count.devices,
          })),
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    },
  )

  // ─── PATCH /admin/users/:id/ban ────────────────────────
  .patch(
    "/:id/ban",
    async ({ params, body, set }) => {
      try {
        const updated = await db.user.update({
          where: { id: params.id },
          data: { isBanned: body.isBanned },
          include: {
            subscription: true,
            _count: { select: { devices: true } },
          },
        });

        return {
          id: updated.id,
          login: updated.login,
          balance: updated.balance,
          referralBalance: updated.referralBalance,
          isBanned: updated.isBanned,
          plan: updated.subscription?.planId ?? null,
          activeUntil: updated.subscription?.activeUntil.toISOString() ?? null,
          joinedAt: updated.joinedAt.toISOString(),
          deviceCount: updated._count.devices,
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ isBanned: t.Boolean() }),
    },
  )

  // ─── PATCH /admin/users/:id/subscription ───────────────
  .patch(
    "/:id/subscription",
    async ({ params, body, set }) => {
      try {
        if (body.plan === null) {
          // Remove subscription
          await db.subscription.deleteMany({
            where: { userId: params.id },
          });
        } else {
          const planNames: Record<string, string> = {
            starter: "Начальный",
            pro: "Продвинутый",
            advanced: "Максимальный",
          };

          await db.subscription.upsert({
            where: { userId: params.id },
            update: {
              planId: body.plan,
              planName: planNames[body.plan] ?? body.plan,
              activeUntil: body.activeUntil
                ? new Date(body.activeUntil)
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
            create: {
              userId: params.id,
              planId: body.plan,
              planName: planNames[body.plan] ?? body.plan,
              activeUntil: body.activeUntil
                ? new Date(body.activeUntil)
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });
        }

        const updated = await db.user.findUnique({
          where: { id: params.id },
          include: {
            subscription: true,
            _count: { select: { devices: true } },
          },
        });

        if (!updated) {
          set.status = 404;
          return { message: "User not found" };
        }

        return {
          id: updated.id,
          login: updated.login,
          balance: updated.balance,
          referralBalance: updated.referralBalance,
          isBanned: updated.isBanned,
          plan: updated.subscription?.planId ?? null,
          activeUntil: updated.subscription?.activeUntil.toISOString() ?? null,
          joinedAt: updated.joinedAt.toISOString(),
          deviceCount: updated._count.devices,
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        plan: t.Union([t.String(), t.Null()]),
        activeUntil: t.Union([t.String(), t.Null()]),
      }),
    },
  )

  // ─── PATCH /admin/users/:id/balance ──────────────────────
  .patch(
    "/:id/balance",
    async ({ params, body, set }) => {
      try {
        const updated = await db.user.update({
          where: { id: params.id },
          data: {
            balance: body.balance,
            referralBalance: body.referralBalance,
          },
          include: {
            subscription: true,
            _count: { select: { devices: true } },
          },
        });

        return {
          id: updated.id,
          login: updated.login,
          balance: updated.balance,
          referralBalance: updated.referralBalance,
          isBanned: updated.isBanned,
          plan: updated.subscription?.planId ?? null,
          activeUntil: updated.subscription?.activeUntil.toISOString() ?? null,
          joinedAt: updated.joinedAt.toISOString(),
          deviceCount: updated._count.devices,
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        balance: t.Number(),
        referralBalance: t.Number(),
      }),
    },
  )
  // ─── GET /admin/users/:id/stats ──────────────────────────
  .get(
    "/:id/stats",
    async ({ params, query, set }) => {
      try {
        const userId = params.id;
        const startDate = query.startDate
          ? new Date(query.startDate)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = query.endDate ? new Date(query.endDate) : new Date();

        const user = await db.user.findUnique({
          where: { id: userId },
          include: {
            subscription: true,
            _count: { select: { referrals: true, devices: true } },
          },
        });

        if (!user) {
          set.status = 404;
          return { message: "User not found" };
        }

        // Get daily referrals
        const referrals = await db.user.findMany({
          where: {
            referredById: userId,
            joinedAt: { gte: startDate, lte: endDate },
          },
          select: { joinedAt: true },
        });

        // Get transactions for the period
        const transactions = await db.transaction.findMany({
          where: {
            userId,
            createdAt: { gte: startDate, lte: endDate },
          },
          orderBy: { createdAt: "desc" },
        });

        // Group by day helper
        const dailyStats: Record<
          string,
          { referrals: number; referralEarnings: number; topups: number }
        > = {};

        // Initialize days
        const curr = new Date(startDate);
        while (curr <= endDate) {
          const day = curr.toISOString().split("T")[0];
          dailyStats[day] = { referrals: 0, referralEarnings: 0, topups: 0 };
          curr.setDate(curr.getDate() + 1);
        }

        referrals.forEach((r) => {
          const day = r.joinedAt.toISOString().split("T")[0];
          if (dailyStats[day]) dailyStats[day].referrals++;
        });

        transactions.forEach((t) => {
          const day = t.createdAt.toISOString().split("T")[0];
          if (dailyStats[day]) {
            if (t.type === "referral_earning")
              dailyStats[day].referralEarnings += t.amount;
            if (t.type === "topup") dailyStats[day].topups += t.amount;
          }
        });

        return {
          user: {
            id: user.id,
            login: user.login,
            balance: user.balance,
            referralBalance: user.referralBalance,
            isBanned: user.isBanned,
            plan: user.subscription?.planId ?? null,
            activeUntil: user.subscription?.activeUntil.toISOString() ?? null,
            joinedAt: user.joinedAt.toISOString(),
            referralCount: user._count.referrals,
            deviceCount: user._count.devices,
          },
          dailyStats: Object.entries(dailyStats)
            .map(([date, stats]) => ({
              date,
              ...stats,
            }))
            .sort((a, b) => a.date.localeCompare(b.date)),
          transactions: transactions.map((t) => ({
            id: t.id,
            type: t.type,
            amount: t.amount,
            title: t.title,
            createdAt: t.createdAt.toISOString(),
          })),
        };
      } catch (err) {
        console.error("[AdminUserStats] Error:", err);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
    },
  );
