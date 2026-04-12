/**
 * @fileoverview Admin routes for pushing in-app notifications to Lowkey clients.
 * Supports targeting: all users, by subscription plan, specific user, or platform.
 */

import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware, authMiddleware } from "../../auth/middleware";

export const adminClientNotificationRoutes = new Elysia({
  prefix: "/admin/client-notifications",
})
  .use(adminMiddleware)

  // GET /admin/client-notifications — list sent notifications
  .get("/", async ({ query, set }) => {
    try {
      const page = Number(query.page ?? 1);
      const limit = Number(query.limit ?? 20);
      const skip = (page - 1) * limit;

      const [notifications, total] = await Promise.all([
        db.clientNotification.findMany({
          orderBy: { sentAt: "desc" },
          take: limit,
          skip,
        }),
        db.clientNotification.count({}),
      ]);

      return { notifications, total, page, limit };
    } catch (err) {
      set.status = 500;
      return { message: "Failed to fetch notifications" };
    }
  })

  // POST /admin/client-notifications — send notification
  .post(
    "/",
    async ({ body, user, set }) => {
      try {
        const notification = await db.clientNotification.create({
          data: {
            title: body.title,
            message: body.message,
            type: body.type ?? "info",
            action: body.action ?? "none",
            actionData: body.actionData ?? null,
            targetType: body.targetType ?? "all",
            targetValue: body.targetValue ?? null,
            deliveredTo: [],
            readBy: [],
            sentById: user.userId,
          },
        });
        return { notification };
      } catch (err) {
        set.status = 500;
        return { message: "Failed to send notification" };
      }
    },
    {
      body: t.Object({
        title: t.String(),
        message: t.String(),
        type: t.Optional(t.String()),
        action: t.Optional(t.String()),
        actionData: t.Optional(t.String()),
        // "all" | "subscription" | "user" | "platform"
        targetType: t.Optional(t.String()),
        // plan slug | userId | platform name
        targetValue: t.Optional(t.String()),
      }),
    },
  )

  // DELETE /admin/client-notifications/:id
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        await db.clientNotification.delete({ where: { id: params.id } });
        set.status = 204;
        return;
      } catch (err) {
        set.status = 500;
        return { message: "Failed to delete notification" };
      }
    },
    { params: t.Object({ id: t.String() }) },
  );

/**
 * Client-facing routes for fetching notifications.
 * Uses normal auth middleware.
 */
export const clientNotificationRoutes = new Elysia({
  prefix: "/client/notifications",
})
  .use(authMiddleware)

  // GET /client/notifications — fetch notifications for this user
  .get("/", async ({ user, set }) => {
    try {
      // Get user's subscription plan for targeting
      const subscription = await db.subscription.findFirst({
        where: { userId: user.userId },
        orderBy: { createdAt: "desc" },
      });

      const userData = await db.user.findUnique({
        where: { id: user.userId },
        select: { id: true },
      });

      // Find relevant notifications
      const all = await db.clientNotification.findMany({
        where: {
          sentAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // last 30 days
        },
        orderBy: { sentAt: "desc" },
        take: 50,
      });

      // Filter by targeting
      const relevant = all.filter((n) => {
        if (n.targetType === "all") return true;
        if (n.targetType === "user") return n.targetValue === user.userId;
        if (n.targetType === "subscription") {
          return subscription?.planId === n.targetValue ||
            (n.targetValue && subscription?.planName?.toLowerCase().includes(n.targetValue.toLowerCase()));
        }
        return false;
      });

      // Mark as delivered
      for (const n of relevant) {
        const deliveredTo = (n.deliveredTo as string[]) ?? [];
        if (!deliveredTo.includes(user.userId)) {
          await db.clientNotification.update({
            where: { id: n.id },
            data: {
              deliveredTo: [...deliveredTo, user.userId],
            },
          });
        }
      }

      const readBy = new Set<string>();
      return {
        notifications: relevant.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          action: n.action,
          actionData: n.actionData,
          sentAt: n.sentAt,
          isRead: (n.readBy as string[])?.includes(user.userId) ?? false,
        })),
      };
    } catch (err) {
      set.status = 500;
      return { message: "Failed to fetch notifications" };
    }
  })

  // POST /client/notifications/:id/read — mark as read
  .post(
    "/:id/read",
    async ({ params, user, set }) => {
      try {
        const n = await db.clientNotification.findUnique({
          where: { id: params.id },
        });
        if (!n) {
          set.status = 404;
          return { message: "Notification not found" };
        }
        const readBy = (n.readBy as string[]) ?? [];
        if (!readBy.includes(user.userId)) {
          await db.clientNotification.update({
            where: { id: params.id },
            data: { readBy: [...readBy, user.userId] },
          });
        }
        set.status = 204;
        return;
      } catch (err) {
        set.status = 500;
        return { message: "Failed to mark as read" };
      }
    },
    { params: t.Object({ id: t.String() }) },
  );
