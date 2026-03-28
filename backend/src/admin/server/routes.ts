import Elysia, { t } from "elysia";
import crypto from "crypto";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";
import { config } from "../../config";
import { deployHysteriaNode } from "./deploy";
import { decryptSecret, encryptSecret } from "./secret-box";

const MAX_DEPLOY_MESSAGE_LENGTH = 8_000;

type VpnServerRow = Awaited<ReturnType<typeof db.vpnServer.findUnique>>;

function hasText(value?: string | null) {
  return Boolean(value && value.trim());
}

function isMeaningfulLocation(value?: string | null) {
  return hasText(value) && value !== "Unknown, UN";
}

function getDateValue(value?: Date | null) {
  if (!value) {
    return 0;
  }
  return new Date(value).getTime();
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeHostname(value?: string | null) {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeTelegramUsername(value?: string | null) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const username = normalized.replace(/^@+/, "").trim();
  if (!username) {
    return null;
  }

  return `@${username}`;
}

function normalizeMtprotoAdTag(value?: string | null) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const adTag = normalized.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(adTag)) {
    throw new Error("MTProto ad tag must be 32 hex characters");
  }

  return adTag;
}

function normalizeMtprotoSecret(value?: string | null) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const secret = normalized.toLowerCase();
  if (!/^(?:[0-9a-f]{32}|(?:dd|ee)[0-9a-f]{32})$/.test(secret)) {
    throw new Error(
      "MTProto secret must contain 32 hex characters; dd/ee prefix is optional",
    );
  }

  return /^(dd|ee)/.test(secret) ? secret.slice(2) : secret;
}

function generateMtprotoSecret() {
  return crypto.randomBytes(16).toString("hex");
}

function serializeMtprotoSecret(value?: string | null) {
  const secret = normalizeOptionalString(value)?.toLowerCase();
  if (!secret) {
    return null;
  }
  return /^(dd|ee)[0-9a-f]{32}$/.test(secret) ? secret.slice(2) : secret;
}

function toPublishedMtprotoSecret(value?: string | null) {
  const secret = normalizeOptionalString(value)?.toLowerCase();
  if (!secret) {
    return null;
  }
  if (/^(dd|ee)[0-9a-f]{32}$/.test(secret)) {
    return secret;
  }
  if (/^[0-9a-f]{32}$/.test(secret)) {
    return `dd${secret}`;
  }
  return secret;
}

function normalizeConnectLinkTemplate(value?: string | null) {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("vless://")) {
    const [baseUrl, tag] = trimmed.split("#");
    let normalized = baseUrl;
    if (!normalized.includes("type=")) {
      const separator = normalized.includes("?") ? "&" : "?";
      normalized = `${normalized}${separator}type=tcp`;
    }
    if (
      normalized.includes("security=reality") &&
      !normalized.includes("flow=")
    ) {
      normalized = normalized.replace(
        "security=reality",
        "flow=xtls-rprx-vision&security=reality",
      );
    }
    return `${normalized}${tag ? `#${tag}` : ""}`;
  }

  return trimmed;
}

function sanitizePm2Name(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function defaultPm2ProcessName(server: {
  ip: string;
  hostname?: string | null;
  id?: string | null;
}) {
  const suffix = sanitizePm2Name(server.hostname || server.ip || server.id || "node");
  return `${config.VPN_NODE_PM2_PREFIX}-${suffix || "node"}`;
}

function getServerScore(server: NonNullable<VpnServerRow>) {
  let score = 0;
  if (hasText(server.hostname)) score += 100;
  if (hasText(server.sshUsername)) score += 80;
  if (hasText(server.sshPasswordEncrypted)) score += 80;
  if (hasText(server.pm2ProcessName)) score += 20;
  if (hasText(server.connectLinkTemplate)) score += 20;
  if (isMeaningfulLocation(server.location)) score += 10;
  if (server.deployStatus === "deploying") score += 40;
  if (server.deployStatus === "deployed") score += 30;
  if (server.status === "online") score += 10;
  return score;
}

function mergeServerRows(rows: NonNullable<VpnServerRow>[]) {
  const ordered = [...rows].sort((left, right) => {
    const scoreDiff = getServerScore(right) - getServerScore(left);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const seenDiff = getDateValue(right.lastSeenAt) - getDateValue(left.lastSeenAt);
    if (seenDiff !== 0) {
      return seenDiff;
    }

    return getDateValue(right.createdAt) - getDateValue(left.createdAt);
  });

  const merged = { ...ordered[0] };

  for (const candidate of ordered.slice(1)) {
    if (!hasText(merged.hostname) && hasText(candidate.hostname)) {
      merged.hostname = candidate.hostname;
    }
    if (!hasText(merged.sshUsername) && hasText(candidate.sshUsername)) {
      merged.sshUsername = candidate.sshUsername;
    }
    if (
      !hasText(merged.sshPasswordEncrypted) &&
      hasText(candidate.sshPasswordEncrypted)
    ) {
      merged.sshPasswordEncrypted = candidate.sshPasswordEncrypted;
    }
    if (!hasText(merged.pm2ProcessName) && hasText(candidate.pm2ProcessName)) {
      merged.pm2ProcessName = candidate.pm2ProcessName;
    }
    if (
      !hasText(merged.connectLinkTemplate) &&
      hasText(candidate.connectLinkTemplate)
    ) {
      merged.connectLinkTemplate = candidate.connectLinkTemplate;
    }
    if (!isMeaningfulLocation(merged.location) && isMeaningfulLocation(candidate.location)) {
      merged.location = candidate.location;
    }
    if (
      (!Array.isArray(merged.supportedProtocols) ||
        merged.supportedProtocols.length === 0) &&
      Array.isArray(candidate.supportedProtocols) &&
      candidate.supportedProtocols.length > 0
    ) {
      merged.supportedProtocols = candidate.supportedProtocols;
    }
    if (merged.serverType !== "hysteria2" && hasText(candidate.serverType)) {
      merged.serverType = candidate.serverType;
    }
    if (getDateValue(candidate.lastSeenAt) > getDateValue(merged.lastSeenAt)) {
      merged.lastSeenAt = candidate.lastSeenAt;
      merged.currentLoad = candidate.currentLoad;
      merged.status = candidate.status;
    }
    if (getDateValue(candidate.deployedAt) > getDateValue(merged.deployedAt)) {
      merged.deployedAt = candidate.deployedAt;
      merged.deployStatus = candidate.deployStatus;
      merged.deployMessage = candidate.deployMessage;
    }
  }

  return merged;
}

function truncateDeployMessage(...parts: Array<string | null | undefined>) {
  const message = parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!message) {
    return null;
  }

  if (message.length <= MAX_DEPLOY_MESSAGE_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_DEPLOY_MESSAGE_LENGTH)}\n\n...[truncated]`;
}

function serializeServer(server: NonNullable<VpnServerRow>) {
  return {
    id: server.id,
    ip: String(server.ip),
    hostname: server.hostname ? String(server.hostname) : null,
    sshUsername: server.sshUsername ? String(server.sshUsername) : null,
    hasSshPassword: Boolean(server.sshPasswordEncrypted),
    port: Number(server.port ?? 443),
    status: String(server.status ?? "offline"),
    deployStatus: String(server.deployStatus ?? "not_deployed"),
    deployMessage: server.deployMessage ? String(server.deployMessage) : null,
    deployedAt: server.deployedAt ? new Date(server.deployedAt).toISOString() : null,
    pm2ProcessName: server.pm2ProcessName ? String(server.pm2ProcessName) : null,
    currentLoad: Number(server.currentLoad ?? 0),
    lastSeenAt: server.lastSeenAt ? new Date(server.lastSeenAt).toISOString() : null,
    createdAt: server.createdAt ? new Date(server.createdAt).toISOString() : null,
    serverType: String(server.serverType ?? "hysteria2"),
    supportedProtocols: Array.isArray(server.supportedProtocols)
      ? server.supportedProtocols.map((item: unknown) => String(item))
      : [],
    location: String(server.location ?? "Unknown, UN"),
    connectLinkTemplate: normalizeConnectLinkTemplate(
      server.connectLinkTemplate ? String(server.connectLinkTemplate) : null,
    ),
  };
}

async function getServerOrNull(id: string, mergeDuplicates = false) {
  const server = await db.vpnServer.findUnique({ where: { id } });
  if (!server || !mergeDuplicates) {
    return server;
  }

  const siblings = await db.vpnServer.findMany({
    where: { ip: server.ip },
  });
  if (siblings.length <= 1) {
    return server;
  }

  const merged = mergeServerRows(siblings as NonNullable<VpnServerRow>[]);
  return { ...merged, id: server.id };
}

async function getMergedServerList() {
  const servers = await db.vpnServer.findMany({
    orderBy: [{ createdAt: "desc" }, { lastSeenAt: "desc" }],
  });

  const groups = new Map<string, NonNullable<VpnServerRow>[]>();
  for (const server of servers as NonNullable<VpnServerRow>[]) {
    const bucket = groups.get(server.ip);
    if (bucket) {
      bucket.push(server);
    } else {
      groups.set(server.ip, [server]);
    }
  }

  return [...groups.values()]
    .map((group) => mergeServerRows(group))
    .sort(
      (left, right) =>
        getDateValue(right.lastSeenAt ?? right.createdAt) -
        getDateValue(left.lastSeenAt ?? left.createdAt),
    );
}

async function runServerDeployment(serverId: string) {
  let currentServer = await getServerOrNull(serverId, true);

  try {
    if (!currentServer) {
      throw new Error("Server not found");
    }
    if (!currentServer.hostname) {
      throw new Error("Hostname is required for deployment");
    }
    if (!currentServer.sshUsername || !currentServer.sshPasswordEncrypted) {
      throw new Error("SSH credentials are not configured");
    }

    const pm2ProcessName =
      normalizeOptionalString(currentServer.pm2ProcessName) ??
      defaultPm2ProcessName(currentServer);
    const mtproto = (await db.mtprotoSettings.findFirst({})) ?? {};
    const sshPassword = decryptSecret(String(currentServer.sshPasswordEncrypted));

    const result = await deployHysteriaNode(
      {
        ip: String(currentServer.ip),
        hostname: String(currentServer.hostname),
        sshUsername: String(currentServer.sshUsername),
        sshPassword,
        pm2ProcessName,
        serverId: String(currentServer.id),
      },
      mtproto,
    );

    await db.vpnServer.update({
      where: { id: serverId },
      data: {
        pm2ProcessName,
        deployStatus: "deployed",
        deployMessage: truncateDeployMessage(result.stdout, result.stderr),
        deployedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[AdminServerDeploy] error:", error);
    currentServer = currentServer ?? (await getServerOrNull(serverId, true));
    const pm2ProcessName = currentServer
      ? normalizeOptionalString(currentServer.pm2ProcessName) ??
        defaultPm2ProcessName(currentServer)
      : null;

    if (currentServer) {
      await db.vpnServer.update({
        where: { id: serverId },
        data: {
          pm2ProcessName,
          deployStatus: "failed",
          deployMessage: truncateDeployMessage(
            error instanceof Error ? error.message : String(error),
          ),
        },
      });
    }
  }
}

export const adminServerRoutes = new Elysia({ prefix: "/admin/server" })
  .use(adminMiddleware)
  .get("/list", async () => {
    const servers = await getMergedServerList();
    return servers.map((server) => serializeServer(server));
  })
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const ip = body.ip.trim();
        const hostname = normalizeHostname(body.hostname);
        const location = normalizeOptionalString(body.location) ?? "Unknown, UN";
        const sshUsername = normalizeOptionalString(body.sshUsername);
        const pm2ProcessName =
          normalizeOptionalString(body.pm2ProcessName) ??
          defaultPm2ProcessName({ ip, hostname });

        if (!ip) {
          set.status = 400;
          return { message: "IP address is required" };
        }
        if (!hostname) {
          set.status = 400;
          return { message: "Hostname is required for TLS issuance" };
        }
        if (!sshUsername || !body.sshPassword.trim()) {
          set.status = 400;
          return { message: "SSH username and password are required" };
        }

        const existing = await db.vpnServer.findFirst({
          where: { ip },
        });

        if (existing) {
          const updated = await db.vpnServer.update({
            where: { id: existing.id },
            data: {
              hostname,
              sshUsername,
              sshPasswordEncrypted: encryptSecret(body.sshPassword.trim()),
              location,
              pm2ProcessName:
                pm2ProcessName || defaultPm2ProcessName({ ip, hostname }),
              connectLinkTemplate: normalizeConnectLinkTemplate(
                body.connectLinkTemplate,
              ),
              serverType: existing.serverType || "hysteria2",
              supportedProtocols:
                Array.isArray(existing.supportedProtocols) &&
                existing.supportedProtocols.length > 0
                  ? existing.supportedProtocols
                  : ["hysteria2"],
            },
          });

          return serializeServer(updated);
        }

        const created = await db.vpnServer.create({
          data: {
            ip,
            hostname,
            sshUsername,
            sshPasswordEncrypted: encryptSecret(body.sshPassword.trim()),
            port: 443,
            status: "offline",
            deployStatus: "not_deployed",
            deployMessage: null,
            pm2ProcessName,
            currentLoad: 0,
            serverType: "hysteria2",
            supportedProtocols: ["hysteria2"],
            location,
            connectLinkTemplate: normalizeConnectLinkTemplate(
              body.connectLinkTemplate,
            ),
          },
        });

        set.status = 201;
        return serializeServer(created);
      } catch (error) {
        console.error("[AdminServerCreate] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        ip: t.String(),
        hostname: t.String(),
        location: t.Optional(t.String()),
        sshUsername: t.String(),
        sshPassword: t.String(),
        pm2ProcessName: t.Optional(t.String()),
        connectLinkTemplate: t.Optional(t.Nullable(t.String())),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      try {
        const existing = await getServerOrNull(params.id);
        if (!existing) {
          set.status = 404;
          return { message: "Server not found" };
        }

        const nextIp = body.ip?.trim();
        if (nextIp && nextIp !== existing.ip) {
          const duplicate = await db.vpnServer.findFirst({
            where: { ip: nextIp },
          });
          if (duplicate && duplicate.id !== existing.id) {
            set.status = 409;
            return { message: "Server with this IP already exists" };
          }
        }

        const updated = await db.vpnServer.update({
          where: { id: params.id },
          data: {
            ...(body.ip !== undefined ? { ip: body.ip.trim() } : {}),
            ...(body.location !== undefined
              ? {
                  location:
                    normalizeOptionalString(body.location) ?? "Unknown, UN",
                }
              : {}),
            ...(body.hostname !== undefined
              ? { hostname: normalizeHostname(body.hostname) }
              : {}),
            ...(body.connectLinkTemplate !== undefined
              ? {
                  connectLinkTemplate: normalizeConnectLinkTemplate(
                    body.connectLinkTemplate,
                  ),
                }
              : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
            ...(body.serverType !== undefined
              ? { serverType: body.serverType }
              : {}),
            ...(body.sshUsername !== undefined
              ? { sshUsername: normalizeOptionalString(body.sshUsername) }
              : {}),
            ...(body.pm2ProcessName !== undefined
              ? {
                  pm2ProcessName:
                    normalizeOptionalString(body.pm2ProcessName) ??
                    defaultPm2ProcessName({
                      id: existing.id,
                      ip: nextIp || existing.ip,
                      hostname:
                        body.hostname !== undefined
                          ? normalizeHostname(body.hostname)
                          : existing.hostname,
                    }),
                }
              : {}),
            ...(body.sshPassword !== undefined && body.sshPassword.trim()
              ? {
                  sshPasswordEncrypted: encryptSecret(body.sshPassword.trim()),
                }
              : {}),
          },
        });

        return serializeServer(updated);
      } catch (error) {
        console.error("[AdminServerUpdate] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        ip: t.Optional(t.String()),
        location: t.Optional(t.String()),
        hostname: t.Optional(t.Nullable(t.String())),
        connectLinkTemplate: t.Optional(t.Nullable(t.String())),
        status: t.Optional(t.String()),
        serverType: t.Optional(t.String()),
        sshUsername: t.Optional(t.Nullable(t.String())),
        sshPassword: t.Optional(t.String()),
        pm2ProcessName: t.Optional(t.Nullable(t.String())),
      }),
    },
  )
  .post("/:id/deploy", async ({ params, set }) => {
    try {
      const server = await getServerOrNull(params.id, true);
      if (!server) {
        set.status = 404;
        return { message: "Server not found" };
      }
      if (!server.hostname) {
        set.status = 400;
        return { message: "Hostname is required before deployment" };
      }
      if (!server.sshUsername || !server.sshPasswordEncrypted) {
        set.status = 400;
        return { message: "SSH credentials are required before deployment" };
      }
      if (server.deployStatus === "deploying") {
        set.status = 409;
        return { message: "Deployment is already in progress" };
      }

      await db.vpnServer.update({
        where: { id: params.id },
        data: {
          deployStatus: "deploying",
          deployMessage: "Deployment started",
          pm2ProcessName:
            normalizeOptionalString(server.pm2ProcessName) ??
            defaultPm2ProcessName(server),
        },
      });

      queueMicrotask(() => {
        void runServerDeployment(params.id);
      });

      set.status = 202;
      return { success: true, status: "deploying" };
    } catch (error) {
      console.error("[AdminServerDeployStart] error:", error);
      set.status = 500;
      return { message: "Internal server error" };
    }
  })
  .get("/mtproto", async ({ set }) => {
    try {
      const settings = await db.mtprotoSettings.findFirst({});
      if (!settings) {
        return {
          id: "global",
          enabled: false,
          port: 8443,
          secret: null,
          adTag: null,
          channelUsername: null,
          botUsername: null,
          addChannelOnConnect: false,
        };
      }

      return {
        ...settings,
        secret: serializeMtprotoSecret(settings.secret),
      };
    } catch (error) {
      console.error("[AdminServerMtprotoGet] error:", error);
      set.status = 500;
      return { message: "Internal server error" };
    }
  })
  .patch(
    "/mtproto",
    async ({ body, set }) => {
      try {
        const normalizedPayload = {
          ...body,
          port:
            typeof body.port === "number" && Number.isFinite(body.port)
              ? Math.max(1, Math.trunc(body.port))
              : body.port,
          secret: toPublishedMtprotoSecret(normalizeMtprotoSecret(body.secret)),
          adTag: normalizeMtprotoAdTag(body.adTag),
          channelUsername: normalizeTelegramUsername(body.channelUsername),
          botUsername: normalizeTelegramUsername(body.botUsername),
        };

        const existing = await db.mtprotoSettings.findFirst({});
        if (normalizedPayload.enabled && !normalizedPayload.secret && !existing?.secret) {
          normalizedPayload.secret = generateMtprotoSecret();
        }

        if (existing) {
          return await db.mtprotoSettings.update({
            where: { id: "global" },
            data: normalizedPayload,
          });
        }

        return await db.mtprotoSettings.create({
          data: { id: "global", ...normalizedPayload },
        });
      } catch (error) {
        console.error("[AdminServerMtprotoPatch] error:", error);
        set.status =
          error instanceof Error && error.message.startsWith("MTProto")
            ? 400
            : 500;
        return {
          message:
            error instanceof Error ? error.message : "Internal server error",
        };
      }
    },
    {
      body: t.Object({
        enabled: t.Optional(t.Boolean()),
        port: t.Optional(t.Number()),
        secret: t.Optional(t.Nullable(t.String())),
        adTag: t.Optional(t.Nullable(t.String())),
        channelUsername: t.Optional(t.Nullable(t.String())),
        botUsername: t.Optional(t.Nullable(t.String())),
        addChannelOnConnect: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete("/:id", async ({ params, set }) => {
    try {
      const server = await getServerOrNull(params.id, true);
      if (!server) {
        set.status = 404;
        return { message: "Server not found" };
      }

      const siblings = await db.vpnServer.findMany({
        where: { ip: server.ip },
      });

      for (const sibling of siblings) {
        await db.vpnServer.delete({
          where: { id: sibling.id },
        });
      }

      return { success: true };
    } catch (error) {
      console.error("[AdminServerDelete] error:", error);
      set.status = 500;
      return { message: "Internal server error" };
    }
  });
