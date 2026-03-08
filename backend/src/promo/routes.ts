/**
 * @fileoverview Promo code routes: activate and history.
 * All routes require authentication.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";
import { checkConditions } from "./conditions";
import { applyEffects } from "./effects";

/**
 * Promo code routes group.
 * Handles promo code activation and history listing.
 */
export const promoRoutes = new Elysia({ prefix: "/user/promo" })
  .use(authMiddleware)

  // ─── POST /user/promo/activate ─────────────────────────
  .post(
    "/activate",
    async ({ user, body, set }) => {
      try {
        const { code } = body;

        // Find promo code (case-insensitive)
        const promo = await db.promoCode.findFirst({
          where: { code: { equals: code, mode: "insensitive" } },
        });

        if (!promo) {
          set.status = 404;
          return { message: "Промокод не найден" };
        }

        // Check if already activated by this user
        const existing = await db.promoActivation.findUnique({
          where: {
            userId_promoCodeId: {
              userId: user.userId,
              promoCodeId: promo.id,
            },
          },
        });

        if (existing) {
          set.status = 409;
          return { message: "Вы уже активировали этот промокод" };
        }

        // Check max activations
        if (promo.maxActivations !== null) {
          const count = await db.promoActivation.count({
            where: { promoCodeId: promo.id },
          });
          if (count >= promo.maxActivations) {
            set.status = 422;
            return { message: "Лимит активаций исчерпан" };
          }
        }

        // Check conditions
        const conditions = promo.conditions as any[];
        const condCheck = await checkConditions(
          user.userId,
          conditions,
          promo.id,
          db,
        );
        if (!condCheck.ok) {
          set.status = 422;
          return {
            message: condCheck.reason ?? "Условия промокода не выполнены",
          };
        }

        // Apply effects in a transaction
        const effects = promo.effects as any[];
        const result = await db.$transaction(async (tx) => {
          // Record activation
          await tx.promoActivation.create({
            data: {
              userId: user.userId,
              promoCodeId: promo.id,
            },
          });

          // Apply effects
          const rewardDescription = await applyEffects(
            user.userId,
            effects,
            tx,
          );

          // Get updated balance
          const updatedUser = await tx.user.findUnique({
            where: { id: user.userId },
            select: { balance: true },
          });

          return {
            success: true,
            message: "Промокод активирован",
            rewardDescription,
            newBalance: updatedUser?.balance ?? 0,
          };
        });

        return result;
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        code: t.String(),
      }),
    },
  )

  // ─── GET /user/promo/history ───────────────────────────
  .get(
    "/history",
    async ({ user, query, set }) => {
      try {
        const page = parseInt(query.page ?? "1");
        const pageSize = parseInt(query.pageSize ?? "10");
        const skip = (page - 1) * pageSize;

        const [items, total] = await Promise.all([
          db.promoActivation.findMany({
            where: { userId: user.userId },
            include: { promoCode: true },
            orderBy: { activatedAt: "desc" },
            skip,
            take: pageSize,
          }),
          db.promoActivation.count({ where: { userId: user.userId } }),
        ]);

        return {
          items: items.map((item) => {
            const effects = item.promoCode.effects as any[];
            const description = effects
              .map((e: any) => {
                if (e.key === "add_balance") return `+${e.value} ₽`;
                if (e.key === "free_days") return `+${e.value} дней`;
                if (e.key === "upgrade_plan") return `Апгрейд: ${e.value}`;
                return e.key;
              })
              .join(", ");

            return {
              id: item.id,
              code: item.promoCode.code,
              description,
              activatedAt: item.activatedAt.toISOString(),
            };
          }),
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
  );
