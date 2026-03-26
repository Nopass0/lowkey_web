/**
 * @fileoverview Admin finance analytics routes.
 * Supports flexible date ranges, financial settings, and business withdrawals.
 */

import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";

type GroupBy = "day" | "month";

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "3m":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "year":
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case "all":
      return new Date(0);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

function parseDateStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseDateEnd(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

function detectGroupBy(startDate: Date, endDate: Date): GroupBy {
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return diffDays > 120 ? "month" : "day";
}

function formatDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function bucketKey(date: Date, groupBy: GroupBy): string {
  return groupBy === "month" ? formatMonthKey(date) : formatDayKey(date);
}

function buildBuckets(
  startDate: Date,
  endDate: Date,
  groupBy: GroupBy,
): string[] {
  const cursor = new Date(startDate);
  const buckets: string[] = [];

  if (groupBy === "month") {
    cursor.setUTCDate(1);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor <= endDate) {
      buckets.push(formatMonthKey(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return buckets;
  }

  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= endDate) {
    buckets.push(formatDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}

async function getFinanceSettings() {
  return db.financeSettings.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

const YOOKASSA_COMMISSION_VAT_MULTIPLIER = 1.22;
const DEFAULT_YOOKASSA_CARD_FEE_RATE = 3.8;
const DEFAULT_YOOKASSA_SBP_FEE_RATE = 0.7;

type FinanceSettingsShape = Awaited<ReturnType<typeof getFinanceSettings>>;
type AnalyticsPayment = {
  amount: number;
  provider: string;
  paymentType: string | null;
  metadata: unknown;
  createdAt: Date;
  creditedAt?: Date | null;
};

function getPaymentPurpose(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "topup";
  }

  const purpose = (metadata as Record<string, unknown>).purpose;
  return typeof purpose === "string" && purpose.trim() ? purpose : "topup";
}

function isBalanceTopupPurpose(purpose: string): boolean {
  return purpose === "topup" || purpose === "subscription_topup";
}

function isDirectSubscriptionPurpose(purpose: string): boolean {
  return purpose === "promo_subscribe" || purpose === "autorenew";
}

function getEffectiveYookassaCardRate(settings: FinanceSettingsShape): number {
  return settings.acquiringFeeRate > 0
    ? settings.acquiringFeeRate
    : DEFAULT_YOOKASSA_CARD_FEE_RATE;
}

function getEffectiveFeeRate(
  payment: Pick<AnalyticsPayment, "provider" | "paymentType">,
  settings: FinanceSettingsShape,
): number {
  if (payment.provider === "yokassa") {
    if (payment.paymentType === "sbp") {
      return DEFAULT_YOOKASSA_SBP_FEE_RATE * YOOKASSA_COMMISSION_VAT_MULTIPLIER;
    }

    return (
      getEffectiveYookassaCardRate(settings) *
      YOOKASSA_COMMISSION_VAT_MULTIPLIER
    );
  }

  if (payment.paymentType === "sbp") {
    return DEFAULT_YOOKASSA_SBP_FEE_RATE;
  }

  return settings.acquiringFeeRate;
}

function getPaymentAcquiringFee(
  payment: Pick<AnalyticsPayment, "amount" | "provider" | "paymentType">,
  settings: FinanceSettingsShape,
): number {
  return roundMoney(payment.amount * (getEffectiveFeeRate(payment, settings) / 100));
}

export const adminFinanceRoutes = new Elysia({ prefix: "/admin/finance" })
  .use(adminMiddleware)

  .get(
    "/stats",
    async ({ query, set }) => {
      try {
        const endDate = query.endDate
          ? parseDateEnd(query.endDate)
          : new Date();
        const startDate = query.startDate
          ? parseDateStart(query.startDate)
          : getPeriodStart(query.period ?? "30d");

        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
          set.status = 400;
          return { message: "Invalid date range" };
        }

        if (startDate > endDate) {
          set.status = 400;
          return { message: "Start date must be before end date" };
        }

        const settings = await getFinanceSettings();
        const groupBy = detectGroupBy(startDate, endDate);

        const [transactions, payments, newUsers, withdrawals, usersBeforeRange] =
          await Promise.all([
            db.transaction.findMany({
              where: {
                createdAt: { gte: startDate, lte: endDate },
                isTest: false,
              },
              orderBy: { createdAt: "asc" },
            }),
            db.payment.findMany({
              where: {
                status: "success",
                isTest: false,
                OR: [
                  { creditedAt: { gte: startDate, lte: endDate } },
                  {
                    creditedAt: null,
                    createdAt: { gte: startDate, lte: endDate },
                  },
                ],
              },
              select: {
                amount: true,
                provider: true,
                paymentType: true,
                metadata: true,
                createdAt: true,
                creditedAt: true,
              },
              orderBy: { createdAt: "asc" },
            }),
            db.user.findMany({
              where: { joinedAt: { gte: startDate, lte: endDate } },
              select: { joinedAt: true },
              orderBy: { joinedAt: "asc" },
            }),
            db.financeWithdrawal.findMany({
              where: { withdrawalDate: { gte: startDate, lte: endDate } },
              orderBy: { withdrawalDate: "asc" },
            }),
            db.user.count({
              where: { joinedAt: { lt: startDate } },
            }),
          ]);

        const buckets = buildBuckets(startDate, endDate, groupBy);
        const pointMap = new Map(
          buckets.map((date) => [
            date,
            {
              date,
              topups: 0,
              subscriptions: 0,
              refPaid: 0,
              financeWithdrawals: 0,
              acquiringFee: 0,
              taxAmount: 0,
              netProfit: 0,
              newUsers: 0,
              totalUsers: 0,
            },
          ]),
        );

        for (const tx of transactions) {
          const key = bucketKey(tx.createdAt, groupBy);
          const point = pointMap.get(key);
          if (!point) continue;

          if (tx.type === "topup") point.topups += tx.amount;
          else if (tx.type === "subscription") {
            point.subscriptions += Math.abs(tx.amount);
          } else if (tx.type === "referral_earning") {
            point.refPaid += tx.amount;
          }
        }

        for (const withdrawal of withdrawals) {
          const key = bucketKey(withdrawal.withdrawalDate, groupBy);
          const point = pointMap.get(key);
          if (!point) continue;
          point.financeWithdrawals += withdrawal.amount;
        }

        for (const user of newUsers) {
          const key = bucketKey(user.joinedAt, groupBy);
          const point = pointMap.get(key);
          if (!point) continue;
          point.newUsers += 1;
        }

        let directSubscriptionRevenue = 0;
        for (const payment of payments) {
          const purpose = getPaymentPurpose(payment.metadata);
          if (purpose === "link_card") {
            continue;
          }

          const key = bucketKey(payment.creditedAt ?? payment.createdAt, groupBy);
          const point = pointMap.get(key);
          if (!point) continue;

          point.acquiringFee += getPaymentAcquiringFee(payment, settings);

          if (isDirectSubscriptionPurpose(purpose)) {
            directSubscriptionRevenue += payment.amount;
          }
        }

        let runningUsers = usersBeforeRange;
        const points = Array.from(pointMap.values()).map((point) => {
          point.acquiringFee = roundMoney(point.acquiringFee);

          const profitBeforeTax =
            point.topups -
            point.refPaid -
            point.financeWithdrawals -
            point.acquiringFee;

          point.taxAmount = roundMoney(
            Math.max(profitBeforeTax, 0) * (settings.taxRate / 100),
          );
          point.netProfit = roundMoney(profitBeforeTax - point.taxAmount);
          runningUsers += point.newUsers;
          point.totalUsers = runningUsers;

          point.topups = roundMoney(point.topups);
          point.subscriptions = roundMoney(point.subscriptions);
          point.refPaid = roundMoney(point.refPaid);
          point.financeWithdrawals = roundMoney(point.financeWithdrawals);

          return point;
        });

        const totals = points.reduce(
          (acc, point) => {
            acc.topups += point.topups;
            acc.subscriptions += point.subscriptions;
            acc.refPaid += point.refPaid;
            acc.financeWithdrawals += point.financeWithdrawals;
            acc.acquiringFee += point.acquiringFee;
            acc.taxAmount += point.taxAmount;
            acc.netProfit += point.netProfit;
            acc.users += point.newUsers;
            acc.totalUsers = point.totalUsers;
            return acc;
          },
          {
            topups: 0,
            subscriptions: 0,
            refPaid: 0,
            financeWithdrawals: 0,
            acquiringFee: 0,
            taxAmount: 0,
            netProfit: 0,
            users: 0,
            totalUsers: usersBeforeRange,
            revenue: 0,
          },
        );

        totals.topups = roundMoney(totals.topups);
        totals.subscriptions = roundMoney(totals.subscriptions);
        totals.refPaid = roundMoney(totals.refPaid);
        totals.financeWithdrawals = roundMoney(totals.financeWithdrawals);
        totals.acquiringFee = roundMoney(totals.acquiringFee);
        totals.taxAmount = roundMoney(totals.taxAmount);
        totals.netProfit = roundMoney(totals.netProfit);
        totals.revenue = roundMoney(totals.topups + directSubscriptionRevenue);

        return {
          range: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            groupBy,
          },
          settings: {
            taxRate: settings.taxRate,
            acquiringFeeRate: settings.acquiringFeeRate,
          },
          points,
          totals,
        };
      } catch (err) {
        console.error("[Admin Finance Stats] Error:", err);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      query: t.Object({
        period: t.Optional(t.String()),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
    },
  )

  .get("/balance", async ({ set }) => {
    try {
      const [
        userBalances,
        pendingWithdrawals,
        userRefBalances,
        successfulPayments,
        totalReferralEarnings,
        totalBusinessWithdrawals,
        settings,
      ] = await Promise.all([
        db.user.aggregate({ _sum: { balance: true } }),
        db.withdrawal.aggregate({
          where: { status: "pending" },
          _sum: { amount: true },
        }),
        db.user.aggregate({ _sum: { referralBalance: true } }),
        db.payment.findMany({
          where: {
            status: "success",
            isTest: false,
          },
          select: {
            amount: true,
            provider: true,
            paymentType: true,
            metadata: true,
            createdAt: true,
          },
        }),
        db.transaction.aggregate({
          where: { type: "referral_earning", isTest: false },
          _sum: { amount: true },
        }),
        db.financeWithdrawal.aggregate({
          _sum: { amount: true },
        }),
        getFinanceSettings(),
      ]);

      const currentBalance = roundMoney(userBalances._sum.balance ?? 0);
      const pending = roundMoney(pendingWithdrawals._sum.amount ?? 0);
      const refHoldReserve = roundMoney(userRefBalances._sum.referralBalance ?? 0);
      const revenuePayments = successfulPayments.filter(
        (payment) => getPaymentPurpose(payment.metadata) !== "link_card",
      );
      const topups = roundMoney(
        revenuePayments
          .filter((payment) => isBalanceTopupPurpose(getPaymentPurpose(payment.metadata)))
          .reduce((sum, payment) => sum + payment.amount, 0),
      );
      const directSubscriptions = roundMoney(
        revenuePayments
          .filter((payment) =>
            isDirectSubscriptionPurpose(getPaymentPurpose(payment.metadata)),
          )
          .reduce((sum, payment) => sum + payment.amount, 0),
      );
      const referralPaid = roundMoney(totalReferralEarnings._sum.amount ?? 0);
      const businessWithdrawals = roundMoney(
        totalBusinessWithdrawals._sum.amount ?? 0,
      );
      const acquiringFees = roundMoney(
        revenuePayments.reduce(
          (sum, payment) => sum + getPaymentAcquiringFee(payment, settings),
          0,
        ),
      );
      const profitBeforeTax = roundMoney(
        topups +
          directSubscriptions -
          referralPaid -
          businessWithdrawals -
          acquiringFees,
      );
      const taxAmount = roundMoney(
        Math.max(profitBeforeTax, 0) * (settings.taxRate / 100),
      );
      const availableProfit = roundMoney(profitBeforeTax - taxAmount);

      return {
        currentBalance,
        pendingWithdrawals: pending,
        refHoldReserve,
        totalBusinessWithdrawals: businessWithdrawals,
        acquiringFees,
        taxAmount,
        profitBeforeTax,
        availableProfit,
        taxRate: settings.taxRate,
        acquiringFeeRate: settings.acquiringFeeRate,
      };
    } catch (err) {
      console.error("[Admin Finance Balance] Error:", err);
      set.status = 500;
      return { message: "Internal server error" };
    }
  })

  .get("/settings", async ({ set }) => {
    try {
      const settings = await getFinanceSettings();
      return {
        taxRate: settings.taxRate,
        acquiringFeeRate: settings.acquiringFeeRate,
        updatedAt: settings.updatedAt.toISOString(),
      };
    } catch (err) {
      console.error("[Admin Finance Settings] Error:", err);
      set.status = 500;
      return { message: "Internal server error" };
    }
  })

  .patch(
    "/settings",
    async ({ body, set }) => {
      try {
        const taxRate = body.taxRate ?? 0;
        const acquiringFeeRate = body.acquiringFeeRate ?? 0;

        if (
          taxRate < 0 ||
          taxRate > 100 ||
          acquiringFeeRate < 0 ||
          acquiringFeeRate > 100
        ) {
          set.status = 400;
          return { message: "Rates must be between 0 and 100" };
        }

        const settings = await db.financeSettings.upsert({
          where: { id: "global" },
          update: { taxRate, acquiringFeeRate },
          create: {
            id: "global",
            taxRate,
            acquiringFeeRate,
          },
        });

        return {
          taxRate: settings.taxRate,
          acquiringFeeRate: settings.acquiringFeeRate,
          updatedAt: settings.updatedAt.toISOString(),
        };
      } catch (err) {
        console.error("[Admin Finance Settings Update] Error:", err);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        taxRate: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
        acquiringFeeRate: t.Optional(
          t.Number({ minimum: 0, maximum: 100 }),
        ),
      }),
    },
  )

  .get("/withdrawals", async ({ set }) => {
    try {
      const withdrawals = await db.financeWithdrawal.findMany({
        include: {
          createdBy: {
            select: { id: true, login: true },
          },
        },
        orderBy: [{ withdrawalDate: "desc" }, { createdAt: "desc" }],
      });

      return withdrawals.map((withdrawal) => ({
        id: withdrawal.id,
        title: withdrawal.title,
        note: withdrawal.note,
        amount: withdrawal.amount,
        withdrawalDate: withdrawal.withdrawalDate.toISOString(),
        createdAt: withdrawal.createdAt.toISOString(),
        createdBy: withdrawal.createdBy,
      }));
    } catch (err) {
      console.error("[Admin Finance Withdrawals] Error:", err);
      set.status = 500;
      return { message: "Internal server error" };
    }
  })

  .post(
    "/withdrawals",
    async ({ body, adminUser, set }) => {
      try {
        if (body.amount <= 0) {
          set.status = 400;
          return { message: "Amount must be greater than 0" };
        }

        const withdrawal = await db.financeWithdrawal.create({
          data: {
            title: body.title.trim(),
            note: body.note?.trim() || null,
            amount: roundMoney(body.amount),
            withdrawalDate: parseDateStart(body.withdrawalDate),
            createdById: adminUser.userId,
          },
          include: {
            createdBy: {
              select: { id: true, login: true },
            },
          },
        });

        return {
          id: withdrawal.id,
          title: withdrawal.title,
          note: withdrawal.note,
          amount: withdrawal.amount,
          withdrawalDate: withdrawal.withdrawalDate.toISOString(),
          createdAt: withdrawal.createdAt.toISOString(),
          createdBy: withdrawal.createdBy,
        };
      } catch (err) {
        console.error("[Admin Finance Withdrawal Create] Error:", err);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 120 }),
        note: t.Optional(t.String({ maxLength: 500 })),
        amount: t.Number({ exclusiveMinimum: 0 }),
        withdrawalDate: t.String(),
      }),
    },
  )

  .delete("/withdrawals/:id", async ({ params, set }) => {
    try {
      await db.financeWithdrawal.delete({
        where: { id: params.id },
      });

      return { success: true };
    } catch (err) {
      console.error("[Admin Finance Withdrawal Delete] Error:", err);
      set.status = 500;
      return { message: "Internal server error" };
    }
  });
