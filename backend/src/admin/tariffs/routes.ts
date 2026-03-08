/**
 * @fileoverview Admin tariff management routes.
 * Allows creating, updating, and deactivating subscription plans & prices.
 */

import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";

export const adminTariffRoutes = new Elysia({ prefix: "/admin/tariffs" })
  .use(adminMiddleware)

  // ─── GET /admin/tariffs ──────────────────────────────
  .get("/", async () => {
    return await db.subscriptionPlan.findMany({
      include: { prices: true },
      orderBy: { sortOrder: "asc" },
    });
  })

  // ─── POST /admin/tariffs ─────────────────────────────
  /**
   * Upsert a plan and its prices.
   * If slug exists, updates. If not, creates.
   */
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const { slug, name, features, isPopular, isActive, sortOrder, prices } =
          body;

        const result = await db.$transaction(async (tx) => {
          // 1. Upsert plan
          const plan = await tx.subscriptionPlan.upsert({
            where: { slug },
            update: { name, features, isPopular, isActive, sortOrder },
            create: { slug, name, features, isPopular, isActive, sortOrder },
          });

          // 2. Clear old prices (or we could upsert individual ones)
          // For simplicity and to ensure only the provided periods exist:
          await tx.subscriptionPrice.deleteMany({
            where: { planId: plan.id },
          });

          // 3. Create new prices
          if (prices && prices.length > 0) {
            await tx.subscriptionPrice.createMany({
              data: prices.map((p) => ({
                planId: plan.id,
                period: p.period,
                price: p.price,
              })),
            });
          }

          return await tx.subscriptionPlan.findUnique({
            where: { id: plan.id },
            include: { prices: true },
          });
        });

        return result;
      } catch (err) {
        console.error("[AdminTariffs] Save error:", err);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        slug: t.String(),
        name: t.String(),
        features: t.Array(t.String()),
        isPopular: t.Boolean(),
        isActive: t.Boolean(),
        sortOrder: t.Number(),
        prices: t.Array(
          t.Object({
            period: t.String(),
            price: t.Number(),
          }),
        ),
      }),
    },
  )

  // ─── DELETE /admin/tariffs/:slug ──────────────────────
  /**
   * Deactivates a plan rather than hard-deleting it to preserve history,
   * OR hard deletes if the user insists. For now, let's just delete it.
   */
  .delete("/:slug", async ({ params, set }) => {
    try {
      await db.subscriptionPlan.delete({
        where: { slug: params.slug },
      });
      return { success: true };
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  });
