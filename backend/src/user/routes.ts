/**
 * @fileoverview User routes: profile and transaction history.
 * All routes require authentication via authMiddleware.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";
import { buildSubscribeUrl } from "../subscriptions/subscribe-link";
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
  if (/^dd[0-9a-f]{32}$/.test(secret)) {
    return secret;
  }
  if (/^ee[0-9a-f]{32,}$/.test(secret)) {
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

export function buildVlessLink(
  template: string | null,
  userId: string,
  serverIp: string,
  serverHost?: string | null,
  clientPlatform?: string | null,
  stripPacketEncoding = false,
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
    // Historically we rewrote Android links to port :8444 assuming a separate
    // inbound. In reality :8444 is served by `dotgw` (not VLESS), so Android
    // clients (v2rayTun, Throne) silently failed their TLS handshake. VLESS
    // listens on :2443 for every platform, so no port rewrite is needed.
    if (isAndroidClient) {
      // intentionally no-op
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
      normalized.includes("security=reality") &&
      !normalized.includes("packetEncoding=")
    ) {
      const separator = normalized.includes("?") ? "&" : "?";
      normalized = `${normalized}${separator}packetEncoding=xudp`;
    }
    if (stripPacketEncoding) {
      normalized = normalized
        .replace(/([?&])packetEncoding=xudp&?/, "$1")
        .replace(/[?&]$/, "")
        .replace("?&", "?");
    }
    normalized = normalized
      .replace(/([?&])alpn=[^&#]*&?/, "$1")
      .replace(/[?&]$/, "")
      .replace("?&", "?");
    link = `${normalized}${tag ? `#${tag}` : ""}`;
  }

  return link;
}

function hasProtocol(server: {
  supportedProtocols?: unknown;
  serverType?: string | null;
}, protocol: string): boolean {
  const extractProtocols = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).toLowerCase());
    }
    if (typeof value === "string" && value.trim()) {
      const raw = value.trim();
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).toLowerCase());
        }
      } catch {
        // ignore JSON parse error and try comma-separated fallback below.
      }
      return raw
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    }
    return [];
  };

  const normalized = protocol.toLowerCase();
  const listed = extractProtocols(server.supportedProtocols).includes(
    normalized,
  );
  if (listed) {
    return true;
  }
  return (server.serverType ?? "").toLowerCase() === normalized;
}

function buildDefaultVlessTemplate(
  serverIp: string,
  serverHost?: string | null,
) {
  const host = serverIp.trim();
  const sniHost = (serverHost?.trim() || serverIp.trim());
  const portRaw = Number.parseInt(process.env.VPN_DEFAULT_VLESS_PORT ?? "", 10);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 2443;
  return `vless://{uuid}@${host}:${port}?encryption=none&security=tls&sni=${sniHost}&fp=chrome&type=tcp#LOWKEY`;
}

/**
 * Resolves the VLESS connect-link template for a given VPN server row.
 *
 * Priority:
 *   1. If the server heartbeat wrote an explicit `connectLinkTemplate`
 *      (happens when the current `hysteria_server` binary is running), use it.
 *      This template already contains the right port / reality / sni / pbk.
 *   2. Otherwise, fall back to a default `vless://` template for `serverIp:2443`
 *      (security=tls, sni=<host>, type=tcp) so that a link is ALWAYS produced
 *      whenever a server is registered as `online`.
 *
 * The only case we return `null` is when the server row is **explicitly**
 * marked as a non-VPN role (e.g. serverType === "mtproto_only" or
 * "relay_only"). Everything else returns a link to the user.
 *
 * Rationale:
 *   Previously this function required `supportedProtocols` to include
 *   "vless" | "hysteria2". Older hysteria binaries in production did not
 *   populate `supportedProtocols`, so the filter below dropped every server
 *   and the user's profile received `vpnAccess = null`. Users reported
 *   "ссылка на VLESS не показывается" because of this. The permissive
 *   fallback is safe: even if VLESS TLS inbound is down on :2443, the worst
 *   case is a non-working link, not a missing UI element.
 */
export function resolveVlessTemplate(server: {
  ip: string;
  hostname?: string | null;
  serverType?: string | null;
  connectLinkTemplate?: string | null;
  supportedProtocols?: unknown;
}) {
  if (server.connectLinkTemplate?.trim()) {
    return server.connectLinkTemplate;
  }
  const role = (server.serverType ?? "").toLowerCase();
  // Only skip servers that are explicitly NOT meant for VLESS.
  const nonVlessRoles = new Set(["mtproto_only", "relay_only", "dns_only"]);
  if (nonVlessRoles.has(role)) {
    return null;
  }
  if (!server.ip) {
    return null;
  }
  return buildDefaultVlessTemplate(server.ip, server.hostname ?? null);
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

  const host = serverIp.trim();
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

      const [vpnServers, currentPlan, mtprotoSettings] =
        isSubscriptionActive && dbUser.subscription
          ? await Promise.all([
              db.vpnServer.findMany({
                where: { status: "online" },
                orderBy: [{ lastSeenAt: "desc" }, { currentLoad: "asc" }],
                take: 20,
              }),
              db.subscriptionPlan.findFirst({
                where: { slug: dbUser.subscription.planId },
              }),
              db.mtprotoSettings.findFirst({}),
            ])
          : [[], null, null];

      const vlessPreferredServer =
        vpnServers.find((server) => hasProtocol(server as any, "vless")) ??
        vpnServers.find((server) => hasProtocol(server as any, "hysteria2")) ??
        null;

      const vpnServer =
        vlessPreferredServer ??
        vpnServers.find((server) => Boolean(resolveVlessTemplate(server as any))) ??
        vpnServers[0] ??
        null;
      const fallbackServer =
        !vpnServer && isSubscriptionActive
          ? await db.vpnServer.findFirst({
              orderBy: [{ lastSeenAt: "desc" }],
            })
          : null;

      /**
       * Synthetic "last-resort" server used when the `vpn_servers` collection is
       * completely empty (can happen right after a DB wipe, or when the VPN node
       * cannot authenticate into the backend to call `/servers/register`).
       *
       * Without this, an active subscriber sees no `vlessLink` in the UI even
       * though the physical VPN node is up. We default to the production
       * `s1.lowkey.su` node (193.41.5.130) with VLESS TLS on :2443 and MTProto on :2444 —
       * overridable via env for staging:
       *   VPN_FALLBACK_HOST       (default: s1.lowkey.su)
       *   VPN_FALLBACK_IP         (default: 193.41.5.130)
       *   VPN_FALLBACK_LOCATION   (default: "Russia · Moscow")
       *
       * Note: s1.lowkey.su resolves to the SAME host as lowkey.su (193.41.5.130),
       * i.e. one physical box runs both the site and the VPN node.
       */
      const syntheticServer =
        !vpnServer && !fallbackServer && isSubscriptionActive
          ? {
              id: "synthetic-s1",
              ip: process.env.VPN_FALLBACK_IP ?? "193.41.5.130",
              hostname: process.env.VPN_FALLBACK_HOST ?? "s1.lowkey.su",
              location:
                process.env.VPN_FALLBACK_LOCATION ?? "Russia · Moscow",
              status: "online" as const,
              serverType: "hybrid",
              supportedProtocols: ["vless", "hysteria2", "mtproto"],
              connectLinkTemplate: null,
              currentLoad: 0,
              lastSeenAt: new Date(),
            }
          : null;

      const selectedServer = vpnServer ?? fallbackServer ?? syntheticServer;

      const resolvedVlessTemplate = selectedServer
        ? resolveVlessTemplate(selectedServer as any)
        : null;
      const baseProtocolsRaw = (selectedServer as any)?.supportedProtocols;
      const baseProtocols = Array.isArray(baseProtocolsRaw)
        ? baseProtocolsRaw.map((item: unknown) => String(item))
        : typeof baseProtocolsRaw === "string" && baseProtocolsRaw.trim()
          ? (() => {
              try {
                const parsed = JSON.parse(baseProtocolsRaw);
                if (Array.isArray(parsed)) {
                  return parsed.map((item) => String(item));
                }
              } catch {
                // ignore JSON parse error and use comma fallback.
              }
              return baseProtocolsRaw
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
            })()
          : [];

      /**
       * Fallback MTProto settings from env when the `mtproto_settings` doc is
       * absent in VoidDB (happens on fresh deployments). The production node
       * always has MTProto listening on :2444.
       *   MTPROTO_FALLBACK_PORT    (default: 2444)
       *   MTPROTO_FALLBACK_SECRET  (default: none — link suppressed if unset)
       */
      const effectiveMtproto =
        mtprotoSettings ??
        (process.env.MTPROTO_FALLBACK_SECRET
          ? {
              enabled: true,
              port: Number.parseInt(
                process.env.MTPROTO_FALLBACK_PORT ?? "2444",
                10,
              ),
              secret: process.env.MTPROTO_FALLBACK_SECRET,
            }
          : null);

      const mtprotoAccess =
        selectedServer && planHasTelegramProxy(currentPlan)
          ? buildMtprotoProxyLinks(
              effectiveMtproto,
              selectedServer.ip,
              selectedServer.hostname ?? null,
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
        // Single subscription URL importable by v2rayN/Throne/Happ/Nekoray.
        // Always present (even without subscription); the endpoint returns 402
        // if expired, which clients display as "subscription expired".
        subscribeLink: buildSubscribeUrl(dbUser.id),
        vpnAccess: selectedServer
          ? {
              serverIp: selectedServer.ip,
              serverHost: selectedServer.hostname ?? null,
              location: selectedServer.location,
              protocols: mtprotoAccess
                ? Array.from(
                    new Set([
                      ...baseProtocols,
                      "mtproto",
                    ]),
                  )
                : baseProtocols,
              vlessLink: buildVlessLink(
                resolvedVlessTemplate,
                dbUser.id,
                selectedServer.ip,
                selectedServer.hostname ?? null,
                clientPlatform === "android" ? "android" : null,
              ),
              androidVlessLink: buildVlessLink(
                resolvedVlessTemplate,
                dbUser.id,
                selectedServer.ip,
                selectedServer.hostname ?? null,
                "android",
              ),
              androidCompatVlessLink: buildVlessLink(
                resolvedVlessTemplate,
                dbUser.id,
                selectedServer.ip,
                selectedServer.hostname ?? null,
                "android",
                true,
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
