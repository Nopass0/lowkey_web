/**
 * @fileoverview Subscription link endpoint.
 *
 * GET /subscribe-link?token=<userId>
 *
 * Returns a v2ray-style subscription: a base64-encoded blob of newline-
 * separated vless:// links, one per online VPN server. Any compatible client
 * (v2rayN, v2rayNG, Throne, Happ, Nekoray, Shadowrocket, etc.) can import this
 * single URL and auto-discover every available server.
 *
 * Auth model: the `token` query param is the user's account UUID — the same UUID
 * that already goes into each vless:// link as the auth credential. So the URL
 * itself is a bearer secret: anyone holding it can connect as that user. This
 * matches how vless:// auth works and avoids a separate token model. The user
 * finds their subscribe URL in /api/user/profile (field `subscribeLink`).
 *
 * Response:
 *   Content-Type: text/plain; charset=utf-8
 *   Subscription-Userinfo: upload=<bytes>; download=<bytes>; total=<bytes>; expire=<unix-ts>
 *   body: base64("vless://...\nvless://...\n")
 *
 * If the user has no active subscription, returns 402 (so clients show "expired").
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import {
  buildVlessLink,
  resolveVlessTemplate,
} from "../user/routes";
import { config } from "../config";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toBase64(str: string): string {
  // Node Buffer base64 — URL-safe enough for subscription bodies (clients
  // tolerate standard base64 with padding).
  return Buffer.from(str, "utf8").toString("base64");
}

export const subscribeLinkRoutes = new Elysia().get(
  "/subscribe-link",
  async ({ query, set, headers }) => {
    const token = (query.token ?? "").trim();

    if (!uuidRegex.test(token)) {
      set.status = 400;
      set.headers["Content-Type"] = "text/plain; charset=utf-8";
      return "Invalid or missing token";
    }

    let user;
    try {
      user = await db.user.findUnique({
        where: { id: token },
        include: { subscription: true },
      });
    } catch (err) {
      console.error("[SubscribeLink] DB error:", err);
      set.status = 500;
      set.headers["Content-Type"] = "text/plain; charset=utf-8";
      return "Internal server error";
    }

    if (!user) {
      set.status = 404;
      set.headers["Content-Type"] = "text/plain; charset=utf-8";
      return "User not found";
    }

    if (user.isBanned) {
      set.status = 403;
      set.headers["Content-Type"] = "text/plain; charset=utf-8";
      return "Account banned";
    }

    const sub = user.subscription;
    const subscriptionExpired =
      !sub || (!sub.isLifetime && sub.activeUntil < new Date());

    if (subscriptionExpired) {
      set.status = 402;
      set.headers["Content-Type"] = "text/plain; charset=utf-8";
      set.headers["Subscription-Userinfo"] = "expire=0";
      return "Subscription expired";
    }

    // Load online VPN servers (mirror of user/routes.ts server selection).
    let vpnServers: any[] = [];
    try {
      vpnServers = await db.vpnServer.findMany({
        where: { status: "online" },
        orderBy: [{ lastSeenAt: "desc" }, { currentLoad: "asc" }],
        take: 20,
      });
    } catch (err) {
      console.error("[SubscribeLink] vpnServer query error:", err);
    }

    // Build one vless:// link per server that has a usable template.
    const links: string[] = [];
    for (const server of vpnServers) {
      const template = resolveVlessTemplate(server);
      if (!template) continue;
      // Strip packetEncoding for max client compat (subscribe links are imported
      // by many clients; some choke on xudp). buildVlessLink already drops alpn.
      const link = buildVlessLink(
        template,
        user.id,
        server.ip,
        server.hostname ?? null,
        null, // platform-agnostic (not android-specific)
        false, // do not strip packetEncoding — keep it, most clients support it
      );
      if (link) {
        const label =
          (server.location && server.location !== "Unknown, UN"
            ? server.location
            : server.hostname ?? server.ip) ?? "LOWKEY";
        // Replace the #LOWKEY tag with a per-server label so the client shows
        // a meaningful server name in its server list.
        const tagged = link.replace(/#LOWKEY$/, `#LOWKEY-${label}`);
        links.push(tagged);
      }
    }

    // Subscription-Userinfo header (traffic + expiry). Bytes are best-effort:
    // we don't track per-user totals here, so report 0 used + the expiry ts.
    const expireTs = Math.floor(
      (sub?.activeUntil?.getTime() ?? Date.now()) / 1000,
    );
    set.headers["Content-Type"] = "text/plain; charset=utf-8";
    set.headers["Subscription-Userinfo"] =
      `upload=0; download=0; total=0; expire=${expireTs}`;
    // Let clients cache briefly but re-check for server-list changes.
    set.headers["Cache-Control"] = "no-cache";

    // Profile-Insecure hint: some clients respect this to skip cert-pin on
    // self-hosted nodes. Body is base64 of newline-joined links.
    return toBase64(links.join("\n") + "\n");
  },
  {
    query: t.Object({
      token: t.String(),
    }),
    detail: {
      summary: "Subscription link (v2ray/Throne/Happ/Nekoray compatible)",
      description:
        "Returns base64-encoded list of vless:// links for all online servers. " +
        "Import this URL in any v2ray-compatible client. token = user UUID.",
      tags: ["Subscriptions"],
    },
  },
);

/**
 * Builds the public subscribe URL for a given user id.
 * Used by /user/profile to populate `subscribeLink`.
 */
export function buildSubscribeUrl(userId: string): string {
  const base = (config.SITE_URL || "https://lowkey.su").replace(/\/$/, "");
  return `${base}/api/subscribe-link?token=${userId}`;
}
