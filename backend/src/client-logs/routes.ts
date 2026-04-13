/**
 * @fileoverview Client-side log collection endpoints.
 * The desktop/mobile app sends structured log entries here so admins
 * can diagnose VPN connection issues per user.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { adminMiddleware, authMiddleware } from "../auth/middleware";
import { randomUUID } from "crypto";

const logEntrySchema = t.Object({
  level: t.Optional(t.String()),
  category: t.Optional(t.String()),
  message: t.String(),
  data: t.Optional(t.Nullable(t.String())),
});

/**
 * Client-facing: POST /client/logs
 * Accepts a single log entry or a batch { logs: [...] }.
 */
export const clientLogRoutes = new Elysia({ prefix: "/client/logs" })
  .use(authMiddleware)
  .post(
    "/",
    async ({ body, user, set }) => {
      try {
        const entries = "logs" in body && Array.isArray((body as any).logs)
          ? (body as any).logs
          : [body];

        await Promise.all(
          entries.map((entry: any) =>
            db.clientLog.create({
              data: {
                userId: user.userId,
                level: String(entry.level ?? "info").slice(0, 16),
                category: String(entry.category ?? "app").slice(0, 64),
                message: String(entry.message ?? "").slice(0, 1024),
                data: entry.data ? String(entry.data).slice(0, 4096) : null,
              },
            }),
          ),
        );

        return { ok: true };
      } catch (err) {
        set.status = 500;
        return { message: "Failed to save logs" };
      }
    },
    {
      body: t.Union([
        t.Object({ logs: t.Array(logEntrySchema) }),
        logEntrySchema,
      ]),
    },
  );

/**
 * Admin-facing: GET /admin/users/:id/client-logs
 * Returns paginated log entries for a specific user.
 */
export const adminClientLogRoutes = new Elysia({ prefix: "/admin/users" })
  .use(adminMiddleware)
  .get(
    "/:id/client-logs",
    async ({ params, query, set }) => {
      try {
        const page = Math.max(1, Number(query.page ?? 1));
        const limit = Math.min(200, Math.max(1, Number(query.limit ?? 50)));
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
          db.clientLog.findMany({
            where: { userId: params.id },
            orderBy: { createdAt: "desc" },
            take: limit,
            skip,
          }),
          db.clientLog.count({ where: { userId: params.id } }),
        ]);

        return { logs, total, page, limit };
      } catch (err) {
        set.status = 500;
        return { message: "Failed to fetch client logs" };
      }
    },
    { params: t.Object({ id: t.String() }) },
  );

const domainStatSchema = t.Object({
  domain: t.String(),
  visitCount: t.Number(),
  bytesTransferred: t.Optional(t.Number()),
});

/**
 * Client-facing: POST /client/domain-stats
 * Records domain-level activity for the signed-in user.
 */
export const clientDomainStatRoutes = new Elysia({ prefix: "/client/domain-stats" })
  .use(authMiddleware)
  .post(
    "/",
    async ({ body, user, set }) => {
      try {
        const entries = "domains" in body && Array.isArray((body as any).domains)
          ? (body as any).domains
          : [body];

        for (const entry of entries) {
          const domain = String(entry.domain ?? "").trim().toLowerCase();
          if (!domain) continue;

          const visitCount = Number(entry.visitCount ?? 0);
          const bytesTransferred = Number(entry.bytesTransferred ?? 0);

          const existing = await db.vpnDomainStats.findFirst({
            where: { userId: user.userId, domain },
          });

          if (existing) {
            await db.vpnDomainStats.update({
              where: { id: existing.id },
              data: {
                visitCount: Number(existing.visitCount ?? 0) + visitCount,
                bytesTransferred:
                  Number(existing.bytesTransferred ?? 0) + bytesTransferred,
                lastVisitAt: new Date(),
              },
            });
          } else {
            await db.vpnDomainStats.create({
              data: {
                id: randomUUID(),
                userId: user.userId,
                domain,
                visitCount,
                bytesTransferred,
                firstVisitAt: new Date(),
                lastVisitAt: new Date(),
              },
            });
          }
        }

        return { ok: true };
      } catch (err) {
        set.status = 500;
        return { message: "Failed to save domain stats" };
      }
    },
    {
      body: t.Union([
        t.Object({ domains: t.Array(domainStatSchema) }),
        domainStatSchema,
      ]),
    },
  );
