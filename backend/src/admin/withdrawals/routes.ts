/**
 * @fileoverview Admin withdrawal management routes.
 * Approve or reject referral withdrawal requests.
 */

import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";

/**
 * Admin withdrawal routes group.
 * Lists, approves, and rejects withdrawal requests.
 */
export const adminWithdrawalRoutes = new Elysia({
  prefix: "/admin/withdrawals",
})
  .use(adminMiddleware)

  // ─── GET /admin/withdrawals ────────────────────────────
  .get(
    "/",
    async ({ query, set }) => {
      try {
        const page = parseInt(query.page ?? "1");
        const pageSize = parseInt(query.pageSize ?? "6");
        const skip = (page - 1) * pageSize;

        const where: any = {};
        if (query.status) {
          where.status = query.status;
        }

        const [withdrawals, total] = await Promise.all([
          db.withdrawal.findMany({
            where,
            include: { user: { select: { login: true } } },
            orderBy: { createdAt: "desc" },
            skip,
            take: pageSize,
          }),
          db.withdrawal.count({ where }),
        ]);

        return {
          items: withdrawals.map((w) => ({
            id: w.id,
            userLogin: w.user.login,
            userId: w.userId,
            amount: w.amount,
            target: w.target,
            bank: w.bank,
            status: w.status,
            createdAt: w.createdAt.toISOString(),
            processedAt: w.processedAt?.toISOString() ?? null,
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
        status: t.Optional(t.String()),
      }),
    },
  )

  // ─── PATCH /admin/withdrawals/:id/approve ──────────────
  .patch(
    "/:id/approve",
    async ({ params, set }) => {
      try {
        const withdrawal = await db.withdrawal.findUnique({
          where: { id: params.id },
          include: { user: { select: { login: true } } },
        });

        if (!withdrawal) {
          set.status = 404;
          return { message: "Withdrawal not found" };
        }

        if (withdrawal.status !== "pending") {
          set.status = 400;
          return { message: "Withdrawal already processed" };
        }

        const updated = await db.withdrawal.update({
          where: { id: params.id },
          data: {
            status: "approved",
            processedAt: new Date(),
          },
          include: { user: { select: { login: true } } },
        });

        return {
          id: updated.id,
          userLogin: updated.user.login,
          userId: updated.userId,
          amount: updated.amount,
          target: updated.target,
          bank: updated.bank,
          status: updated.status,
          createdAt: updated.createdAt.toISOString(),
          processedAt: updated.processedAt?.toISOString() ?? null,
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )

  // ─── PATCH /admin/withdrawals/:id/reject ───────────────
  .patch(
    "/:id/reject",
    async ({ params, set }) => {
      try {
        const withdrawal = await db.withdrawal.findUnique({
          where: { id: params.id },
        });

        if (!withdrawal) {
          set.status = 404;
          return { message: "Withdrawal not found" };
        }

        if (withdrawal.status !== "pending") {
          set.status = 400;
          return { message: "Withdrawal already processed" };
        }

        // Return funds to user's referral balance and update status in transaction
        const updated = await db.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: withdrawal.userId },
            data: { referralBalance: { increment: withdrawal.amount } },
          });

          return tx.withdrawal.update({
            where: { id: params.id },
            data: {
              status: "rejected",
              processedAt: new Date(),
            },
            include: { user: { select: { login: true } } },
          });
        });

        return {
          id: updated.id,
          userLogin: updated.user.login,
          userId: updated.userId,
          amount: updated.amount,
          target: updated.target,
          bank: updated.bank,
          status: updated.status,
          createdAt: updated.createdAt.toISOString(),
          processedAt: updated.processedAt?.toISOString() ?? null,
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );
