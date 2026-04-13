/**
 * @fileoverview Main Elysia application entry point.
 * Registers all route modules, CORS, Swagger, static file serving,
 * and starts the background VPN-server heartbeat monitor.
 */

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { config } from "./config";
import { db } from "./db";

// Route imports
import { authRoutes } from "./auth/routes";
import { userRoutes } from "./user/routes";
import { paymentRoutes } from "./payments/routes";
import { yokassaPaymentRoutes, yokassaWebhookRoute } from "./payments/yokassa-routes";
import { processAutoRenewals } from "./payments/yokassa";
import { subscriptionRoutes } from "./subscriptions/routes";
import { deviceRoutes } from "./devices/routes";
import { promoRoutes } from "./promo/routes";
import { referralRoutes } from "./referral/routes";
import { downloadRoutes } from "./downloads/routes";
import { adminUserRoutes } from "./admin/users/routes";
import { adminPromoRoutes } from "./admin/promo/routes";
import { adminWithdrawalRoutes } from "./admin/withdrawals/routes";
import { adminFinanceRoutes } from "./admin/finance/routes";
import { adminServerRoutes } from "./admin/server/routes";
import { adminAppRoutes } from "./admin/apps/routes";
import { adminTariffRoutes, adminYokassaRoutes } from "./admin/tariffs/routes";
import {
  adminMailingRoutes,
  processPendingMailings,
} from "./admin/mailings/routes";
import {
  adminBlockedDomainRoutes,
  blockedDomainsPublicRoutes,
} from "./admin/blocked-domains/routes";
import { vpnServerRoutes } from "./servers/routes";
import { aiRoutes } from "./ai/routes";
import { appVersionRoutes } from "./app/routes";
import { notificationRoutes, adminNotificationRoutes } from "./notifications/routes";
import { mobileVpnRoutes } from "./mobile/routes";
import { adminClientRulesRoutes } from "./admin/client-rules/routes";
import { adminClientNotificationRoutes, clientNotificationRoutes } from "./admin/client-notifications/routes";
import { clientLogRoutes, adminClientLogRoutes, clientDomainStatRoutes } from "./client-logs/routes";
import { jopaRoutes } from "./jopa/routes";

// ─── Background VPN-server heartbeat monitor ─────────────────────────────────

/**
 * Starts a background interval that marks VPN servers as "offline"
 * if they have not sent a heartbeat within the last 2 minutes.
 *
 * Both the main backend AND every Go VPN node run this loop so each
 * layer can independently detect stale peers.
 *
 * @returns {void}
 */
function startServerMonitor(): void {
  const INTERVAL_MS = 60 * 1000; // run every 1 minute
  const TIMEOUT_MS = 5 * 60 * 1000; // server is "dead" if silent for >5 min

  setInterval(async () => {
    try {
      const threshold = new Date(Date.now() - TIMEOUT_MS);
      const { count } = await db.vpnServer.updateMany({
        where: { status: "online", lastSeenAt: { lt: threshold } },
        data: { status: "offline" },
      });
      if (count > 0) {
        console.log(
          `[Monitor] Marked ${count} VPN server(s) offline (no heartbeat).`,
        );
      }
    } catch (err) {
      console.error("[Monitor] heartbeat-monitor error:", err);
    }
  }, INTERVAL_MS);

  console.log(
    "[Monitor] VPN server heartbeat monitor started (2-min interval).",
  );
}

function startMailingWorker(): void {
  const INTERVAL_MS = 15 * 1000;

  const tick = async () => {
    try {
      await processPendingMailings();
    } catch (error) {
      console.error("[MailingWorker] Error:", error);
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, INTERVAL_MS);

  console.log("[MailingWorker] Started.");
}

function startSubscriptionRenewalWorker(): void {
  const INTERVAL_MS = 60 * 1000;

  const tick = async () => {
    try {
      await processAutoRenewals();
    } catch (error) {
      console.error("[RenewalWorker] Error:", error);
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, INTERVAL_MS);

  console.log("[RenewalWorker] Started.");
}

function startVpnSessionCleanupWorker(): void {
  const INTERVAL_MS = 60 * 1000;
  const STALE_MS = 5 * 60 * 1000;

  const tick = async () => {
    try {
      const cutoff = new Date(Date.now() - STALE_MS);
      const staleSessions = await db.vpnSession.findMany({
        where: {
          status: "active",
          lastSeenAt: { lt: cutoff },
        },
        take: 200,
      });

      for (const session of staleSessions) {
        await db.vpnSession.update({
          where: { id: session.id },
          data: {
            status: "disconnected",
            disconnectedAt: new Date(),
            lastSeenAt: new Date(),
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
              activeConnections: Math.max(
                0,
                Number(stats.activeConnections ?? 0) - 1,
              ),
              lastSeenAt: new Date(),
            },
          });
        }
      }

      if (staleSessions.length > 0) {
        console.log(
          `[VpnCleanup] Marked ${staleSessions.length} stale VPN session(s) disconnected.`,
        );
      }
    } catch (error) {
      console.error("[VpnCleanup] Error:", error);
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, INTERVAL_MS);

  console.log("[VpnCleanup] Started.");
}

/**
 * Main Elysia application instance.
 * Configured with CORS, Swagger docs, error handling, and all route modules.
 */
const app = new Elysia()
  // ─── Global plugins ──────────────────────────────────────
  .use(
    cors({
      origin: true, // Allow all origins in dev
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Server-Secret"],
      credentials: true,
    }),
  )
  .use(
    swagger({
      documentation: {
        info: {
          title: "lowkey VPN API",
          version: "1.0.0",
          description: "Backend API for lowkey VPN service",
        },
        tags: [
          { name: "Auth", description: "Authentication endpoints" },
          { name: "User", description: "User profile and data" },
          { name: "Payments", description: "SBP payment endpoints" },
          {
            name: "Subscriptions",
            description: "Subscription plans and purchases",
          },
          { name: "Devices", description: "Device management" },
          { name: "Promo", description: "Promo code activation" },
          { name: "Referral", description: "Referral program" },
          { name: "Downloads", description: "App downloads" },
          { name: "Admin", description: "Admin panel endpoints" },
        ],
      },
    }),
  )

  // ─── Global error handler ────────────────────────────────
  .onError(({ code, error, set }) => {
    console.error("[API Error]", code, error);
    if (code === "VALIDATION") {
      set.status = 400;
      return { message: error.message };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { message: "Not found" };
    }
    // For thrown errors with a message
    if (error instanceof Error) {
      return { message: error.message };
    }
    set.status = 500;
    return { message: "Internal server error" };
  })

  // ─── Health check ─────────────────────────────────────────
  .get("/", () => ({
    name: "lowkey-vpn-api",
    version: "1.0.0",
  }))

  // ─── Static file serving for uploads ──────────────────────
  .get("/uploads/*", async ({ params, set }) => {
    try {
      const filePath = `${config.APP_FILES_DIR}/${(params as any)["*"]}`;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return file;
      }
      set.status = 404;
      return { message: "File not found" };
    } catch {
      set.status = 404;
      return { message: "File not found" };
    }
  })

  // ─── Route modules ───────────────────────────────────────
  .use(authRoutes)
  .use(userRoutes)
  .use(paymentRoutes)
  .use(yokassaPaymentRoutes)
  .use(yokassaWebhookRoute)
  .use(subscriptionRoutes)
  .use(deviceRoutes)
  .use(promoRoutes)
  .use(referralRoutes)
  .use(downloadRoutes)
  .use(adminUserRoutes)
  .use(adminPromoRoutes)
  .use(adminWithdrawalRoutes)
  .use(adminFinanceRoutes)
  .use(adminServerRoutes)
  .use(adminAppRoutes)
  .use(adminTariffRoutes)
  .use(adminYokassaRoutes)
  .use(adminMailingRoutes)
  .use(adminBlockedDomainRoutes)
  .use(blockedDomainsPublicRoutes)
  .use(vpnServerRoutes)
  .use(aiRoutes)
  .use(appVersionRoutes)
  .use(notificationRoutes)
  .use(adminNotificationRoutes)
  .use(mobileVpnRoutes)
  .use(adminClientRulesRoutes)
  .use(adminClientNotificationRoutes)
  .use(clientNotificationRoutes)
  .use(clientLogRoutes)
  .use(clientDomainStatRoutes)
  .use(adminClientLogRoutes)
  .use(jopaRoutes)

  // ─── Start server ─────────────────────────────────────────
  .listen({
    port: config.PORT,
    hostname: "0.0.0.0",
  });

console.log(`🚀 lowkey VPN API running at http://localhost:${config.PORT}`);
console.log(`📚 Swagger docs at http://localhost:${config.PORT}/swagger`);

// Start background VPN-server offline detector
startServerMonitor();
startMailingWorker();
startSubscriptionRenewalWorker();
startVpnSessionCleanupWorker();

export type App = typeof app;
