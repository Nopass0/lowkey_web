/**
 * @fileoverview Push notification endpoints.
 * GET  /notifications/pending  — unread notifications for the current user
 * POST /notifications/read/:id — mark a notification as read
 * POST /admin/notifications/send — admin: send notification to user(s)
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware, adminMiddleware } from "../auth/middleware";
import { randomUUID } from "crypto";

function buildNotificationRoutes(prefix: string) {
  return new Elysia({ prefix })
    .use(authMiddleware)

    // GET /notifications/pending
    .get("/pending", async ({ user }) => {
      const rows = await db.pushNotification.findMany({
        where: { userId: user.userId, isRead: false },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return rows.map((r: any) => ({
        id: r.id as string,
        title: r.title as string,
        body: r.body as string,
        createdAt: r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : (r.createdAt as string),
      }));
    })

    // POST /notifications/read/:id
    .post(
      "/read/:id",
      async ({ user, params }) => {
        await db.pushNotification.updateMany({
          where: { id: params.id, userId: user.userId },
          data: { isRead: true },
        });
        return { ok: true };
      },
      { params: t.Object({ id: t.String() }) },
    );
}

function buildAdminNotificationRoutes(prefix: string) {
  return new Elysia({ prefix })
    .use(adminMiddleware)

    // POST /admin/notifications/send
    .post(
      "/send",
      async ({ body, set }) => {
        const { title, message, userIds } = body;

        let targetIds: string[];

        if (userIds && userIds.length > 0) {
          targetIds = userIds;
        } else {
          const users = await db.user.findMany({
            where: { isBanned: false },
            select: { id: true },
          });
          targetIds = users.map((u: any) => u.id as string);
        }

        if (targetIds.length === 0) {
          set.status = 400;
          return { message: "No recipients" };
        }

        await db.pushNotification.createMany({
          data: targetIds.map((userId) => ({
            id: randomUUID(),
            userId,
            title,
            body: message,
            isRead: false,
            createdAt: new Date(),
          })),
        });

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
}

export const notificationRoutes = new Elysia()
  .use(buildNotificationRoutes("/notifications"))
  .use(buildNotificationRoutes("/api/notifications"));

export const adminNotificationRoutes = new Elysia()
  .use(buildAdminNotificationRoutes("/admin/notifications"))
  .use(buildAdminNotificationRoutes("/api/admin/notifications"));
