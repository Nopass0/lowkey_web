/**
 * @fileoverview Payment routes: create SBP QR payment and check status.
 * All routes require authentication.
 */

import Elysia, { t } from "elysia";
import { db } from "../db";
import { authMiddleware } from "../auth/middleware";
import { getSbpClient, onPaymentSuccess } from "./sbp";
import { config } from "../config";

/**
 * Payment routes group.
 * Handles SBP QR code creation and payment status polling.
 */
export const paymentRoutes = new Elysia({ prefix: "/payments" })
  .use(authMiddleware)

  // ─── POST /payments/create ─────────────────────────────
  .post(
    "/create",
    async ({ user, body, set }) => {
      try {
        const { amount } = body;

        if (amount < 10) {
          set.status = 400;
          return { message: "Minimum amount is 10 RUB" };
        }

        const sbp = getSbpClient();

        const qr = await sbp.createSBP({
          merchantId: config.TOCHKA_MERCHANT_ID,
          accountId: config.TOCHKA_ACCOUNT_ID,
          amount: amount * 100, // API expects kopecks
          description: "Пополнение баланса lowkey VPN",
        });

        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        const payment = await db.payment.create({
          data: {
            userId: user.userId,
            sbpPaymentId: qr.qrcId,
            amount,
            status: "pending",
            qrUrl: qr.payload,
            sbpUrl: qr.payload,
            expiresAt,
          },
        });

        return {
          paymentId: payment.id,
          qrUrl: payment.qrUrl,
          sbpUrl: payment.sbpUrl,
          expiresAt: payment.expiresAt.toISOString(),
        };
      } catch (err) {
        console.error("[Payments] Create error:", err);
        set.status = 500;
        return { message: "Failed to create payment" };
      }
    },
    {
      body: t.Object({
        amount: t.Number(),
      }),
    },
  )

  // ─── GET /payments/:id/status ──────────────────────────
  .get(
    "/:id/status",
    async ({ user, params, set }) => {
      try {
        const payment = await db.payment.findUnique({
          where: { id: params.id },
        });

        if (!payment) {
          set.status = 404;
          return { message: "Payment not found" };
        }

        if (payment.userId !== user.userId) {
          set.status = 403;
          return { message: "Forbidden" };
        }

        // If already finalized, return cached status
        if (payment.status !== "pending") {
          return {
            paymentId: payment.id,
            status: payment.status,
            amount: payment.amount,
          };
        }

        // Check expiry
        if (new Date() > payment.expiresAt) {
          await db.payment.update({
            where: { id: payment.id },
            data: { status: "expired" },
          });
          return {
            paymentId: payment.id,
            status: "expired" as const,
            amount: payment.amount,
          };
        }

        // Poll tochka-sbp for status
        try {
          const sbp = getSbpClient();
          const [statusData] = await sbp.getPaymentStatus(payment.sbpPaymentId);

          if (statusData) {
            // The API response might have `.status` or `.operationStatus` depending on endpoints
            const sbpStatus =
              (statusData as any).status || (statusData as any).operationStatus;

            if (
              sbpStatus === "ACWP" ||
              sbpStatus === "ACSC" ||
              sbpStatus === "Accepted"
            ) {
              await db.payment.update({
                where: { id: payment.id },
                data: { status: "success" },
              });
              await onPaymentSuccess(payment.userId, payment.amount);

              return {
                paymentId: payment.id,
                status: "success" as const,
                amount: payment.amount,
              };
            } else if (
              sbpStatus === "RJCT" ||
              sbpStatus === "CANC" ||
              sbpStatus === "Rejected"
            ) {
              await db.payment.update({
                where: { id: payment.id },
                data: { status: "failed" },
              });
              return {
                paymentId: payment.id,
                status: "failed" as const,
                amount: payment.amount,
              };
            }
          }
        } catch (err) {
          // If SBP check fails, just return pending
          console.error("[Payments] SBP status check error:", err);
        }

        return {
          paymentId: payment.id,
          status: "pending" as const,
          amount: payment.amount,
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  );
