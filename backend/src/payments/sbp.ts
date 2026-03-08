/**
 * @fileoverview SBP payment wrapper using tochka-sbp.
 * Provides QR code creation and payment status checking.
 * Includes onPaymentSuccess with referral commission logic.
 */

import { TochkaSBP } from "tochka-sbp";
import { config } from "../config";
import { db } from "../db";

/** TochkaSBP client singleton */
let sbpClient: TochkaSBP | null = null;

/**
 * Returns the TochkaSBP client singleton.
 * Lazily initialized to avoid errors if API key is not configured.
 *
 * @returns TochkaSBP instance
 */
export function getSbpClient(): TochkaSBP {
  if (!sbpClient) {
    sbpClient = new TochkaSBP({
      jwt: config.TOCHKA_API_KEY, // The SDK expects 'jwt' for the API token
    });
  }
  return sbpClient;
}

/**
 * Handles successful payment: credits user balance and awards referral commission.
 * All operations are wrapped in a Prisma transaction for atomicity.
 *
 * @param userId - ID of the user who paid
 * @param amount - Payment amount in RUB
 */
export async function onPaymentSuccess(
  userId: string,
  amount: number,
): Promise<void> {
  await db.$transaction(async (tx) => {
    // 1. Add to user balance
    await tx.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
    });

    // 2. Create topup transaction
    await tx.transaction.create({
      data: {
        userId,
        type: "topup",
        amount,
        title: "Пополнение через СБП",
      },
    });

    // 3. Award 20% referral commission
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { referredById: true },
    });

    if (user?.referredById) {
      const referrer = await tx.user.findUnique({
        where: { id: user.referredById },
        select: { referralRate: true },
      });
      const rate = referrer?.referralRate ?? 0.2;
      const commission = amount * rate;
      await tx.user.update({
        where: { id: user.referredById },
        data: { referralBalance: { increment: commission } },
      });
      await tx.transaction.create({
        data: {
          userId: user.referredById,
          type: "referral_earning",
          amount: commission,
          title: "Реферальное начисление",
        },
      });
    }
  });
}
