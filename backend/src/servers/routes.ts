/**
 * @fileoverview VPN Server routes: registration, heartbeat, listing.
 * Used by Rust VPN nodes to communicate with the central backend.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";

export const vpnServerRoutes = new Elysia({ prefix: "/servers" })

  // ─── POST /servers/register ─────────────────────────────
  // Called by a Rust VPN node when it starts up.
  .post(
    "/register",
    async ({ body, set }) => {
      try {
        const { ip, port, supportedProtocols, serverType } = body;

        // Check if server with this IP already exists
        const existing = await db.vpnServer.findFirst({
          where: { ip, port },
        });

        if (existing) {
          const updated = await db.vpnServer.update({
            where: { id: existing.id },
            data: {
              supportedProtocols,
              serverType,
              status: "online",
              lastSeenAt: new Date(),
            },
          });
          return { success: true, serverId: updated.id };
        }

        // Create new server entry
        const server = await db.vpnServer.create({
          data: {
            ip,
            port,
            supportedProtocols,
            serverType,
            status: "online",
            currentLoad: 0,
          },
        });

        return { success: true, serverId: server.id };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        ip: t.String(),
        port: t.Number(),
        supportedProtocols: t.Array(t.String()),
        serverType: t.String(),
      }),
    },
  )

  // ─── POST /servers/heartbeat ────────────────────────────
  // Called periodically by Rust VPN nodes to report load.
  .post(
    "/heartbeat",
    async ({ body, set }) => {
      try {
        const { serverId, currentLoad } = body;

        await db.vpnServer.update({
          where: { id: serverId },
          data: {
            currentLoad,
            status: "online",
            lastSeenAt: new Date(),
          },
        });

        return { success: true };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        serverId: t.String(),
        currentLoad: t.Number(),
      }),
    },
  )

  // ─── POST /servers/validate-token ───────────────────────
  // Called by a Rust VPN node to validate a client connection token.
  .post(
    "/validate-token",
    async ({ body, set }) => {
      try {
        const { token } = body;

        const vpnToken = await db.vpnToken.findUnique({
          where: { token },
          include: {
            user: {
              include: { subscription: true },
            },
          },
        });

        if (!vpnToken) {
          return { valid: false, reason: "Token not found" };
        }

        if (vpnToken.expiresAt < new Date()) {
          return { valid: false, reason: "Token expired" };
        }

        const user = vpnToken.user;
        if (!user) {
          return { valid: false, reason: "User not found" };
        }

        if (user.isBanned) {
          return { valid: false, reason: "User is banned" };
        }

        const sub = user.subscription;
        if (!sub) {
          return { valid: false, reason: "No active subscription" };
        }

        if (!sub.isLifetime && sub.activeUntil < new Date()) {
          return { valid: false, reason: "Subscription expired" };
        }

        return { valid: true };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        token: t.String(),
      }),
    },
  )

  // ─── GET /servers/list ──────────────────────────────────
  // PUBLIC — no auth required.
  // Returns all online VPN servers so the Android/desktop client
  // can sync the server list at startup even if blocked from the
  // primary API domain. The client iterates its fallback URL list
  // until one succeeds.
  .get("/list", async ({ set }) => {
    try {
      const servers = await db.vpnServer.findMany({
        where: { status: "online" },
        select: {
          id: true,
          ip: true,
          port: true,
          supportedProtocols: true,
          serverType: true,
          currentLoad: true,
          location: true,
        },
        orderBy: { currentLoad: "asc" },
      });
      return { servers, updatedAt: new Date().toISOString() };
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  })

  // ─── GET /servers (authenticated) ───────────────────────
  .use(authMiddleware)
  .get("/", async ({ set }) => {
    try {
      // Find all online servers (hysteria server marks itself offline on shutdown)
      const servers = await db.vpnServer.findMany({
        where: {
          status: "online",
        },
        select: {
          id: true,
          ip: true,
          port: true,
          supportedProtocols: true,
          serverType: true,
          currentLoad: true,
          location: true,
        },
        orderBy: {
          currentLoad: "asc", // least loaded first
        },
      });

      return servers;
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  });
