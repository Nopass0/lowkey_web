/**
 * @fileoverview User routes: profile and transaction history.
 * All routes require authentication via authMiddleware.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";
import crypto from "crypto";

/**
 * Generates a Gravatar-style avatar hash from a login string.
 *
 * @param login - User login string
 * @returns Hex MD5 hash
 */
function avatarHash(login: string): string {
  return crypto.createHash("md5").update(login.toLowerCase()).digest("hex");
}

function buildVlessLink(
  template: string | null,
  userId: string,
  serverIp: string,
  serverHost?: string | null,
): string | null {
  if (!template) {
    return null;
  }

  const serverAddress = serverHost || serverIp;
  return template
    .replaceAll("{uuid}", userId)
    .replaceAll("{ip}", serverIp)
    .replaceAll("{host}", serverAddress);
}

/**
 * User routes group.
 * Provides profile and transaction history endpoints.
 */
export const userRoutes = new Elysia({ prefix: "/user" })
  .use(authMiddleware)

  // ─── GET /user/profile ─────────────────────────────────
  .get("/profile", async ({ user, set }) => {
    try {
      const dbUser = await db.user.findUnique({
        where: { id: user.userId },
        include: { subscription: true },
      });
      const aiSettings = await db.aiSettings.upsert({
        where: { id: "global" },
        update: {},
        create: { id: "global" },
      });
      const ykSettings = await db.yokassaSettings.upsert({
        where: { id: "global" },
        update: {},
        create: { id: "global", mode: "test", testSubscriptionEnabled: false, sbpProvider: "tochka" },
      });

      if (!dbUser) {
        set.status = 404;
        return { message: "User not found" };
      }

      const isSubscriptionActive =
        !!dbUser.subscription &&
        (dbUser.subscription.isLifetime ||
          dbUser.subscription.activeUntil > new Date());

      const vpnServer = isSubscriptionActive
        ? await db.vpnServer.findFirst({
            where: { status: "online" },
            orderBy: [{ lastSeenAt: "desc" }, { currentLoad: "asc" }],
          })
        : null;

      let linkCode = dbUser.telegramLinkCode;
      if (!dbUser.telegramId) {
        if (
          !linkCode ||
          (dbUser.telegramLinkCodeExpiresAt &&
            dbUser.telegramLinkCodeExpiresAt < new Date())
        ) {
          linkCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          await db.user.update({
            where: { id: user.userId },
            data: {
              telegramLinkCode: linkCode,
              telegramLinkCodeExpiresAt: new Date(
                Date.now() + 24 * 60 * 60 * 1000,
              ),
            },
          });
        }
      }

      return {
        id: dbUser.id,
        login: dbUser.login,
        avatarHash: avatarHash(dbUser.login),
        balance: dbUser.balance,
        referralBalance: dbUser.referralBalance,
        hideAiMenu: dbUser.hideAiMenu,
        hideAiMenuForAll: aiSettings.hideAiMenuForAll,
        subscription: dbUser.subscription
          ? {
              planId: dbUser.subscription.planId,
              planName: dbUser.subscription.planName,
              activeUntil: dbUser.subscription.activeUntil.toISOString(),
              isLifetime: dbUser.subscription.isLifetime,
            }
          : null,
        joinedAt: dbUser.joinedAt.toISOString(),
        telegramId: dbUser.telegramId ? dbUser.telegramId.toString() : null,
        telegramLinkCode: !dbUser.telegramId ? linkCode : null,
        referralRate: dbUser.referralRate,
        sbpProvider: ykSettings.sbpProvider,
        vpnAccess: vpnServer
          ? {
              serverIp: vpnServer.ip,
              serverHost: vpnServer.hostname ?? null,
              location: vpnServer.location,
              protocols: vpnServer.supportedProtocols,
              vlessLink: buildVlessLink(
                vpnServer.connectLinkTemplate,
                dbUser.id,
                vpnServer.ip,
                vpnServer.hostname ?? null,
              ),
            }
          : null,
      };
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  })

  // ─── GET /user/transactions ────────────────────────────
  .get(
    "/transactions",
    async ({ user, query, set }) => {
      try {
        const page = parseInt(query.page ?? "1");
        const pageSize = parseInt(query.pageSize ?? "10");
        const skip = (page - 1) * pageSize;

        const [items, total] = await Promise.all([
          db.transaction.findMany({
            where: { userId: user.userId },
            orderBy: { createdAt: "desc" },
            skip,
            take: pageSize,
          }),
          db.transaction.count({ where: { userId: user.userId } }),
        ]);

        return {
          items: items.map((tx) => ({
            id: tx.id,
            type: tx.type,
            amount: tx.amount,
            title: tx.title,
            isTest: tx.isTest,
            paymentId: tx.paymentId,
            createdAt: tx.createdAt.toISOString(),
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
  );
