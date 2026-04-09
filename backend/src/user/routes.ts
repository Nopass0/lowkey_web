/**
 * @fileoverview User routes: profile and transaction history.
 * All routes require authentication via authMiddleware.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";
import crypto from "crypto";

type TelegramProxyPlan = {
  isTelegramPlan?: boolean | null;
  telegramProxyEnabled?: boolean | null;
} | null;

type MtprotoSettings = {
  enabled?: boolean | null;
  port?: number | null;
  secret?: string | null;
} | null;

function toMtprotoClientSecret(value?: string | null) {
  const secret = value?.trim().toLowerCase();
  if (!secret) {
    return null;
  }
  if (/^(dd|ee)[0-9a-f]{32}$/.test(secret)) {
    return secret;
  }
  if (/^[0-9a-f]{32}$/.test(secret)) {
    return `dd${secret}`;
  }
  return null;
}

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
  clientPlatform?: string | null,
): string | null {
  if (!template) {
    return null;
  }

  const serverAddress = serverHost || serverIp;
  let link = template
    .replaceAll("{uuid}", userId)
    .replaceAll("{ip}", serverIp)
    .replaceAll("{host}", serverAddress);

  if (link.includes("vless://")) {
    const [baseUrl, tag] = link.split("#");
    let normalized = baseUrl;
    const isAndroidClient = clientPlatform === "android";
    if (!normalized.includes("type=")) {
      const separator = normalized.includes("?") ? "&" : "?";
      normalized = `${normalized}${separator}type=tcp`;
    }
    if (isAndroidClient) {
      normalized = normalized.replace(/@([^:/?#]+)(:\d+)?/, "@$1:8444");
    }
    if (
      !isAndroidClient &&
      normalized.includes("security=reality") &&
      !normalized.includes("flow=")
    ) {
      normalized = normalized.replace(
        "security=reality",
        "flow=xtls-rprx-vision&security=reality",
      );
    }
    if (
      !isAndroidClient &&
      normalized.includes("security=reality") &&
      !normalized.includes("packetEncoding=")
    ) {
      const separator = normalized.includes("?") ? "&" : "?";
      normalized = `${normalized}${separator}packetEncoding=xudp`;
    }
    link = `${normalized}${tag ? `#${tag}` : ""}`;
  }

  return link;
}

function planHasTelegramProxy(plan: TelegramProxyPlan): boolean {
  return Boolean(plan?.isTelegramPlan || plan?.telegramProxyEnabled);
}

function buildMtprotoProxyLinks(
  settings: MtprotoSettings,
  serverIp: string,
  serverHost?: string | null,
) {
  const secret = toMtprotoClientSecret(settings?.secret);
  if (!settings?.enabled || !secret) {
    return null;
  }

  const host = (serverHost || serverIp).trim();
  if (!host) {
    return null;
  }

  const port =
    typeof settings.port === "number" && Number.isFinite(settings.port)
      ? Math.max(1, settings.port)
      : 443;

  const params = new URLSearchParams({
    server: host,
    port: String(port),
    secret,
  });

  return {
    mtprotoHost: host,
    mtprotoPort: port,
    mtprotoLink: `tg://proxy?${params.toString()}`,
    mtprotoShareLink: `https://t.me/proxy?${params.toString()}`,
  };
}

/**
 * User routes group.
 * Provides profile and transaction history endpoints.
 */
export const userRoutes = new Elysia({ prefix: "/user" })
  .use(authMiddleware)

  // ─── GET /user/profile ─────────────────────────────────
  .get("/profile", async ({ user, set, headers }) => {
    try {
      // Track Android client usage (fire-and-forget, non-blocking)
      const clientPlatform = (headers as Record<string, string | undefined>)["x-client-platform"];
      const clientVersion  = (headers as Record<string, string | undefined>)["x-client-version"];
      if (clientPlatform === "android") {
        db.user.update({
          where: { id: user.userId },
          data: {
            lastAndroidVersion: clientVersion ?? "unknown",
            lastAndroidSeenAt: new Date(),
          },
        }).catch(() => {/* non-critical */});
      }

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

      const [vpnServer, currentPlan, mtprotoSettings] =
        isSubscriptionActive && dbUser.subscription
          ? await Promise.all([
              db.vpnServer.findFirst({
                where: { status: "online" },
                orderBy: [{ lastSeenAt: "desc" }, { currentLoad: "asc" }],
              }),
              db.subscriptionPlan.findFirst({
                where: { slug: dbUser.subscription.planId },
              }),
              db.mtprotoSettings.findFirst({}),
            ])
          : [null, null, null];

      const mtprotoAccess =
        vpnServer && planHasTelegramProxy(currentPlan)
          ? buildMtprotoProxyLinks(
              mtprotoSettings,
              vpnServer.ip,
              vpnServer.hostname ?? null,
            )
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
              protocols: mtprotoAccess
                ? Array.from(
                    new Set([
                      ...vpnServer.supportedProtocols,
                      "mtproto",
                    ]),
                  )
                : vpnServer.supportedProtocols,
              vlessLink: buildVlessLink(
                vpnServer.connectLinkTemplate,
                dbUser.id,
                vpnServer.ip,
                vpnServer.hostname ?? null,
                clientPlatform ?? null,
              ),
              mtprotoLink: mtprotoAccess?.mtprotoLink ?? null,
              mtprotoShareLink: mtprotoAccess?.mtprotoShareLink ?? null,
              mtprotoHost: mtprotoAccess?.mtprotoHost ?? null,
              mtprotoPort: mtprotoAccess?.mtprotoPort ?? null,
            }
          : null,
      };
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  })

  // ─── POST /user/device-info ───────────────────────────
  .post(
    "/device-info",
    async ({ user, body }) => {
      await db.user.update({
        where: { id: user.userId },
        data: {
          lastAndroidVersion: body.appVersion,
          lastAndroidSeenAt: new Date(),
          lastAndroidDevice: `${body.manufacturer} ${body.model} (Android ${body.androidVersion})`,
          lastAndroidLocale: body.locale,
          lastAndroidTimezone: body.timezone,
          lastAndroidLat: body.latitude ?? null,
          lastAndroidLng: body.longitude ?? null,
        },
      }).catch(() => {/* fields may not exist yet in older VoidDB, ignore */});
      return { ok: true };
    },
    {
      body: t.Object({
        model: t.String(),
        manufacturer: t.String(),
        androidVersion: t.String(),
        sdkInt: t.Number(),
        appVersion: t.String(),
        locale: t.String(),
        timezone: t.String(),
        latitude:  t.Optional(t.Number()),
        longitude: t.Optional(t.Number()),
      }),
    },
  )

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
