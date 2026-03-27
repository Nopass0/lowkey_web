/**
 * @fileoverview VPN Server routes: registration, heartbeat, listing, session events.
 * Used by VPN nodes to communicate with the central backend.
 */

import Elysia, { t } from "elysia";
import { X509Certificate, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { URL } from "url";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";
import { config } from "../config";
import {
  getUserActiveConnectionCount,
  resolveVpnPolicyForUser,
} from "../vpn/policy";

function requireServerSecret(
  headers: Record<string, string | undefined>,
  set: { status?: number | string },
) {
  if (!config.BACKEND_SECRET) {
    return true;
  }

  if (headers["x-server-secret"] !== config.BACKEND_SECRET) {
    set.status = 401;
    return false;
  }

  return true;
}

function requireTLSMaterialSecret(
  headers: Record<string, string | undefined>,
  set: { status?: number | string },
) {
  if (!config.BACKEND_SECRET) {
    set.status = 503;
    return false;
  }

  if (headers["x-server-secret"] !== config.BACKEND_SECRET) {
    set.status = 401;
    return false;
  }

  return true;
}

async function loadVpnTLSMaterial() {
  if (config.VPN_TLS_CERT_PEM && config.VPN_TLS_KEY_PEM) {
    return {
      certPem: config.VPN_TLS_CERT_PEM,
      keyPem: config.VPN_TLS_KEY_PEM,
      source: "env",
    };
  }

  if (config.VPN_TLS_CERT_FILE && config.VPN_TLS_KEY_FILE) {
    const [certPem, keyPem] = await Promise.all([
      readFile(config.VPN_TLS_CERT_FILE, "utf8"),
      readFile(config.VPN_TLS_KEY_FILE, "utf8"),
    ]);
    return { certPem, keyPem, source: "file" };
  }

  if (config.LETSENCRYPT_EMAIL) {
    return loadVpnLetsEncryptMaterial();
  }

  return null;
}

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function getVpnTLSCertNameCandidates() {
  const candidates = new Set<string>();

  if (config.VPN_TLS_CERT_NAME) {
    candidates.add(normalizeHostname(config.VPN_TLS_CERT_NAME));
  }

  try {
    candidates.add(normalizeHostname(new URL(config.SITE_URL).hostname));
  } catch {
    if (config.SITE_URL) {
      candidates.add(normalizeHostname(config.SITE_URL));
    }
  }

  const suffix = normalizeHostname(config.VPN_TLS_ALLOWED_SUFFIX.replace(/^\./, ""));
  if (suffix) {
    candidates.add(suffix);
  }

  return [...candidates].filter(Boolean);
}

async function loadVpnLetsEncryptMaterial() {
  for (const certName of getVpnTLSCertNameCandidates()) {
    const certPath = `${config.VPN_TLS_CERTBOT_DIR}/${certName}/fullchain.pem`;
    const keyPath = `${config.VPN_TLS_CERTBOT_DIR}/${certName}/privkey.pem`;

    try {
      const [certPem, keyPem] = await Promise.all([
        readFile(certPath, "utf8"),
        readFile(keyPath, "utf8"),
      ]);

      return {
        certPem,
        keyPem,
        source: "letsencrypt",
      };
    } catch {
      continue;
    }
  }

  return null;
}

function isAllowedTLSHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  const suffix = config.VPN_TLS_ALLOWED_SUFFIX.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (!suffix) {
    return true;
  }
  return normalized.endsWith(suffix);
}

function verifyHostnameAgainstCert(certPem: string, hostname: string) {
  const cert = new X509Certificate(certPem);
  return Boolean(cert.checkHost(normalizeHostname(hostname)));
}

export const vpnServerRoutes = new Elysia({ prefix: "/servers" })
  .post(
    "/register",
    async ({ body, headers, set }) => {
      if (!requireServerSecret(headers, set)) {
        return { message: "Unauthorized" };
      }

      try {
        const { ip, hostname, port, supportedProtocols, serverType } = body;
        const existing = await db.vpnServer.findFirst({
          where: { ip, port },
        });

        if (existing) {
          const updated = await db.vpnServer.update({
            where: { id: existing.id },
            data: {
              hostname: hostname ?? existing.hostname ?? null,
              supportedProtocols,
              serverType,
              status: "online",
              lastSeenAt: new Date(),
            },
          });
          return { success: true, serverId: updated.id };
        }

        const server = await db.vpnServer.create({
          data: {
            ip,
            hostname: hostname ?? null,
            port,
            supportedProtocols,
            serverType,
            status: "online",
            currentLoad: 0,
          },
        });

        return { success: true, serverId: server.id };
      } catch (error) {
        console.error("[ServerRegister] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        ip: t.String(),
        hostname: t.Optional(t.Nullable(t.String())),
        port: t.Number(),
        supportedProtocols: t.Array(t.String()),
        serverType: t.String(),
      }),
    },
  )
  .post(
    "/tls-material",
    async ({ body, headers, set }) => {
      if (!requireTLSMaterialSecret(headers, set)) {
        return {
          message: config.BACKEND_SECRET
            ? "Unauthorized"
            : "BACKEND_SECRET is required for TLS material provisioning",
        };
      }

      try {
        const hostname = normalizeHostname(body.hostname);
        if (!isAllowedTLSHostname(hostname)) {
          set.status = 400;
          return { message: "Hostname is not allowed for VPN TLS provisioning" };
        }

        const material = await loadVpnTLSMaterial();
        if (!material) {
          set.status = 503;
          return { message: "VPN TLS material is not configured on backend" };
        }

        if (!verifyHostnameAgainstCert(material.certPem, hostname)) {
          set.status = 409;
          return { message: "Configured TLS certificate does not cover requested hostname" };
        }

        return {
          hostname,
          certPem: material.certPem,
          keyPem: material.keyPem,
          source: material.source,
        };
      } catch (error) {
        console.error("[ServerTLSMaterial] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        hostname: t.String(),
        serverId: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/heartbeat",
    async ({ body, headers, set }) => {
      if (!requireServerSecret(headers, set)) {
        return { message: "Unauthorized" };
      }

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
      } catch (error) {
        console.error("[ServerHeartbeat] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        serverId: t.String(),
        currentLoad: t.Number(),
        activeConnections: t.Optional(t.Number()),
      }),
    },
  )
  .post(
    "/session-event",
    async ({ body, headers, set }) => {
      if (!requireServerSecret(headers, set)) {
        return { message: "Unauthorized" };
      }

      try {
        const {
          event,
          sessionId,
          userId,
          serverId,
          serverIp,
          protocol,
          deviceId,
          deviceName,
          deviceOs,
          clientVersion,
          remoteAddr,
          bytesUp,
          bytesDown,
        } = body;

        const protocolName = protocol ?? "hysteria2";

        if (event === "connect") {
          const id = sessionId ?? randomUUID();

          await db.vpnSession.upsert({
            where: { id },
            update: {
              status: "active",
              lastSeenAt: new Date(),
              deviceId: deviceId ?? null,
              deviceName: deviceName ?? null,
              deviceOs: deviceOs ?? null,
              clientVersion: clientVersion ?? null,
              remoteAddr: remoteAddr ?? null,
              serverId: serverId ?? null,
              serverIp: serverIp ?? null,
              protocol: protocolName,
            },
            create: {
              id,
              userId,
              serverId: serverId ?? null,
              serverIp: serverIp ?? null,
              protocol: protocolName,
              deviceId: deviceId ?? null,
              deviceName: deviceName ?? null,
              deviceOs: deviceOs ?? null,
              clientVersion: clientVersion ?? null,
              remoteAddr: remoteAddr ?? null,
              status: "active",
              connectedAt: new Date(),
              lastSeenAt: new Date(),
              bytesUp: 0,
              bytesDown: 0,
            },
          });

          const stats = await db.vpnUserProtocolStat.findFirst({
            where: { userId, protocol: protocolName },
          });

          if (stats) {
            await db.vpnUserProtocolStat.update({
              where: { id: stats.id },
              data: {
                activeConnections: Number(stats.activeConnections ?? 0) + 1,
                sessionCount: Number(stats.sessionCount ?? 0) + 1,
                lastSeenAt: new Date(),
                lastDeviceId: deviceId ?? stats.lastDeviceId ?? null,
                lastServerId: serverId ?? stats.lastServerId ?? null,
              },
            });
          } else {
            await db.vpnUserProtocolStat.create({
              data: {
                id: randomUUID(),
                userId,
                protocol: protocolName,
                sessionCount: 1,
                activeConnections: 1,
                totalBytesUp: 0,
                totalBytesDown: 0,
                lastSeenAt: new Date(),
                lastDeviceId: deviceId ?? null,
                lastServerId: serverId ?? null,
              },
            });
          }

          return { success: true, sessionId: id };
        }

        if (event === "disconnect" || event === "traffic") {
          if (!sessionId) {
            return { success: false, reason: "sessionId required" };
          }

          const session = await db.vpnSession.findUnique({
            where: { id: sessionId },
          });

          if (!session) {
            return { success: false, reason: "session not found" };
          }

          const up = Number(bytesUp ?? 0);
          const down = Number(bytesDown ?? 0);
          const deltaUp = Math.max(0, up - Number(session.bytesUp ?? 0));
          const deltaDown = Math.max(0, down - Number(session.bytesDown ?? 0));

          await db.vpnSession.update({
            where: { id: sessionId },
            data: {
              bytesUp: up,
              bytesDown: down,
              lastSeenAt: new Date(),
              ...(event === "disconnect"
                ? {
                    status: "disconnected",
                    disconnectedAt: new Date(),
                  }
                : {}),
            },
          });

          const stats = await db.vpnUserProtocolStat.findFirst({
            where: {
              userId: session.userId,
              protocol: session.protocol,
            },
          });

          if (stats) {
            await db.vpnUserProtocolStat.update({
              where: { id: stats.id },
              data: {
                totalBytesUp: Number(stats.totalBytesUp ?? 0) + deltaUp,
                totalBytesDown: Number(stats.totalBytesDown ?? 0) + deltaDown,
                lastSeenAt: new Date(),
                ...(event === "disconnect"
                  ? {
                      activeConnections: Math.max(
                        0,
                        Number(stats.activeConnections ?? 0) - 1,
                      ),
                    }
                  : {}),
              },
            });
          }

          return { success: true };
        }

        return { success: false, reason: "unknown event" };
      } catch (error) {
        console.error("[SessionEvent] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        event: t.Union([
          t.Literal("connect"),
          t.Literal("disconnect"),
          t.Literal("traffic"),
        ]),
        sessionId: t.Optional(t.String()),
        userId: t.String(),
        serverId: t.Optional(t.String()),
        serverIp: t.Optional(t.String()),
        protocol: t.Optional(t.String()),
        deviceId: t.Optional(t.String()),
        deviceName: t.Optional(t.String()),
        deviceOs: t.Optional(t.String()),
        clientVersion: t.Optional(t.String()),
        remoteAddr: t.Optional(t.String()),
        bytesUp: t.Optional(t.Number()),
        bytesDown: t.Optional(t.Number()),
      }),
    },
  )
  .post(
    "/report-domains",
    async ({ body, headers, set }) => {
      if (!requireServerSecret(headers, set)) {
        return { message: "Unauthorized" };
      }

      try {
        const { userId, domains } = body;

        for (const entry of domains) {
          const existing = await db.vpnDomainStats.findFirst({
            where: {
              userId,
              domain: entry.domain,
            },
          });

          if (existing) {
            await db.vpnDomainStats.update({
              where: { id: existing.id },
              data: {
                visitCount: Number(existing.visitCount ?? 0) + entry.visitCount,
                bytesTransferred:
                  Number(existing.bytesTransferred ?? 0) +
                  (entry.bytesTransferred ?? 0),
                lastVisitAt: new Date(),
              },
            });
          } else {
            await db.vpnDomainStats.create({
              data: {
                id: randomUUID(),
                userId,
                domain: entry.domain,
                visitCount: entry.visitCount,
                bytesTransferred: entry.bytesTransferred ?? 0,
                firstVisitAt: new Date(),
                lastVisitAt: new Date(),
              },
            });
          }
        }

        return { success: true };
      } catch (error) {
        console.error("[ReportDomains] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
        domains: t.Array(
          t.Object({
            domain: t.String(),
            visitCount: t.Number(),
            bytesTransferred: t.Optional(t.Number()),
          }),
        ),
      }),
    },
  )
  .post(
    "/validate-token",
    async ({ body, headers, set }) => {
      if (!requireServerSecret(headers, set)) {
        return { message: "Unauthorized" };
      }

      try {
        const { token, protocol } = body;

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
        const subscriptionExpired =
          !sub || (!sub.isLifetime && sub.activeUntil < new Date());

        const policy = await resolveVpnPolicyForUser(user.id, {
          planId: sub?.planId ?? null,
          userOverrides: {
            vpnMaxDevices: user.vpnMaxDevices,
            vpnMaxConcurrentConnections: user.vpnMaxConcurrentConnections,
            vpnSpeedLimitUpMbps: user.vpnSpeedLimitUpMbps,
            vpnSpeedLimitDownMbps: user.vpnSpeedLimitDownMbps,
          },
        });

        const activeConnections = await getUserActiveConnectionCount(user.id);

        if (
          !subscriptionExpired &&
          activeConnections >= policy.effective.maxConcurrentConnections
        ) {
          return {
            valid: false,
            reason: `Concurrent connection limit exceeded (${policy.effective.maxConcurrentConnections})`,
            userId: user.id,
            limits: policy.effective,
            usage: { activeConnections },
          };
        }

        return {
          valid: true,
          userId: user.id,
          deviceId: vpnToken.deviceId,
          protocol: protocol ?? "hysteria2",
          subscriptionExpired,
          limits: policy.effective,
          usage: { activeConnections },
        };
      } catch (error) {
        console.error("[ValidateToken] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        token: t.String(),
        protocol: t.Optional(t.String()),
      }),
    },
  )
  .get("/list", async ({ set }) => {
    try {
      const servers = await db.vpnServer.findMany({
        where: { status: "online" },
        select: {
          id: true,
          ip: true,
          hostname: true,
          port: true,
          supportedProtocols: true,
          serverType: true,
          currentLoad: true,
          location: true,
        },
        orderBy: { currentLoad: "asc" },
      });
      return { servers, updatedAt: new Date().toISOString() };
    } catch (error) {
      console.error("[ServerList] error:", error);
      set.status = 500;
      return { message: "Internal server error" };
    }
  })
  .use(authMiddleware)
  .get("/", async ({ set }) => {
    try {
      return await db.vpnServer.findMany({
        where: { status: "online" },
        select: {
          id: true,
          ip: true,
          hostname: true,
          port: true,
          supportedProtocols: true,
          serverType: true,
          currentLoad: true,
          location: true,
        },
        orderBy: {
          currentLoad: "asc",
        },
      });
    } catch (error) {
      console.error("[ServerListAuth] error:", error);
      set.status = 500;
      return { message: "Internal server error" };
    }
  });
