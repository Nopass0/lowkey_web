/**
 * @fileoverview Mobile app VPN routes — authenticated endpoints for the Android client.
 * GET /api/vpn/blocked-domains  — returns the current blocklist for split-tunneling
 */

import Elysia from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";

export const mobileVpnRoutes = new Elysia({ prefix: "/api/vpn" })
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
