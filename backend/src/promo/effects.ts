/**
 * @fileoverview Promo code effect appliers.
 * Each effect type modifies user state (balance, subscription, etc.)
 * and returns a human-readable description of what was applied.
 *
 * Discount effects (plan_discount_pct, plan_discount_fixed) are persisted
 * to the `pendingDiscountPct` / `pendingDiscountFixed` columns on the User
 * model. The subscription purchase route reads and clears them atomically.
 */

/** Shape of a promo effect from the JSON field */
export interface PromoEffect {
  key: string;
  value?: string;
}

/**
 * Applies all effects of a promo code to a user within a Prisma transaction.
 * Returns a human-readable description of all applied effects.
 *
 * @param userId - ID of the user activating the promo
 * @param effects - Array of effect objects from the promo code
 * @param tx - Prisma transaction instance
 * @returns Comma-separated description of applied effects
 */
export async function applyEffects(
  userId: string,
  effects: PromoEffect[],
  tx: any,
): Promise<string> {
  const descriptions: string[] = [];

  for (const effect of effects) {
    switch (effect.key) {
      case "add_balance": {
        const amount = parseFloat(effect.value ?? "0");
        if (amount > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { balance: { increment: amount } },
          });
          await tx.transaction.create({
            data: {
              userId,
              type: "promo_topup",
              amount,
              title: "Бонус по промокоду",
            },
          });
          descriptions.push(`+${amount} ₽ на баланс`);
        }
        break;
      }

      case "add_ref_balance": {
        const amount = parseFloat(effect.value ?? "0");
        if (amount > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { referralBalance: { increment: amount } },
          });
          descriptions.push(`+${amount} ₽ на реферальный баланс`);
        }
        break;
      }

      case "free_days": {
        const days = parseInt(effect.value ?? "0");
        if (days > 0) {
          const existing = await tx.subscription.findUnique({
            where: { userId },
          });
          if (existing) {
            // Extend existing subscription
            const newUntil = new Date(existing.activeUntil);
            newUntil.setDate(newUntil.getDate() + days);
            await tx.subscription.update({
              where: { userId },
              data: { activeUntil: newUntil },
            });
          } else {
            // Create a trial subscription
            const activeUntil = new Date();
            activeUntil.setDate(activeUntil.getDate() + days);
            await tx.subscription.create({
              data: {
                userId,
                planId: "starter",
                planName: "Начальный (пробный)",
                activeUntil,
              },
            });
          }
          descriptions.push(`+${days} дней подписки`);
        }
        break;
      }

      case "upgrade_plan": {
        const planId = effect.value ?? "pro";
        const planNames: Record<string, string> = {
          starter: "Начальный",
          pro: "Продвинутый",
          advanced: "Максимальный",
        };
        const planName = planNames[planId] ?? planId;

        const existing = await tx.subscription.findUnique({
          where: { userId },
        });
        if (existing) {
          await tx.subscription.update({
            where: { userId },
            data: { planId, planName },
          });
        } else {
          const activeUntil = new Date();
          activeUntil.setDate(activeUntil.getDate() + 30);
          await tx.subscription.create({
            data: { userId, planId, planName, activeUntil },
          });
        }
        descriptions.push(`Апгрейд до "${planName}"`);
        break;
      }

      case "plan_discount_pct": {
        const pct = parseInt(effect.value ?? "0");
        if (pct > 0) {
          // Persist the percentage discount so the purchase route can apply it.
          // If the user already has a pending % discount we take the larger value.
          const current = await tx.user.findUnique({
            where: { id: userId },
            select: { pendingDiscountPct: true },
          });
          const existing = current?.pendingDiscountPct ?? 0;
          await tx.user.update({
            where: { id: userId },
            data: { pendingDiscountPct: Math.max(existing, pct) },
          });
          descriptions.push(`Скидка ${pct}% на подписку`);
        }
        break;
      }

      case "plan_discount_fixed": {
        const amount = parseFloat(effect.value ?? "0");
        if (amount > 0) {
          // Persist the fixed discount; stack with any existing one.
          const current = await tx.user.findUnique({
            where: { id: userId },
            select: { pendingDiscountFixed: true },
          });
          const existing = current?.pendingDiscountFixed ?? 0;
          await tx.user.update({
            where: { id: userId },
            data: { pendingDiscountFixed: existing + amount },
          });
          descriptions.push(`Скидка ${amount} ₽ на подписку`);
        }
        break;
      }

      case "double_next_topup": {
        descriptions.push("Удвоение следующего пополнения");
        break;
      }

      case "extra_devices": {
        const count = parseInt(effect.value ?? "1");
        descriptions.push(`+${count} дополнительных устройств`);
        break;
      }

      case "generate_gift_code": {
        descriptions.push("Подарочный код сгенерирован");
        break;
      }
    }
  }

  return descriptions.join(", ");
}
