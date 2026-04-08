/**
 * @fileoverview Mobile app VPN routes — authenticated endpoints for the Android client.
 * GET /api/vpn/blocked-domains  — returns the current blocklist for split-tunneling
 */

import Elysia from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";

function buildMobileVpnRoutes(prefix: string) {
  return new Elysia({ prefix })
    .use(authMiddleware)
    .get("/blocked-domains", async () => {
      const items = await db.vpnBlockedDomain.findMany({
        where: { isActive: true },
        select: { domain: true, redirectUrl: true },
      });
      return {
        domains: items.map((d: any) => ({
          domain: d.domain as string,
          redirectUrl: (d.redirectUrl as string | null) ?? "https://lowkey.su/blocked",
        })),
      };
    });
}

export const mobileVpnRoutes = new Elysia()
  .use(buildMobileVpnRoutes("/vpn"))
  .use(buildMobileVpnRoutes("/api/vpn"));
