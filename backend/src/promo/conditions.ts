/**
 * @fileoverview Promo code condition checkers.
 * Each condition type has a dedicated handler that validates
 * whether the user meets the requirement for a promo code.
 */

import type { PrismaLikeClient } from "../db";

/** Shape of a promo condition from the JSON field */
export interface PromoCondition {
  key: string;
  value?: string;
  value2?: string;
}

/**
 * Checks all conditions on a promo code for a given user.
 * Returns { ok: true } if all conditions pass, or { ok: false, reason } on failure.
 *
 * @param userId - ID of the user trying to activate the promo
 * @param conditions - Array of condition objects from the promo code
 * @param db - Prisma client or transaction instance
 * @returns Whether conditions are met, with reason if not
 */
export async function checkConditions(
  userId: string,
  conditions: PromoCondition[],
  promoCodeId: string,
  db: Pick<
    PrismaLikeClient,
    "promoActivation" | "subscription" | "transaction"
  >,
): Promise<{ ok: boolean; reason?: string }> {
  for (const cond of conditions) {
    switch (cond.key) {
      case "new_users_only": {
        const hasActivated = await db.promoActivation.findFirst({
          where: { userId },
        });
        if (hasActivated) {
          return { ok: false, reason: "Только для новых пользователей" };
        }
        break;
      }

      case "date_range": {
        const now = new Date();
        if (cond.value && now < new Date(cond.value)) {
          return { ok: false, reason: "Промокод ещё не активен" };
        }
        if (cond.value2 && now > new Date(cond.value2)) {
          return { ok: false, reason: "Промокод недействителен в этот период" };
        }
        break;
      }

      case "max_activations": {
        if (cond.value) {
          const count = await db.promoActivation.count({
            where: { promoCodeId },
          });
          if (count >= parseInt(cond.value)) {
            return { ok: false, reason: "Лимит активаций исчерпан" };
          }
        }
        break;
      }

      case "no_active_sub": {
        const subscription = await db.subscription.findUnique({
          where: { userId },
        });
        if (subscription && new Date(subscription.activeUntil) > new Date()) {
          return { ok: false, reason: "У вас уже есть активная подписка" };
        }
        break;
      }

      case "min_topup": {
        if (cond.value) {
          const totalTopups = await db.transaction.aggregate({
            where: { userId, type: "topup" },
            _sum: { amount: true },
          });
          if ((totalTopups._sum.amount ?? 0) < parseFloat(cond.value)) {
            return {
              ok: false,
              reason: `Минимальная сумма пополнений: ${cond.value} ₽`,
            };
          }
        }
        break;
      }

      case "specific_plan": {
        if (cond.value) {
          const subscription = await db.subscription.findUnique({
            where: { userId },
          });
          if (!subscription || subscription.planId !== cond.value) {
            return { ok: false, reason: `Требуется подписка "${cond.value}"` };
          }
        }
        break;
      }
    }
  }

  return { ok: true };
}
