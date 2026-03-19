/**
 * @fileoverview Admin tariff management routes.
 * Allows creating, updating, deactivating plans, setting promo prices,
 * and toggling YooKassa test/production mode.
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
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const {
          slug,
          name,
          features,
          isPopular,
          isActive,
          sortOrder,
          prices,
          promoActive,
          promoPrice,
          promoLabel,
          promoMaxUses,
        } = body;

        const result = await db.$transaction(async (tx) => {
          const plan = await tx.subscriptionPlan.upsert({
            where: { slug },
            update: {
              name,
              features,
              isPopular,
              isActive,
              sortOrder,
              promoActive: promoActive ?? false,
              promoPrice: promoPrice ?? null,
              promoLabel: promoLabel ?? null,
              promoMaxUses: promoMaxUses ?? null,
            },
            create: {
              slug,
              name,
              features,
              isPopular,
              isActive,
              sortOrder,
              promoActive: promoActive ?? false,
              promoPrice: promoPrice ?? null,
              promoLabel: promoLabel ?? null,
              promoMaxUses: promoMaxUses ?? null,
            },
          });

          await tx.subscriptionPrice.deleteMany({ where: { planId: plan.id } });

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
          t.Object({ period: t.String(), price: t.Number() }),
        ),
        promoActive: t.Optional(t.Boolean()),
        promoPrice: t.Optional(t.Nullable(t.Number())),
        promoLabel: t.Optional(t.Nullable(t.String())),
        promoMaxUses: t.Optional(t.Nullable(t.Number())),
      }),
    },
  )

  // ─── PATCH /admin/tariffs/:slug/promo ──────────────────
  .patch(
    "/:slug/promo",
    async ({ params, body, set }) => {
      try {
        const plan = await db.subscriptionPlan.update({
          where: { slug: params.slug },
          data: {
            promoActive: body.promoActive,
            promoPrice: body.promoPrice,
            promoLabel: body.promoLabel,
            promoMaxUses: body.promoMaxUses,
            promoUsed: body.resetUsed ? 0 : undefined,
          },
          include: { prices: true },
        });
        return plan;
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ slug: t.String() }),
      body: t.Object({
        promoActive: t.Boolean(),
        promoPrice: t.Optional(t.Nullable(t.Number())),
        promoLabel: t.Optional(t.Nullable(t.String())),
        promoMaxUses: t.Optional(t.Nullable(t.Number())),
        resetUsed: t.Optional(t.Boolean()),
      }),
    },
  )

  // ─── DELETE /admin/tariffs/:slug ──────────────────────
  .delete("/:slug", async ({ params, set }) => {
    try {
      await db.subscriptionPlan.delete({ where: { slug: params.slug } });
      return { success: true };
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  });

// ─── YooKassa mode settings ─────────────────────────────────────────────────

export const adminYokassaRoutes = new Elysia({ prefix: "/admin/yokassa" })
  .use(adminMiddleware)

  .get("/settings", async () => {
    const settings = await db.yokassaSettings.upsert({
      where: { id: "global" },
      update: {},
      create: { id: "global", mode: "test" },
    });
    return { mode: settings.mode };
  })

  .patch(
    "/settings",
    async ({ body }) => {
      const settings = await db.yokassaSettings.upsert({
        where: { id: "global" },
        update: { mode: body.mode },
        create: { id: "global", mode: body.mode },
      });
      return { mode: settings.mode };
    },
    {
      body: t.Object({
        mode: t.Union([t.Literal("test"), t.Literal("production")]),
      }),
    },
  );
