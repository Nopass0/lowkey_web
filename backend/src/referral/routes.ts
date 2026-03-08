/**
 * @fileoverview Referral routes: info, referral list, withdrawal create/list.
 * All routes require authentication.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";

/**
 * Masks a login string for privacy: shows first 4 chars + "***".
 *
 * @param login - Full login string
 * @returns Masked login
 */
function maskLogin(login: string): string {
  if (login.length <= 4) return login.slice(0, 2) + "***";
  return login.slice(0, 4) + "***";
}

/**
 * Referral routes group.
 * Provides referral info, referral list, and withdrawal management.
 */
export const referralRoutes = new Elysia({ prefix: "/user/referral" })
  .use(authMiddleware)

  // ─── GET /user/referral ────────────────────────────────
  .get("/", async ({ user, set }) => {
    try {
      const dbUser = await db.user.findUnique({
        where: { id: user.userId },
        select: {
          referralCode: true,
          referralBalance: true,
          referralRate: true,
        },
      });

      if (!dbUser) {
        set.status = 404;
        return { message: "User not found" };
      }

      // Calculate total earned from referral earnings
      const totalEarned = await db.transaction.aggregate({
        where: {
          userId: user.userId,
          type: "referral_earning",
        },
        _sum: { amount: true },
      });

      return {
        code: dbUser.referralCode,
        link: `https://lowkey.vpn/r/${dbUser.referralCode}`,
        balance: dbUser.referralBalance,
        rate: dbUser.referralRate,
        totalEarned: totalEarned._sum.amount ?? 0,
      };
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  })

  // ─── GET /user/referral/list ───────────────────────────
  .get(
    "/list",
    async ({ user, query, set }) => {
      try {
        const page = parseInt(query.page ?? "1");
        const pageSize = parseInt(query.pageSize ?? "5");
        const skip = (page - 1) * pageSize;

        const [referrals, total] = await Promise.all([
          db.user.findMany({
            where: { referredById: user.userId },
            include: { subscription: true },
            orderBy: { joinedAt: "desc" },
            skip,
            take: pageSize,
          }),
          db.user.count({ where: { referredById: user.userId } }),
        ]);

        const currentUser = await db.user.findUnique({
          where: { id: user.userId },
          select: { referralRate: true },
        });
        const currentRate = currentUser?.referralRate ?? 0.2;

        const items = await Promise.all(
          referrals.map(async (ref: any) => {
            // Calculate total earned from this specific referral (using referrer's rate)
            const refTopups = await db.transaction.aggregate({
              where: {
                userId: ref.id,
                type: "topup", // 'promo_topup' is excluded
              },
              _sum: { amount: true },
            });
            const earnedAmt = (refTopups._sum.amount ?? 0) * currentRate;

            return {
              id: ref.id,
              maskedLogin: maskLogin(ref.login),
              joinedAt: ref.joinedAt.toISOString(),
              earned: earnedAmt,
              planName: ref.subscription?.planName ?? null,
            };
          }),
        );

        return {
          items,
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
      }),
    },
  )

  // ─── POST /user/referral/withdrawals ───────────────────
  .post(
    "/withdrawals",
    async ({ user, body, set }) => {
      try {
        const { amount, target, bank } = body;

        if (amount < 100) {
          set.status = 400;
          return { message: "Минимальная сумма вывода: 100 ₽" };
        }

        const dbUser = await db.user.findUnique({
          where: { id: user.userId },
          select: { referralBalance: true },
        });

        if (!dbUser) {
          set.status = 404;
          return { message: "User not found" };
        }

        if (dbUser.referralBalance < amount) {
          set.status = 402;
          return { message: "Недостаточно средств на реферальном балансе" };
        }

        // Reserve amount and create withdrawal in transaction
        const withdrawal = await db.$transaction(async (tx: any) => {
          // Deduct from referral balance
          await tx.user.update({
            where: { id: user.userId },
            data: { referralBalance: { decrement: amount } },
          });

          // Create withdrawal transaction
          await tx.transaction.create({
            data: {
              userId: user.userId,
              type: "withdrawal",
              amount: -amount,
              title: `Вывод на ${bank}`,
            },
          });

          // Create withdrawal record
          return tx.withdrawal.create({
            data: {
              userId: user.userId,
              amount,
              target,
              bank,
              status: "pending",
            },
          });
        });

        set.status = 201;
        return {
          id: withdrawal.id,
          amount: withdrawal.amount,
          target: withdrawal.target,
          bank: withdrawal.bank,
          status: withdrawal.status,
          createdAt: withdrawal.createdAt.toISOString(),
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        amount: t.Number(),
        target: t.String(),
        bank: t.String(),
      }),
    },
  )

  // ─── GET /user/referral/withdrawals ────────────────────
  .get("/withdrawals", async ({ user, set }) => {
    try {
      const withdrawals = await db.withdrawal.findMany({
        where: { userId: user.userId },
        orderBy: { createdAt: "desc" },
      });

      return withdrawals.map((w: any) => ({
        id: w.id,
        amount: w.amount,
        target: w.target,
        bank: w.bank,
        status: w.status,
        createdAt: w.createdAt.toISOString(),
      }));
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  });
