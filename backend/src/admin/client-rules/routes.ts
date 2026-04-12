/**
 * @fileoverview Admin routes for client traffic rules management.
 * Rules are pushed to VPN servers and applied per-user or globally.
 */

import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";

export const adminClientRulesRoutes = new Elysia({ prefix: "/admin/client-rules" })
  .use(adminMiddleware)

  // GET /admin/client-rules — list all rules
  .get("/", async ({ set }) => {
    try {
      const rules = await db.clientRule.findMany({
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });
      return { rules };
    } catch (err) {
      set.status = 500;
      return { message: "Failed to fetch rules" };
    }
  })

  // POST /admin/client-rules — create rule
  .post(
    "/",
    async ({ body, user, set }) => {
      try {
        const rule = await db.clientRule.create({
          data: {
            name: body.name,
            enabled: body.enabled ?? true,
            userId: body.userId ?? null,
            domain: body.domain ?? null,
            ipCidr: body.ipCidr ?? null,
            port: body.port ?? null,
            protocol: body.protocol ?? null,
            action: body.action ?? "allow",
            redirectTo: body.redirectTo ?? null,
            reason: body.reason ?? null,
            priority: body.priority ?? 0,
            createdById: user.userId,
          },
        });
        return { rule };
      } catch (err) {
        set.status = 500;
        return { message: "Failed to create rule" };
      }
    },
    {
      body: t.Object({
        name: t.String(),
        enabled: t.Optional(t.Boolean()),
        userId: t.Optional(t.String()),
        domain: t.Optional(t.String()),
        ipCidr: t.Optional(t.String()),
        port: t.Optional(t.Number()),
        protocol: t.Optional(t.String()),
        action: t.Optional(t.String()),
        redirectTo: t.Optional(t.String()),
        reason: t.Optional(t.String()),
        priority: t.Optional(t.Number()),
      }),
    },
  )

  // PATCH /admin/client-rules/:id — update rule
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      try {
        const rule = await db.clientRule.update({
          where: { id: params.id },
          data: {
            ...(body.name !== undefined && { name: body.name }),
            ...(body.enabled !== undefined && { enabled: body.enabled }),
            ...(body.userId !== undefined && { userId: body.userId }),
            ...(body.domain !== undefined && { domain: body.domain }),
            ...(body.ipCidr !== undefined && { ipCidr: body.ipCidr }),
            ...(body.port !== undefined && { port: body.port }),
            ...(body.protocol !== undefined && { protocol: body.protocol }),
            ...(body.action !== undefined && { action: body.action }),
            ...(body.redirectTo !== undefined && { redirectTo: body.redirectTo }),
            ...(body.reason !== undefined && { reason: body.reason }),
            ...(body.priority !== undefined && { priority: body.priority }),
          },
        });
        return { rule };
      } catch (err) {
        set.status = 500;
        return { message: "Failed to update rule" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        enabled: t.Optional(t.Boolean()),
        userId: t.Optional(t.Nullable(t.String())),
        domain: t.Optional(t.Nullable(t.String())),
        ipCidr: t.Optional(t.Nullable(t.String())),
        port: t.Optional(t.Nullable(t.Number())),
        protocol: t.Optional(t.Nullable(t.String())),
        action: t.Optional(t.String()),
        redirectTo: t.Optional(t.Nullable(t.String())),
        reason: t.Optional(t.Nullable(t.String())),
        priority: t.Optional(t.Number()),
      }),
    },
  )

  // DELETE /admin/client-rules/:id
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        await db.clientRule.delete({ where: { id: params.id } });
        set.status = 204;
        return;
      } catch (err) {
        set.status = 500;
        return { message: "Failed to delete rule" };
      }
    },
    { params: t.Object({ id: t.String() }) },
  );
