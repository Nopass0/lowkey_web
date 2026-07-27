/**
 * @fileoverview Admin routes for client traffic rules management.
 * Rules are pushed to VPN servers and applied per-user or globally.
 */

import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";
import { config } from "../../config";

export const adminClientRulesRoutes = new Elysia()
  .use(adminMiddleware)
  .onBeforeHandle(({ request }) => {
    console.log(`[Admin] ClientRules Request: ${request.method} ${request.url}`);
  })

  // Auth ping check
  .get("/admin/client-rules/ping", () => ({ ok: true, message: "Auth valid" }))

  // GET /admin/client-rules — list all rules
  .get("/admin/client-rules", async ({ set }) => {
    try {
      const rules = await db.clientRule.findMany({
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });
      return { rules };
    } catch (err) {
      console.error("[Admin][ClientRules] List error:", err);
      set.status = 500;
      return { message: "Failed to fetch rules" };
    }
  })
  .get("/admin/client-rules/", async ({ set }) => {
    try {
      const rules = await db.clientRule.findMany({
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });
      return { rules };
    } catch (err) {
      console.error("[Admin][ClientRules] List error:", err);
      set.status = 500;
      return { message: "Failed to fetch rules" };
    }
  })

  // POST /admin/client-rules — create rule
  .post(
    "/admin/client-rules",
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
            htmlContent: body.htmlContent ?? null,
            upstreamProxy: body.upstreamProxy ?? null,
            upstreamDevice: body.upstreamDevice ?? null,
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
        userId: t.Optional(t.Nullable(t.String())),
        domain: t.Optional(t.Nullable(t.String())),
        ipCidr: t.Optional(t.Nullable(t.String())),
        port: t.Optional(t.Nullable(t.Number())),
        protocol: t.Optional(t.Nullable(t.String())),
        action: t.Optional(t.String()),
        redirectTo: t.Optional(t.Nullable(t.String())),
        reason: t.Optional(t.Nullable(t.String())),
        priority: t.Optional(t.Number()),
        htmlContent: t.Optional(t.Nullable(t.String())),
        upstreamProxy: t.Optional(t.Nullable(t.String())),
        upstreamDevice: t.Optional(t.Nullable(t.String())),
      }),
    },
  )

  // PATCH /admin/client-rules/:id — update rule
  .patch(
    "/admin/client-rules/:id",
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
            ...(body.htmlContent !== undefined && { htmlContent: body.htmlContent }),
            ...(body.upstreamProxy !== undefined && { upstreamProxy: body.upstreamProxy }),
            ...(body.upstreamDevice !== undefined && { upstreamDevice: body.upstreamDevice }),
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
        htmlContent: t.Optional(t.Nullable(t.String())),
        upstreamProxy: t.Optional(t.Nullable(t.String())),
        upstreamDevice: t.Optional(t.Nullable(t.String())),
      }),
    },
  )

  // DELETE /admin/client-rules/:id
  .delete(
    "/admin/client-rules/:id",
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
  )

  // POST /admin/client-rules/jopa-refresh
  // Проксирует запрос на принудительное обновление кэша правил на JOPA-сервере.
  // JOPA-сервер обновляет кэш раз в минуту; этот эндпоинт позволяет применить
  // изменения немедленно без ожидания следующего тика.
  .post("/admin/client-rules/jopa-refresh", async ({ set }) => {
    try {
      console.log(`[JOPA-REFRESH] Calling ${config.JOPA_API_URL}/api/v1/admin/rules/refresh with key prefix: ${config.JOPA_ADMIN_KEY.substring(0, 4)}...`);
      const resp = await fetch(`${config.JOPA_API_URL}/api/v1/admin/rules/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": config.JOPA_ADMIN_KEY,
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) {
        // Никогда не пробрасываем 4xx от JOPA-сервера — это вызовет редирект на логин у фронтенда.
        // Любая ошибка от JOPA-сервера = 502 Bad Gateway от нас.
        set.status = 502;
        return { message: `JOPA server error: ${resp.status}` };
      }
      return await resp.json();
    } catch (err: any) {
      set.status = 502;
      return { message: `Cannot reach JOPA server: ${err?.message ?? err}` };
    }
  })

  // GET /admin/client-rules/jopa-status
  // Возвращает статус кэша правил JOPA-сервера: кол-во правил и время последнего обновления.
  // Всегда возвращает 200 — если JOPA недоступен, возвращает { available: false }.
  // Никогда не возвращает 401/403 чтобы не триггерить редирект на логин у фронтенда.
  .get("/admin/client-rules/jopa-status", async () => {
    try {
      const resp = await fetch(`${config.JOPA_API_URL}/api/v1/admin/rules/status`, {
        headers: { "X-Admin-Key": config.JOPA_ADMIN_KEY },
        signal: AbortSignal.timeout(8_000),
      });
      if (!resp.ok) {
        // JOPA server вернул ошибку — возвращаем 200 с флагом недоступности
        return { available: false, message: `JOPA server error: ${resp.status}` };
      }
      const data = await resp.json();
      return { available: true, ...data };
    } catch (err: any) {
      // JOPA сервер недоступен — не критично, возвращаем 200
      return { available: false, message: `JOPA server unavailable: ${err?.message ?? err}` };
    }
  });
