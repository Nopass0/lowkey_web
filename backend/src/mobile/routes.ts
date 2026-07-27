/**
 * @fileoverview Mobile app VPN routes — authenticated endpoints for the Android client.
 * GET /api/vpn/blocked-domains  — returns the current blocklist for split-tunneling
 */

import Elysia from "elysia";
import { db } from "../db";

function buildMobileVpnRoutes(prefix: string) {
  // Keep this endpoint open for VPN nodes and clients without user JWT.
  // It only returns globally configured blocked domains.
  const openRoutes = new Elysia({ prefix }).get("/blocked-domains", async () => {
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
  return new Elysia().use(openRoutes);
}

export const mobileVpnRoutes = new Elysia()
  .use(buildMobileVpnRoutes("/vpn"))
  .use(buildMobileVpnRoutes("/api/vpn"));
