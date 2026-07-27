/**
 * @fileoverview JOPA token endpoint — issues a signed sub_token for the VPN relay.
 *
 * Flow:
 *  1. User must be authenticated (authMiddleware).
 *  2. User must have an active Lowkey subscription.
 *  3. We generate a short-lived signed token (HMAC-SHA256) containing userId + expiry.
 *  4. The JOPA relay verifies the HMAC locally — no VoidDB lookup needed.
 *
 * Token format: <base64url(json_payload)>.<hex(hmac_sha256(payload, JOPA_ADMIN_KEY))>
 * JSON payload: { uid: string, exp: number (unix seconds) }
 */

import Elysia from "elysia";
import { createHmac } from "crypto";
import { authMiddleware } from "../auth/middleware";
import { config } from "../config";
import { db } from "../db";

/** Maximum token lifetime in seconds (24 hours). */
const TOKEN_TTL_SECONDS = 86400;

/**
 * Generates a JOPA relay sub_token signed with JOPA_ADMIN_KEY.
 * The relay verifies the HMAC without needing a DB lookup.
 */
function generateJopaToken(userId: string, expiresInSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  const sig = createHmac("sha256", config.JOPA_ADMIN_KEY)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

async function fetchLegacyJopaSubTokenByLogin(login: string): Promise<string | null> {
  try {
    const base = (config.JOPA_API_URL || "http://89.169.54.87:9109").replace(/\/+$/, "");
    const url = `${base}/api/v1/admin/subscriptions/by-login?login=${encodeURIComponent(login)}`;
    const resp = await fetch(url, {
      headers: { "X-Admin-Key": config.JOPA_ADMIN_KEY },
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as any;
    const subs = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
    if (subs.length === 0) return null;

    const now = Date.now();
    const active = subs
      .filter((s: any) => {
        if (s?.is_lifetime === true) return true;
        const exp = Date.parse(String(s?.expires_at ?? ""));
        return Number.isFinite(exp) && exp > now;
      })
      .sort((a: any, b: any) => {
        const aExp = Date.parse(String(a?.expires_at ?? "")) || 0;
        const bExp = Date.parse(String(b?.expires_at ?? "")) || 0;
        return bExp - aExp;
      });

    const picked =
      active.find((s: any) => typeof s?.token === "string" && s.token.startsWith("sub_")) ??
      active.find((s: any) => typeof s?.token === "string" && s.token.length > 0);

    return picked?.token ?? null;
  } catch {
    return null;
  }
}

export const jopaRoutes = new Elysia({ prefix: "/user/jopa-token" })
  .use(authMiddleware)
  .get("/", async ({ user, set }) => {
    // ── 1. Find user's active subscription ──────────────────────────────────
    let subscription: any = null;
    try {
      subscription = await db.subscription.findFirst({
        where: {
          userId: user.userId,
          OR: [
            { isLifetime: true },
            { activeUntil: { gte: new Date() } },
          ],
        },
        orderBy: { activeUntil: "desc" },
      });
    } catch (err) {
      console.warn("[JOPA] subscription lookup failed:", err);
      set.status = 500;
      return { message: "Failed to check subscription" };
    }

    if (!subscription) {
      set.status = 402;
      return { message: "No active subscription. Please renew to use VPN." };
    }

    // Prefer relay-native legacy token format expected by deployed JOPA relay.
    try {
      const userRow: any = await db.user.findUnique({
        where: { id: user.userId },
        select: { login: true, email: true },
      });
      const login = String(userRow?.login || userRow?.email || "").trim();
      if (login) {
        const legacyToken = await fetchLegacyJopaSubTokenByLogin(login);
        if (legacyToken) return { sub_token: legacyToken };
      }
    } catch (err) {
      console.warn("[JOPA] legacy token fetch failed:", err);
    }

    // ── 2. Calculate token TTL based on subscription expiry ─────────────────
    let ttlSeconds = TOKEN_TTL_SECONDS;
    if (!subscription.isLifetime && subscription.activeUntil) {
      const remainingSeconds = Math.floor(
        (new Date(subscription.activeUntil).getTime() - Date.now()) / 1000,
      );
      if (remainingSeconds <= 0) {
        set.status = 402;
        return { message: "Subscription expired" };
      }
      // Cap at 24h so the relay re-validates daily.
      ttlSeconds = Math.min(remainingSeconds, TOKEN_TTL_SECONDS);
    }

    // ── 3. Generate and return signed token ─────────────────────────────────
    const sub_token = generateJopaToken(user.userId, ttlSeconds);
    console.log(`[JOPA] token issued for user=${user.userId} ttl=${ttlSeconds}s`);
    return { sub_token };
  });
