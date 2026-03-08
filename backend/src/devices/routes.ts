/**
 * @fileoverview Device routes: list, status, and block/unblock.
 * Online status and speed are stored in Redis, not Postgres.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { redis } from "../redis";
import { authMiddleware } from "../auth/middleware";

/**
 * Retrieves Redis online status for a device.
 *
 * @param deviceId - Device ID
 * @returns Object with isOnline and speedKbps
 */
async function getDeviceOnlineStatus(deviceId: string): Promise<{
  isOnline: boolean;
  speedKbps: number | null;
}> {
  const data = await redis.get(`device:online:${deviceId}`);
  if (!data) {
    return { isOnline: false, speedKbps: null };
  }
  try {
    const parsed = JSON.parse(data);
    return { isOnline: true, speedKbps: parsed.speedKbps ?? null };
  } catch {
    return { isOnline: false, speedKbps: null };
  }
}

/**
 * Device routes group.
 * Provides device listing, lightweight status polling, and block toggle.
 */
export const deviceRoutes = new Elysia({ prefix: "/user/devices" })
  .use(authMiddleware)
  // ─── POST /user/devices ──────────────────────────────────
  // Registers a new device for the user.
  .post(
    "/",
    async ({ user, body, set }) => {
      try {
        const { name, os, version, lastIp } = body;

        const device = await db.device.create({
          data: {
            userId: user.userId,
            name,
            os,
            version,
            lastIp,
          },
        });

        return { success: true, deviceId: device.id };
      } catch (err: any) {
        console.error("[Device Registration Error]:", err);
        set.status = 500;
        return { message: err.message || "Internal server error" };
      }
    },
    {
      body: t.Object({
        name: t.String(),
        os: t.String(),
        version: t.String(),
        lastIp: t.String(),
      }),
    },
  )

  // ─── GET /user/devices ─────────────────────────────────
  .get("/", async ({ user, set }) => {
    try {
      const devices = await db.device.findMany({
        where: { userId: user.userId },
        orderBy: { lastSeenAt: "desc" },
      });

      const result = await Promise.all(
        devices.map(async (device: any) => {
          const status = await getDeviceOnlineStatus(device.id);
          return {
            id: device.id,
            name: device.name,
            os: device.os,
            version: device.version,
            lastIp: device.lastIp,
            isOnline: status.isOnline,
            speedKbps: status.speedKbps,
            isBlocked: device.isBlocked,
            lastSeenAt: device.lastSeenAt.toISOString(),
          };
        }),
      );

      return result;
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  })

  // ─── GET /user/devices/status ──────────────────────────
  .get("/status", async ({ user, set }) => {
    try {
      const devices = await db.device.findMany({
        where: { userId: user.userId },
        select: { id: true },
      });

      const result = await Promise.all(
        devices.map(async (device: any) => {
          const status = await getDeviceOnlineStatus(device.id);
          return {
            id: device.id,
            isOnline: status.isOnline,
            speedKbps: status.speedKbps,
          };
        }),
      );

      return result;
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  })

  // ─── PATCH /user/devices/:id/block ─────────────────────
  .patch(
    "/:id/block",
    async ({ user, params, body, set }) => {
      try {
        // Verify device belongs to user
        const device = await db.device.findUnique({
          where: { id: params.id },
        });

        if (!device) {
          set.status = 404;
          return { message: "Device not found" };
        }

        if (device.userId !== user.userId) {
          set.status = 403;
          return { message: "Forbidden" };
        }

        const updated = await db.device.update({
          where: { id: params.id },
          data: { isBlocked: body.isBlocked },
        });

        // If blocking, remove online status from Redis
        if (body.isBlocked) {
          await redis.del(`device:online:${params.id}`);
        }

        const status = await getDeviceOnlineStatus(updated.id);

        return {
          id: updated.id,
          name: updated.name,
          os: updated.os,
          version: updated.version,
          lastIp: updated.lastIp,
          isOnline: status.isOnline,
          speedKbps: status.speedKbps,
          isBlocked: updated.isBlocked,
          lastSeenAt: updated.lastSeenAt.toISOString(),
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ isBlocked: t.Boolean() }),
    },
  )

  // ─── POST /user/devices/:id/token ──────────────────────
  // Issues a VPN connection token for the device.
  // Requires an active subscription.
  .post(
    "/:id/token",
    async ({ user, params, set }) => {
      try {
        // 1. Verify device belongs to user
        const device = await db.device.findUnique({
          where: { id: params.id },
        });

        if (!device) {
          set.status = 404;
          return { message: "Устройство не найдено" };
        }
        if (device.userId !== user.userId) {
          set.status = 403;
          return { message: "Доступ запрещен" };
        }
        if (device.isBlocked) {
          set.status = 403;
          return { message: "Устройство заблокировано" };
        }

        // 2. Check active subscription
        const sub = await db.subscription.findUnique({
          where: { userId: user.userId },
        });

        if (!sub || new Date() > new Date(sub.activeUntil)) {
          set.status = 403;
          return { message: "Нет активной подписки" };
        }

        // 3. Check device limits based on plan
        const planLimits: Record<string, number> = {
          starter: 1,
          pro: 3,
          advanced: 5,
        };
        const maxDevices = planLimits[sub.planId] ?? 1;

        // Note: Currently we don't strictly enforce max active devices *logging in*,
        // but we can check how many *tokens* they have or just allow it and let the
        // VPN server drop old connections if they exceed limits.
        // For now, we issue the token freely as long as the sub is valid.

        // Generate a secure random token
        const rawToken =
          crypto.randomUUID().replace(/-/g, "") +
          crypto.randomUUID().replace(/-/g, "");

        // Upsert the token for this specific device
        const token = await db.vpnToken.upsert({
          where: {
            userId_deviceId: {
              userId: user.userId,
              deviceId: device.id,
            },
          },
          update: {
            token: rawToken,
            expiresAt: sub.activeUntil,
          },
          create: {
            userId: user.userId,
            deviceId: device.id,
            token: rawToken,
            expiresAt: sub.activeUntil,
          },
        });

        return {
          success: true,
          token: token.token,
          expiresAt: token.expiresAt.toISOString(),
        };
      } catch (err: any) {
        console.error("[Token Issuance Error]:", err);
        set.status = 500;
        return { message: err.message || "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );
