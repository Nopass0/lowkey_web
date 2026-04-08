/**
 * @fileoverview Admin user management routes.
 * All routes require admin authentication.
 */

import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";
import { resolveVpnPolicyForUser } from "../../vpn/policy";
import { buildAdminDomainStats } from "./domain-stats";

const ACTIVE_VPN_SESSION_STALE_MS = 5 * 60 * 1000;
const ACTIVE_DOMAIN_WINDOW_MS = 2 * 60 * 1000;
const SESSION_HISTORY_LIMIT = 200;
const DOMAIN_HISTORY_LIMIT = 1000;
const ACTIVE_DOMAIN_LIMIT = 100;

function parseOptionalBooleanFilter(value?: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function serializeAdminUser(user: {
  id: string;
  login: string;
  balance: number;
  referralBalance: number;
  isBanned: boolean;
  hideAiMenu: boolean;
  joinedAt: Date;
  subscription: {
    planId: string;
    activeUntil: Date;
  } | null;
  _count: {
    devices: number;
  };
}) {
  return {
    id: user.id,
    login: user.login,
    balance: user.balance,
    referralBalance: user.referralBalance,
    isBanned: user.isBanned,
    hideAiMenu: user.hideAiMenu,
    plan: user.subscription?.planId ?? null,
    activeUntil: user.subscription?.activeUntil.toISOString() ?? null,
    joinedAt: user.joinedAt.toISOString(),
    deviceCount: user._count.devices,
  };
}

export const adminUserRoutes = new Elysia({ prefix: "/admin/users" })
  .use(adminMiddleware)
  .get(
    "/",
    async ({ query, set }) => {
      try {
        const page = parseInt(query.page ?? "1");
        const pageSize = parseInt(query.pageSize ?? "8");
        const skip = (page - 1) * pageSize;
        const search = query.search?.trim() ?? "";
        const isBanned = parseOptionalBooleanFilter(query.isBanned);
        const hasSubscription = parseOptionalBooleanFilter(query.hasSubscription);
        const hideAiMenu = parseOptionalBooleanFilter(query.hideAiMenu);
        const plan = query.plan?.trim() || undefined;

        const where = {
          ...(search
            ? {
                OR: [
                  { login: { contains: search, mode: "insensitive" as const } },
                  { id: { equals: search } },
                ],
              }
            : {}),
          ...(typeof isBanned === "boolean" ? { isBanned } : {}),
          ...(typeof hideAiMenu === "boolean" ? { hideAiMenu } : {}),
          ...(typeof hasSubscription === "boolean"
            ? {
                subscription: hasSubscription ? { isNot: null } : { is: null },
              }
            : {}),
          ...(plan ? { subscription: { is: { planId: plan } } } : {}),
        };

        const [users, total] = await Promise.all([
          db.user.findMany({
            where,
            include: {
              subscription: true,
              _count: { select: { devices: true } },
            },
            orderBy: { joinedAt: "desc" },
            skip,
            take: pageSize,
          }),
          db.user.count({ where }),
        ]);

        return {
          items: users.map(serializeAdminUser),
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        };
      } catch (error) {
        console.error("[AdminUsersList] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
        search: t.Optional(t.String()),
        isBanned: t.Optional(t.String()),
        hasSubscription: t.Optional(t.String()),
        hideAiMenu: t.Optional(t.String()),
        plan: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    "/:id/ban",
    async ({ params, body, set }) => {
      try {
        const updated = await db.user.update({
          where: { id: params.id },
          data: { isBanned: body.isBanned },
          include: {
            subscription: true,
            _count: { select: { devices: true } },
          },
        });

        return serializeAdminUser(updated);
      } catch (error) {
        console.error("[AdminUserBan] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ isBanned: t.Boolean() }),
    },
  )
  .patch(
    "/:id/preferences",
    async ({ params, body, set }) => {
      try {
        const updated = await db.user.update({
          where: { id: params.id },
          data: { hideAiMenu: body.hideAiMenu },
          include: {
            subscription: true,
            _count: { select: { devices: true } },
          },
        });

        return serializeAdminUser(updated);
      } catch (error) {
        console.error("[AdminUserPreferences] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ hideAiMenu: t.Boolean() }),
    },
  )
  .patch(
    "/:id/subscription",
    async ({ params, body, set }) => {
      try {
        if (body.plan === null) {
          await db.subscription.deleteMany({
            where: { userId: params.id },
          });
        } else {
          const plan = await db.subscriptionPlan.findUnique({
            where: { slug: body.plan },
            select: { slug: true, name: true, isActive: true },
          });

          if (!plan || !plan.isActive) {
            set.status = 400;
            return { message: "Plan not found or inactive" };
          }

          const activeUntil = body.activeUntil
            ? new Date(body.activeUntil)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

          if (Number.isNaN(activeUntil.getTime())) {
            set.status = 400;
            return { message: "Invalid activeUntil datetime" };
          }

          await db.subscription.upsert({
            where: { userId: params.id },
            update: {
              planId: plan.slug,
              planName: plan.name,
              activeUntil,
            },
            create: {
              userId: params.id,
              planId: plan.slug,
              planName: plan.name,
              activeUntil,
            },
          });
        }

        const updated = await db.user.findUnique({
          where: { id: params.id },
          include: {
            subscription: true,
            _count: { select: { devices: true } },
          },
        });

        if (!updated) {
          set.status = 404;
          return { message: "User not found" };
        }

        return serializeAdminUser(updated);
      } catch (error) {
        console.error("[AdminUserSubscription] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        plan: t.Union([t.String(), t.Null()]),
        activeUntil: t.Union([t.String(), t.Null()]),
      }),
    },
  )
  .patch(
    "/:id/balance",
    async ({ params, body, set }) => {
      try {
        const updated = await db.user.update({
          where: { id: params.id },
          data: {
            balance: body.balance,
            referralBalance: body.referralBalance,
          },
          include: {
            subscription: true,
            _count: { select: { devices: true } },
          },
        });

        return serializeAdminUser(updated);
      } catch (error) {
        console.error("[AdminUserBalance] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        balance: t.Number(),
        referralBalance: t.Number(),
      }),
    },
  )
  .patch(
    "/:id/vpn-limits",
    async ({ params, body, set }) => {
      try {
        const updated = await db.user.update({
          where: { id: params.id },
          data: {
            vpnMaxDevices: body.vpnMaxDevices ?? null,
            vpnMaxConcurrentConnections:
              body.vpnMaxConcurrentConnections ?? null,
            vpnSpeedLimitUpMbps: body.vpnSpeedLimitUpMbps ?? null,
            vpnSpeedLimitDownMbps: body.vpnSpeedLimitDownMbps ?? null,
          },
          include: { subscription: true },
        });

        return {
          success: true,
          vpnPolicy: await resolveVpnPolicyForUser(updated.id, {
            planId: updated.subscription?.planId ?? null,
            userOverrides: {
              vpnMaxDevices: updated.vpnMaxDevices,
              vpnMaxConcurrentConnections:
                updated.vpnMaxConcurrentConnections,
              vpnSpeedLimitUpMbps: updated.vpnSpeedLimitUpMbps,
              vpnSpeedLimitDownMbps: updated.vpnSpeedLimitDownMbps,
            },
          }),
        };
      } catch (error) {
        console.error("[AdminUserVpnLimits] error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        vpnMaxDevices: t.Optional(t.Union([t.Number(), t.Null()])),
        vpnMaxConcurrentConnections: t.Optional(
          t.Union([t.Number(), t.Null()]),
        ),
        vpnSpeedLimitUpMbps: t.Optional(t.Union([t.Number(), t.Null()])),
        vpnSpeedLimitDownMbps: t.Optional(t.Union([t.Number(), t.Null()])),
      }),
    },
  )
  .get(
    "/:id/stats",
    async ({ params, query, set }) => {
      try {
        const userId = params.id;
        const startDate = query.startDate
          ? new Date(query.startDate)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = query.endDate ? new Date(query.endDate) : new Date();

        const user = await db.user.findUnique({
          where: { id: userId },
          include: {
            subscription: true,
            _count: { select: { referrals: true, devices: true } },
          },
        });

        if (!user) {
          set.status = 404;
          return { message: "User not found" };
        }

        const activeSessionCutoff = new Date(
          Date.now() - ACTIVE_VPN_SESSION_STALE_MS,
        );
        const activeDomainCutoff = new Date(Date.now() - ACTIVE_DOMAIN_WINDOW_MS);

        const [
          referrals,
          transactions,
          vpnProtocolDocs,
          vpnSessionDocs,
          activeSessionDocs,
          activeDomainDocs,
          domainDocs,
        ] =
          await Promise.all([
            db.user.findMany({
              where: {
                referredById: userId,
                joinedAt: { gte: startDate, lte: endDate },
              },
              select: { joinedAt: true },
            }),
            db.transaction.findMany({
              where: {
                userId,
                createdAt: { gte: startDate, lte: endDate },
              },
              orderBy: { createdAt: "desc" },
            }),
            db.vpnUserProtocolStat.findMany({
              where: { userId },
              orderBy: { totalBytesDown: "desc" },
            }),
            db.vpnSession.findMany({
              where: {
                userId,
                connectedAt: {
                  gte: startDate,
                  lte: endDate,
                },
              },
              orderBy: { connectedAt: "desc" },
              take: SESSION_HISTORY_LIMIT,
            }),
            db.vpnSession.findMany({
              where: {
                userId,
                status: "active",
                lastSeenAt: { gte: activeSessionCutoff },
              },
              orderBy: { lastSeenAt: "desc" },
              take: 100,
            }),
            db.vpnDomainStats.findMany({
              where: {
                userId,
                lastVisitAt: { gte: activeDomainCutoff },
              },
              orderBy: { lastVisitAt: "desc" },
              take: ACTIVE_DOMAIN_LIMIT,
            }),
            db.vpnDomainStats.findMany({
              where: { userId },
              orderBy: [{ lastVisitAt: "desc" }, { visitCount: "desc" }],
              take: DOMAIN_HISTORY_LIMIT,
            }),
          ]);

        const dailyStats: Record<
          string,
          { referrals: number; referralEarnings: number; topups: number }
        > = {};

        const cursor = new Date(startDate);
        while (cursor <= endDate) {
          const day = cursor.toISOString().split("T")[0];
          dailyStats[day] = { referrals: 0, referralEarnings: 0, topups: 0 };
          cursor.setDate(cursor.getDate() + 1);
        }

        referrals.forEach((referral) => {
          const day = referral.joinedAt.toISOString().split("T")[0];
          if (dailyStats[day]) {
            dailyStats[day].referrals += 1;
          }
        });

        transactions.forEach((transaction) => {
          const day = transaction.createdAt.toISOString().split("T")[0];
          if (!dailyStats[day]) {
            return;
          }

          if (transaction.type === "referral_earning") {
            dailyStats[day].referralEarnings += transaction.amount;
          }
          if (transaction.type === "topup") {
            dailyStats[day].topups += transaction.amount;
          }
        });

        const vpnPolicy = await resolveVpnPolicyForUser(user.id, {
          planId: user.subscription?.planId ?? null,
          userOverrides: {
            vpnMaxDevices: user.vpnMaxDevices,
            vpnMaxConcurrentConnections: user.vpnMaxConcurrentConnections,
            vpnSpeedLimitUpMbps: user.vpnSpeedLimitUpMbps,
            vpnSpeedLimitDownMbps: user.vpnSpeedLimitDownMbps,
          },
        });

        const activeDeviceCount = new Set(
          activeSessionDocs
            .map((session) => {
              if (session.deviceId) {
                return `device:${session.deviceId}`;
              }
              if (session.remoteAddr) {
                return `remote:${session.remoteAddr}`;
              }
              if (session.deviceName) {
                return `name:${session.deviceName}`;
              }
              return null;
            })
            .filter((value): value is string => Boolean(value)),
        ).size;

        const mappedDomainStats = buildAdminDomainStats(domainDocs);

        const fallbackActiveDomainDocs =
          activeDomainDocs.length > 0
            ? activeDomainDocs
            : domainDocs
                .filter((doc) => {
                  if (!doc.lastVisitAt) {
                    return false;
                  }
                  return (
                    new Date(doc.lastVisitAt).getTime() >=
                    activeDomainCutoff.getTime()
                  );
                })
                .slice(0, ACTIVE_DOMAIN_LIMIT);

        const activeDomains = buildAdminDomainStats(fallbackActiveDomainDocs)
          .sort((a, b) => {
            const left = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
            const right = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
            return right - left;
          });

        return {
          user: {
            id: user.id,
            login: user.login,
            balance: user.balance,
            referralBalance: user.referralBalance,
            isBanned: user.isBanned,
            hideAiMenu: user.hideAiMenu,
            plan: user.subscription?.planId ?? null,
            activeUntil: user.subscription?.activeUntil.toISOString() ?? null,
            joinedAt: user.joinedAt.toISOString(),
            referralCount: user._count.referrals,
            deviceCount: user._count.devices,
            vpnPolicy,
            lastAndroidVersion: (user as any).lastAndroidVersion ?? null,
            lastAndroidSeenAt: (user as any).lastAndroidSeenAt
              ? new Date((user as any).lastAndroidSeenAt).toISOString()
              : null,
          },
          vpn: {
            totals: {
              protocolCount: vpnProtocolDocs.length,
              totalSessionCount: vpnProtocolDocs.reduce(
                (acc, doc) => acc + Number(doc.sessionCount ?? 0),
                0,
              ),
              activeDeviceCount,
              activeConnections: vpnProtocolDocs.reduce(
                (acc, doc) => acc + Number(doc.activeConnections ?? 0),
                0,
              ),
              totalBytesUp: vpnProtocolDocs.reduce(
                (acc, doc) => acc + Number(doc.totalBytesUp ?? 0),
                0,
              ),
              totalBytesDown: vpnProtocolDocs.reduce(
                (acc, doc) => acc + Number(doc.totalBytesDown ?? 0),
                0,
              ),
            },
            protocols: vpnProtocolDocs
              .map((doc) => ({
                id: String(doc.id),
                protocol: String(doc.protocol ?? "unknown"),
                sessionCount: Number(doc.sessionCount ?? 0),
                activeConnections: Number(doc.activeConnections ?? 0),
                totalBytesUp: Number(doc.totalBytesUp ?? 0),
                totalBytesDown: Number(doc.totalBytesDown ?? 0),
                totalBytes:
                  Number(doc.totalBytesUp ?? 0) +
                  Number(doc.totalBytesDown ?? 0),
                lastSeenAt: doc.lastSeenAt
                  ? new Date(doc.lastSeenAt).toISOString()
                  : null,
                lastDeviceId: doc.lastDeviceId ? String(doc.lastDeviceId) : null,
                lastServerId: doc.lastServerId ? String(doc.lastServerId) : null,
              }))
              .sort((a, b) => b.totalBytes - a.totalBytes),
            recentSessions: vpnSessionDocs.map((doc) => ({
              id: String(doc.id),
              protocol: String(doc.protocol ?? "unknown"),
              status: String(doc.status ?? "unknown"),
              connectedAt: doc.connectedAt
                ? new Date(doc.connectedAt).toISOString()
                : null,
              disconnectedAt: doc.disconnectedAt
                ? new Date(doc.disconnectedAt).toISOString()
                : null,
              lastSeenAt: doc.lastSeenAt
                ? new Date(doc.lastSeenAt).toISOString()
                : null,
              bytesUp: Number(doc.bytesUp ?? 0),
              bytesDown: Number(doc.bytesDown ?? 0),
              deviceId: doc.deviceId ? String(doc.deviceId) : null,
              deviceName: doc.deviceName ? String(doc.deviceName) : null,
              deviceOs: doc.deviceOs ? String(doc.deviceOs) : null,
              clientVersion: doc.clientVersion
                ? String(doc.clientVersion)
                : null,
              remoteAddr: doc.remoteAddr ? String(doc.remoteAddr) : null,
              serverId: doc.serverId ? String(doc.serverId) : null,
            })),
          },
          dailyStats: Object.entries(dailyStats)
            .map(([date, stats]) => ({
              date,
              ...stats,
            }))
            .sort((a, b) => a.date.localeCompare(b.date)),
          transactions: transactions.map((transaction) => ({
            id: transaction.id,
            type: transaction.type,
            amount: transaction.amount,
            title: transaction.title,
            createdAt: transaction.createdAt.toISOString(),
          })),
          domainStats: mappedDomainStats,
          activeDomains,
        };
      } catch (error) {
        console.error("[AdminUserStats] Error:", error);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
    },
  );
