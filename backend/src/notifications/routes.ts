/**
 * @fileoverview Push notification endpoints.
 * GET  /api/notifications/pending  — returns unread notifications for the current user
 * POST /api/notifications/read/:id — marks a notification as read
 * POST /admin/notifications/send   — admin: send notification to user(s)
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";
import { adminMiddleware } from "../auth/middleware";

// Raw SQL helpers (push_notifications is not in Prisma schema, accessed via $queryRaw)

export const notificationRoutes = new Elysia({ prefix: "/api/notifications" })
  .use(authMiddleware)

  .get("/pending", async ({ user }) => {
    const rows = await db.$queryRaw<
      { id: string; title: string; body: string; created_at: Date }[]
    >`
      SELECT id, title, body, created_at
      FROM push_notifications
      WHERE user_id = ${user.userId}
        AND is_read = false
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      createdAt: r.created_at.toISOString(),
    }));
  })

  .post(
    "/read/:id",
    async ({ user, params }) => {
      await db.$executeRaw`
        UPDATE push_notifications
        SET is_read = true
        WHERE id = ${params.id}
          AND user_id = ${user.userId}
      `;
      return { ok: true };
    },
    { params: t.Object({ id: t.String() }) },
  );

export const adminNotificationRoutes = new Elysia({
  prefix: "/admin/notifications",
})
  .use(adminMiddleware)

  .post(
    "/send",
    async ({ body, set }) => {
      const { title, message, userIds } = body;

      // Resolve recipients
      let targetIds: string[];

      if (userIds && userIds.length > 0) {
        targetIds = userIds;
      } else {
        // Send to all non-banned users
        const users = await db.user.findMany({
          where: { isBanned: false },
          select: { id: true },
        });
        targetIds = users.map((u) => u.id);
      }

      if (targetIds.length === 0) {
        set.status = 400;
        return { message: "No recipients" };
      }

      // Bulk insert via raw SQL
      const values = targetIds
        .map(
          (id) =>
            `(gen_random_uuid()::text, '${id.replace(/'/g, "''")}', '${title.replace(/'/g, "''")}', '${message.replace(/'/g, "''")}', now())`,
        )
        .join(", ");

      await db.$executeRawUnsafe(
        `INSERT INTO push_notifications (id, user_id, title, body, created_at) VALUES ${values}`,
      );

      return { ok: true, sent: targetIds.length };
    },
    {
      body: t.Object({
        title: t.String(),
        message: t.String(),
        userIds: t.Optional(t.Array(t.String())),
      }),
    },
  );
