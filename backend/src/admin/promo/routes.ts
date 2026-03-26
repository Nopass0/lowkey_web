/**
 * @fileoverview Admin promo code management routes.
 * CRUD operations plus activation statistics.
 */

import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";

/**
 * Generates a human-readable summary of promo effects.
 *
 * @param effects - Array of promo effects
 * @returns Summary string
 */
function effectSummary(effects: any[]): string {
  return effects
    .map((e: any) => {
      switch (e.key) {
        case "add_balance":
          return `+${e.value} ₽`;
        case "add_ref_balance":
          return `+${e.value} ₽ реф.`;
        case "free_days":
          return `+${e.value} дней`;
        case "upgrade_plan":
          return `→ ${e.value}`;
        case "plan_discount_pct":
          return `-${e.value}%`;
        case "plan_discount_fixed":
          return `-${e.value} ₽`;
        case "double_next_topup":
          return "×2 топап";
        case "extra_devices":
          return `+${e.value} устр.`;
        default:
          return e.key;
      }
    })
    .join(", ");
}

/**
 * Admin promo routes group.
 * Full CRUD for promo codes plus activation stats.
 */
export const adminPromoRoutes = new Elysia({ prefix: "/admin/promo" })
  .use(adminMiddleware)

  // ─── GET /admin/promo ──────────────────────────────────
  .get(
    "/",
    async ({ query, set }) => {
      try {
        const page = parseInt(query.page ?? "1");
        const pageSize = parseInt(query.pageSize ?? "5");
        const skip = (page - 1) * pageSize;

        const [promos, total] = await Promise.all([
          db.promoCode.findMany({
            include: {
              activations: {
                orderBy: { activatedAt: "desc" },
                take: 1,
              },
              _count: { select: { activations: true } },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: pageSize,
          }),
          db.promoCode.count(),
        ]);

        return {
          items: promos.map((p) => ({
            id: p.id,
            code: p.code,
            conditions: p.conditions as any[],
            effects: p.effects as any[],
            activations: p._count.activations,
            maxActivations: p.maxActivations,
            lastActivatedAt:
              p.activations[0]?.activatedAt.toISOString() ?? null,
            totalEffectSummary: effectSummary(p.effects as any[]),
            createdAt: p.createdAt.toISOString(),
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
      }),
    },
  )

  // ─── POST /admin/promo ─────────────────────────────────
  .post(
    "/",
    async ({ body, set }) => {
      try {
        // Check uniqueness
        const existing = await db.promoCode.findUnique({
          where: { code: body.code.toUpperCase() },
        });
        if (existing) {
          set.status = 409;
          return { message: "Промокод уже существует" };
        }

        // Extract maxActivations from conditions if present
        const maxActivationsCond = (body.conditions as any[]).find(
          (c: any) => c.key === "max_activations",
        );
        const maxActivations = maxActivationsCond
          ? parseInt(maxActivationsCond.value)
          : null;

        const promo = await db.promoCode.create({
          data: {
            code: body.code.toUpperCase(),
            conditions: body.conditions,
            effects: body.effects,
            maxActivations,
          },
          include: {
            _count: { select: { activations: true } },
          },
        });

        set.status = 201;
        return {
          id: promo.id,
          code: promo.code,
          conditions: promo.conditions as any[],
          effects: promo.effects as any[],
          activations: promo._count.activations,
          maxActivations: promo.maxActivations,
          lastActivatedAt: null,
          totalEffectSummary: effectSummary(promo.effects as any[]),
          createdAt: promo.createdAt.toISOString(),
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        code: t.String(),
        conditions: t.Array(
          t.Object({
            key: t.String(),
            value: t.Optional(t.String()),
            value2: t.Optional(t.String()),
          }),
        ),
        effects: t.Array(
          t.Object({
            key: t.String(),
            value: t.Optional(t.String()),
          }),
        ),
      }),
    },
  )

  // ─── PATCH /admin/promo/:id ────────────────────────────
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      try {
        const maxActivationsCond = (body.conditions as any[]).find(
          (c: any) => c.key === "max_activations",
        );
        const maxActivations = maxActivationsCond
          ? parseInt(maxActivationsCond.value)
          : null;

        const promo = await db.promoCode.update({
          where: { id: params.id },
          data: {
            code: body.code.toUpperCase(),
            conditions: body.conditions,
            effects: body.effects,
            maxActivations,
          },
          include: {
            activations: { orderBy: { activatedAt: "desc" }, take: 1 },
            _count: { select: { activations: true } },
          },
        });

        return {
          id: promo.id,
          code: promo.code,
          conditions: promo.conditions as any[],
          effects: promo.effects as any[],
          activations: promo._count.activations,
          maxActivations: promo.maxActivations,
          lastActivatedAt:
            promo.activations[0]?.activatedAt.toISOString() ?? null,
          totalEffectSummary: effectSummary(promo.effects as any[]),
          createdAt: promo.createdAt.toISOString(),
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        code: t.String(),
        conditions: t.Array(
          t.Object({
            key: t.String(),
            value: t.Optional(t.String()),
            value2: t.Optional(t.String()),
          }),
        ),
        effects: t.Array(
          t.Object({
            key: t.String(),
            value: t.Optional(t.String()),
          }),
        ),
      }),
    },
  )

  // ─── DELETE /admin/promo/:id ───────────────────────────
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        await db.promoCode.delete({ where: { id: params.id } });
        set.status = 204;
        return;
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )

  // ─── GET /admin/promo/:id/stats ────────────────────────
  .get(
    "/:id/stats",
    async ({ params, set }) => {
      try {
        const promo = await db.promoCode.findUnique({
          where: { id: params.id },
          include: { activations: { include: { user: true } } },
        });

        if (!promo) {
          set.status = 404;
          return { message: "Promo code not found" };
        }

        const activations = promo.activations;
        const uniqueUsers = new Set(
          activations.map((a: { userId: string }) => a.userId),
        ).size;

        // Calculate total balance awarded from add_balance effects
        const effects = promo.effects as any[];
        const addBalanceEffect = effects.find(
          (e: any) => e.key === "add_balance",
        );
        const addBalanceAmount = addBalanceEffect
          ? parseFloat(addBalanceEffect.value ?? "0")
          : 0;
        const totalBalanceAwarded = addBalanceAmount * activations.length;

        // Group activations by day
        const byDay = new Map<string, number>();
        for (const a of activations) {
          const date = a.activatedAt.toISOString().split("T")[0];
          byDay.set(date, (byDay.get(date) ?? 0) + 1);
        }

        const activationsByDay = Array.from(byDay.entries())
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date));

        return {
          activations: activations.length,
          uniqueUsers,
          totalBalanceAwarded,
          activationsByDay,
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
