/**
 * @fileoverview Auth routes: login, register, admin OTP, logout.
 * All routes are prefixed with /auth by the parent router.
 */

import Elysia, { t } from "elysia";
import { hash, compare } from "bcryptjs";
import { db } from "../db";
import { redis } from "../redis";
import { config } from "../config";
import { signJwt, getTokenExp } from "./jwt";
import { authMiddleware } from "./middleware";
import crypto from "crypto";
import { sendTelegramMessage } from "../telegram";
import {
  autoPurchaseSubscription,
  buildYKReceipt,
  createYKPayment,
  getSubscriptionCharge,
  isYKTestMode,
} from "../payments/yokassa";

/**
 * Generates a Gravatar-style avatar hash from a login string.
 * Uses MD5 hash of the lowercased login.
 *
 * @param login - User login string
 * @returns Hex MD5 hash
 */
function avatarHash(login: string): string {
  return crypto.createHash("md5").update(login.toLowerCase()).digest("hex");
}

/**
 * Generates a unique referral code from a login string.
 * Format: uppercase login prefix (up to 8 chars) + random hex suffix.
 *
 * @param login - User login string
 * @returns Unique referral code
 */
function generateReferralCode(login: string): string {
  const prefix = login.toUpperCase().slice(0, 8);
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${prefix}${suffix}`;
}

function getReferralCodeVariants(referralCode: string): string[] {
  const trimmed = referralCode.trim();
  const upper = trimmed.toUpperCase();
  const normalized = upper.replace(/^REF_/, "");

  return [...new Set([trimmed, upper, normalized, `REF_${normalized}`])].filter(
    Boolean,
  );
}

function sanitizeBotRedirect(target?: string | null): string {
  if (!target) {
    return "/me/billing";
  }

  try {
    const decoded = decodeURIComponent(target);
    if (!decoded.startsWith("/")) {
      return "/me/billing";
    }

    if (decoded.startsWith("//") || decoded.includes("\r") || decoded.includes("\n")) {
      return "/me/billing";
    }

    return decoded;
  } catch {
    return "/me/billing";
  }
}

const BOT_PENDING_PAYMENT_STORAGE_KEY = "lowkey.pending_yk_payment";

interface BotPendingPayment {
  paymentId: string;
  confirmationUrl: string | null;
  amount: number;
}

interface BotPaymentRedirect {
  redirectTo: string;
  pendingPayment?: BotPendingPayment | null;
}

function buildBotAutologinHtml(
  token: string,
  user: { id: string; login: string; isAdmin: boolean },
  redirectTo: string,
  pendingPayment?: BotPendingPayment | null,
): string {
  const payload = JSON.stringify({
    state: {
      isAuthenticated: true,
      user: {
        id: user.id,
        login: user.login,
        avatarHash: avatarHash(user.login),
        isAdmin: user.isAdmin,
      },
      token,
    },
    version: 0,
  });

  const scriptData = JSON.stringify({
    storageKey: "lowkey-auth",
    payload,
    redirectTo,
    pendingPaymentStorageKey: BOT_PENDING_PAYMENT_STORAGE_KEY,
    pendingPayment: pendingPayment ?? null,
  });

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Авторизация...</title>
  </head>
  <body>
    <p>Выполняется вход...</p>
    <script>
      (function () {
        const data = ${scriptData};
        try {
          localStorage.setItem(data.storageKey, data.payload);
        } catch {}
        try {
          if (data.pendingPayment) {
            sessionStorage.setItem(
              data.pendingPaymentStorageKey,
              JSON.stringify(data.pendingPayment),
            );
          }
        } catch {}
        window.location.replace(data.redirectTo);
      })();
    </script>
  </body>
</html>`;
}

function buildAuthResponse(user: {
  id: string;
  login: string;
  isAdmin?: boolean | null;
}) {
  const isAdmin = Boolean(user.isAdmin);

  return {
    user: {
      id: user.id,
      login: user.login,
      avatarHash: avatarHash(user.login),
      isAdmin,
    },
    isAdmin,
  };
}

async function createBotPaymentAction(params: {
  userId: string;
  action?: string;
  amount?: string;
  plan?: string;
  period?: string;
}): Promise<BotPaymentRedirect | null> {
  const action = params.action ?? "";
  if (!action) {
    return null;
  }

  const isTest = await isYKTestMode();

  if (action === "topup") {
    const amount = Number(params.amount ?? 0);
    if (!Number.isFinite(amount) || amount < 10) {
      throw new Error("Invalid topup amount");
    }

    const receipt = await buildYKReceipt(
      params.userId,
      amount,
      "Пополнение баланса lowkey",
      "full_prepayment",
    );
    const ykPayment = await createYKPayment(
      {
        amount: { value: amount.toFixed(2), currency: "RUB" },
        payment_method_type: "bank_card",
        capture: true,
        save_payment_method: true,
        description: `${isTest ? "[TEST] " : ""}Пополнение баланса lowkey`,
        confirmation: {
          type: "redirect",
          return_url: `${config.SITE_URL}/me/billing?source=telegram`,
        },
        metadata: {
          userId: params.userId,
          purpose: "topup",
          source: "telegram_bot",
        },
        ...(receipt ? { receipt } : {}),
      },
      crypto.randomUUID(),
    );

    const payment = await db.payment.create({
      data: {
        userId: params.userId,
        yokassaPaymentId: ykPayment.id,
        amount,
        status: "pending",
        provider: "yokassa",
        paymentType: "bank_card",
        confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
        description: `${isTest ? "[TEST] " : ""}Пополнение на ${amount} ₽`,
        metadata: {
          userId: params.userId,
          purpose: "topup",
          source: "telegram_bot",
        },
        isTest: ykPayment.test ?? isTest,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return {
      redirectTo: ykPayment.confirmation?.confirmation_url ?? `${config.SITE_URL}/me/billing`,
      pendingPayment: {
        paymentId: payment.id,
        confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
        amount,
      },
    };
  }

  if (action === "link_card") {
    const receipt = await buildYKReceipt(
      params.userId,
      1,
      "Привязка карты lowkey",
      "full_prepayment",
    );
    const ykPayment = await createYKPayment(
      {
        amount: { value: "1.00", currency: "RUB" },
        payment_method_type: "bank_card",
        capture: true,
        save_payment_method: true,
        description: `${isTest ? "[TEST] " : ""}Привязка карты lowkey`,
        confirmation: {
          type: "redirect",
          return_url: `${config.SITE_URL}/me/billing?linked=1`,
        },
        metadata: {
          userId: params.userId,
          purpose: "link_card",
          source: "telegram_bot",
        },
        ...(receipt ? { receipt } : {}),
      },
      crypto.randomUUID(),
    );

    const payment = await db.payment.create({
      data: {
        userId: params.userId,
        yokassaPaymentId: ykPayment.id,
        amount: 1,
        status: "pending",
        provider: "yokassa",
        paymentType: "link_card",
        confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
        description: `${isTest ? "[TEST] " : ""}Привязка карты`,
        metadata: {
          userId: params.userId,
          purpose: "link_card",
          source: "telegram_bot",
        },
        isTest: ykPayment.test ?? isTest,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return {
      redirectTo:
        ykPayment.confirmation?.confirmation_url ?? `${config.SITE_URL}/me/billing?linked=1`,
      pendingPayment: {
        paymentId: payment.id,
        confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
        amount: 1,
      },
    };
  }

  if (action === "promo_subscribe") {
    const plan = await db.subscriptionPlan.findUnique({
      where: { slug: params.plan ?? "" },
    });

    if (!plan || !plan.isActive || !plan.promoActive || plan.promoPrice == null) {
      throw new Error("Promo is unavailable");
    }

    const receipt = await buildYKReceipt(
      params.userId,
      plan.promoPrice,
      `Промо-подписка ${plan.name}`,
      "full_prepayment",
    );
    const ykPayment = await createYKPayment(
      {
        amount: { value: plan.promoPrice.toFixed(2), currency: "RUB" },
        payment_method_type: "bank_card",
        capture: true,
        save_payment_method: true,
        description: `${isTest ? "[TEST] " : ""}${plan.promoLabel ?? "Промо"}: ${plan.name}`,
        confirmation: {
          type: "redirect",
          return_url: `${config.SITE_URL}/me/billing?subscribed=1`,
        },
        metadata: {
          userId: params.userId,
          purpose: "promo_subscribe",
          planSlug: plan.slug,
          nextBillingPeriod: "monthly",
          source: "telegram_bot",
        },
        ...(receipt ? { receipt } : {}),
      },
      crypto.randomUUID(),
    );

    const payment = await db.payment.create({
      data: {
        userId: params.userId,
        yokassaPaymentId: ykPayment.id,
        amount: plan.promoPrice,
        status: "pending",
        provider: "yokassa",
        paymentType: "promo_subscribe",
        confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
        description: `${isTest ? "[TEST] " : ""}Промо-подписка "${plan.name}"`,
        metadata: {
          userId: params.userId,
          purpose: "promo_subscribe",
          planSlug: plan.slug,
          nextBillingPeriod: "monthly",
          source: "telegram_bot",
        },
        isTest: ykPayment.test ?? isTest,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return {
      redirectTo:
        ykPayment.confirmation?.confirmation_url ?? `${config.SITE_URL}/me/billing?subscribed=1`,
      pendingPayment: {
        paymentId: payment.id,
        confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
        amount: plan.promoPrice,
      },
    };
  }

  if (action === "subscribe") {
    const plan = await db.subscriptionPlan.findUnique({
      where: { slug: params.plan ?? "" },
    });
    const period = params.period ?? "monthly";

    if (!plan || !plan.isActive) {
      throw new Error("Subscription is unavailable");
    }

    const charge = await getSubscriptionCharge(plan.slug, period, false);
    if (plan.isTelegramPlan && charge.amount <= 0) {
      await autoPurchaseSubscription(params.userId, plan.slug, period, null, false);
      return {
        redirectTo: `${config.SITE_URL}/me/billing?subscribed=1`,
        pendingPayment: null,
      };
    }

    const user = await db.user.findUnique({
      where: { id: params.userId },
      select: { balance: true },
    });
    const shortfall = Math.max(0, charge.amount - (user?.balance ?? 0));

    if (shortfall <= 0) {
      const receipt = await buildYKReceipt(
        params.userId,
        1,
        `Привязка карты для подписки ${plan.name}`,
        "full_prepayment",
      );
      const ykPayment = await createYKPayment(
        {
          amount: { value: "1.00", currency: "RUB" },
          payment_method_type: "bank_card",
          capture: true,
          save_payment_method: true,
          description: `${isTest ? "[TEST] " : ""}Привязка карты для подписки ${plan.name}`,
          confirmation: {
            type: "redirect",
            return_url: `${config.SITE_URL}/me/billing?subscribed=1`,
          },
          metadata: {
            userId: params.userId,
            purpose: "link_card",
            subscriptionPlanId: plan.slug,
            subscriptionPeriod: period,
            source: "telegram_bot",
          },
          ...(receipt ? { receipt } : {}),
        },
        crypto.randomUUID(),
      );

      const payment = await db.payment.create({
        data: {
          userId: params.userId,
          yokassaPaymentId: ykPayment.id,
          amount: 1,
          status: "pending",
          provider: "yokassa",
          paymentType: "link_card",
          confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
          description: `${isTest ? "[TEST] " : ""}Привязка карты для подписки "${plan.name}"`,
          metadata: {
            userId: params.userId,
            purpose: "link_card",
            subscriptionPlanId: plan.slug,
            subscriptionPeriod: period,
            source: "telegram_bot",
          },
          isTest: ykPayment.test ?? isTest,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      return {
        redirectTo:
          ykPayment.confirmation?.confirmation_url ?? `${config.SITE_URL}/me/billing?subscribed=1`,
        pendingPayment: {
          paymentId: payment.id,
          confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
          amount: 1,
        },
      };
    }

    const receipt = await buildYKReceipt(
      params.userId,
      shortfall,
      `Доплата для подписки ${plan.name}`,
      "full_prepayment",
    );
    const ykPayment = await createYKPayment(
      {
        amount: { value: shortfall.toFixed(2), currency: "RUB" },
        payment_method_type: "bank_card",
        capture: true,
        save_payment_method: true,
        description: `${isTest ? "[TEST] " : ""}Доплата для подписки ${plan.name}`,
        confirmation: {
          type: "redirect",
          return_url: `${config.SITE_URL}/me/billing?subscribed=1`,
        },
        metadata: {
          userId: params.userId,
          purpose: "subscription_topup",
          subscriptionPlanId: plan.slug,
          subscriptionPeriod: period,
          source: "telegram_bot",
        },
        ...(receipt ? { receipt } : {}),
      },
      crypto.randomUUID(),
    );

    const payment = await db.payment.create({
      data: {
        userId: params.userId,
        yokassaPaymentId: ykPayment.id,
        amount: shortfall,
        status: "pending",
        provider: "yokassa",
        paymentType: "bank_card",
        confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
        description: `${isTest ? "[TEST] " : ""}Доплата ${shortfall} ₽ для подписки "${plan.name}"`,
        metadata: {
          userId: params.userId,
          purpose: "subscription_topup",
          subscriptionPlanId: plan.slug,
          subscriptionPeriod: period,
          source: "telegram_bot",
        },
        isTest: ykPayment.test ?? isTest,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return {
      redirectTo:
        ykPayment.confirmation?.confirmation_url ?? `${config.SITE_URL}/me/billing?subscribed=1`,
      pendingPayment: {
        paymentId: payment.id,
        confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
        amount: shortfall,
      },
    };
  }

  return null;
}

/**
 * Auth routes group.
 * Handles user login, registration, admin OTP flow, and logout.
 */
export const authRoutes = new Elysia({ prefix: "/auth" })
  // ─── POST /auth/login ──────────────────────────────────
  .post(
    "/login",
    async ({ body, set }) => {
      try {
        const { login, password } = body;

        const user = await db.user.findUnique({ where: { login } });
        if (!user) {
          set.status = 404;
          return { message: "User not found" };
        }

        if (user.isBanned) {
          set.status = 403;
          return { message: "Account banned" };
        }

        // If user is linked to Telegram, we bypass password and send OTP to bot.
        // Or we could require password AND OTP, but requirements said:
        // "Авторизует если через бота то просто логин указываешь в начале и все - тогда вместо пароля при авторизации на сайте будут приходить коды в боте."
        if (user.telegramId) {
          const code = Math.floor(100000 + Math.random() * 900000).toString();
          await db.user.update({
            where: { id: user.id },
            data: {
              botLoginCode: code,
              botLoginCodeExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 mins
            },
          });

          // Send to Bot
          await sendTelegramMessage(
            user.telegramId.toString(),
            `🔐 Код для пользователя ${user.login} входа на сайт: **${code}**`,
          );

          return { requireOtp: true, message: "OTP sent to Telegram" };
        }

        if (!password) {
          set.status = 400;
          return { message: "Password required for typical login" };
        }

        const valid = await compare(password, user.passwordHash);
        if (!valid) {
          set.status = 401;
          return { message: "Wrong password" };
        }

        const auth = buildAuthResponse(user);
        const token = await signJwt({
          userId: user.id,
          isAdmin: auth.isAdmin,
        });

        return {
          token,
          user: auth.user,
        };
      } catch (err) {
        set.status = 500;
        return { message: err instanceof Error ? err.stack : String(err) };
      }
    },
    {
      body: t.Object({
        login: t.String(),
        password: t.Optional(t.String()), // Made optional since OTP flow doesn't need it if we change frontend logic, but currently we accept it.
      }),
    },
  )

  // ─── POST /auth/login-otp ──────────────────────────────
  .post(
    "/login-otp",
    async ({ body, set }) => {
      try {
        const { login, code } = body;
        const user = await db.user.findUnique({ where: { login } });

        if (!user || !user.botLoginCode || !user.botLoginCodeExpiresAt) {
          set.status = 400;
          return { message: "Invalid request" };
        }

        if (new Date() > user.botLoginCodeExpiresAt) {
          set.status = 400;
          return { message: "Code expired" };
        }

        if (user.botLoginCode !== code) {
          set.status = 401;
          return { message: "Invalid code" };
        }

        // Clear code
        await db.user.update({
          where: { id: user.id },
          data: { botLoginCode: null, botLoginCodeExpiresAt: null },
        });

        const auth = buildAuthResponse(user);
        const token = await signJwt({
          userId: user.id,
          isAdmin: auth.isAdmin,
        });
        return {
          token,
          user: auth.user,
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        login: t.String(),
        code: t.String(),
      }),
    },
  )
  .get(
    "/bot-autologin/:code",
    async ({ params, query, set }) => {
      let redirectTo = sanitizeBotRedirect(
        typeof query.redirect === "string" ? query.redirect : null,
      );

      const user = await db.$transaction(async (tx) => {
        const found = await tx.user.findFirst({
          where: {
            botLoginCode: params.code,
            botLoginCodeExpiresAt: { gt: new Date() },
          },
        });

        if (!found) {
          return null;
        }

        await tx.user.update({
          where: { id: found.id },
          data: {
            botLoginCode: null,
            botLoginCodeExpiresAt: null,
          },
        });

        return found;
      });

      if (!user) {
        set.status = 401;
        set.headers["content-type"] = "text/html; charset=utf-8";
        return "<!doctype html><html lang=\"ru\"><body><p>Ссылка недействительна или истекла.</p></body></html>";
      }

      if (user.isBanned) {
        set.status = 403;
        set.headers["content-type"] = "text/html; charset=utf-8";
        return "<!doctype html><html lang=\"ru\"><body><p>Аккаунт заблокирован.</p></body></html>";
      }

      const paymentRedirect = await createBotPaymentAction({
        userId: user.id,
        action: typeof query.action === "string" ? query.action : undefined,
        amount: typeof query.amount === "string" ? query.amount : undefined,
        plan: typeof query.plan === "string" ? query.plan : undefined,
        period: typeof query.period === "string" ? query.period : undefined,
      });
      let pendingPayment: BotPendingPayment | null = null;
      if (paymentRedirect) {
        redirectTo = paymentRedirect.redirectTo;
        pendingPayment = paymentRedirect.pendingPayment ?? null;
      }

      const token = await signJwt({ userId: user.id, isAdmin: Boolean(user.isAdmin) });
      set.headers["content-type"] = "text/html; charset=utf-8";
      return buildBotAutologinHtml(
        token,
        { id: user.id, login: user.login, isAdmin: Boolean(user.isAdmin) },
        redirectTo,
        pendingPayment,
      );
    },
    {
      params: t.Object({
        code: t.String(),
      }),
      query: t.Object({
        redirect: t.Optional(t.String()),
        action: t.Optional(t.String()),
        amount: t.Optional(t.String()),
        plan: t.Optional(t.String()),
        period: t.Optional(t.String()),
      }),
    },
  )

  // ─── POST /auth/register ───────────────────────────────
  .post(
    "/register",
    async ({ body, set }) => {
      try {
        const { login, password, referralCode } = body;

        // Validate login format
        if (!/^[a-zA-Z0-9_]{3,24}$/.test(login)) {
          set.status = 400;
          return {
            message: "Login must be 3-24 chars, alphanumeric + underscore",
          };
        }

        // Validate password length
        if (password.length < 6) {
          set.status = 400;
          return { message: "Password must be at least 6 characters" };
        }

        // Check if login already taken
        const existing = await db.user.findUnique({ where: { login } });
        if (existing) {
          set.status = 409;
          return { message: "Login already taken" };
        }

        // Hash password
        const passwordHash = await hash(password, 10);

        // Find referrer if referral code provided
        let referredById: string | undefined;
        if (referralCode) {
          const referrer = await db.user.findFirst({
            where: { referralCode: { in: getReferralCodeVariants(referralCode) } },
            select: { id: true },
          });
          if (referrer) {
            referredById = referrer.id;
          }
        }

        // Generate unique referral code for new user
        let userReferralCode = generateReferralCode(login);
        // Ensure uniqueness
        while (
          await db.user.findUnique({
            where: { referralCode: userReferralCode },
          })
        ) {
          userReferralCode = generateReferralCode(login);
        }

        // Create user
        const user = await db.user.create({
          data: {
            login,
            passwordHash,
            referralCode: userReferralCode,
            referredById,
          },
        });

        const token = await signJwt({ userId: user.id, isAdmin: false });

        set.status = 201;
        return {
          token,
          user: {
            id: user.id,
            login: user.login,
            avatarHash: avatarHash(user.login),
            isAdmin: false,
          },
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        login: t.String(),
        password: t.String(),
        referralCode: t.Optional(t.String()),
      }),
    },
  )

  // ─── POST /auth/admin/request-code ─────────────────────
  .post(
    "/admin/request-code",
    async ({ body, set }) => {
      try {
        const { login } = body;

        // Always return 200 regardless of login validity (security)
        if (login === config.ADMIN_LOGIN) {
          const code = Math.floor(100000 + Math.random() * 900000).toString();
          await redis.set(
            `admin:otp:${login}`,
            JSON.stringify({ code, attempts: 0 }),
            "EX",
            300,
          );
          await sendTelegramMessage({
            botToken: config.TELEGRAM_MAILING_BOT_TOKEN,
            chatId: config.TELEGRAM_ADMIN_CHAT_ID,
            text: `🔐 Код входа: ${code}`,
          });
        }

        return { sent: true };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        login: t.String(),
      }),
    },
  )

  // ─── POST /auth/admin/verify-code ──────────────────────
  .post(
    "/admin/verify-code",
    async ({ body, set }) => {
      try {
        const { login, code } = body;

        if (login !== config.ADMIN_LOGIN) {
          set.status = 401;
          return { message: "Invalid credentials" };
        }

        const stored = await redis.get(`admin:otp:${login}`);
        if (!stored) {
          set.status = 401;
          return { message: "Code expired or not requested" };
        }

        const otpData = JSON.parse(stored) as {
          code: string;
          attempts: number;
        };

        // Rate limit: max 5 attempts
        if (otpData.attempts >= 5) {
          await redis.del(`admin:otp:${login}`);
          set.status = 429;
          return { message: "Too many attempts" };
        }

        if (otpData.code !== code) {
          // Increment attempts
          otpData.attempts += 1;
          const ttl = await redis.ttl(`admin:otp:${login}`);
          await redis.set(
            `admin:otp:${login}`,
            JSON.stringify(otpData),
            "EX",
            ttl > 0 ? ttl : 300,
          );
          set.status = 401;
          return { message: "Wrong code" };
        }

        // Delete OTP after successful verification
        await redis.del(`admin:otp:${login}`);

        // Find or create admin user
        let adminUser = await db.user.findUnique({ where: { login } });
        if (!adminUser) {
          const passwordHash = await hash(
            crypto.randomBytes(32).toString("hex"),
            10,
          );
          let referralCode = generateReferralCode(login);
          while (await db.user.findUnique({ where: { referralCode } })) {
            referralCode = generateReferralCode(login);
          }
          adminUser = await db.user.create({
            data: {
              login,
              passwordHash,
              referralCode,
              isAdmin: true,
            },
          });
        } else if (!adminUser.isAdmin) {
          adminUser = await db.user.update({
            where: { id: adminUser.id },
            data: { isAdmin: true },
          });
        }

        const auth = buildAuthResponse(adminUser);
        const token = await signJwt(
          { userId: adminUser.id, isAdmin: auth.isAdmin },
          config.ADMIN_JWT_EXPIRY,
        );

        return {
          token,
          user: auth.user,
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        login: t.String(),
        code: t.String(),
      }),
    },
  )

  // ─── POST /auth/logout ────────────────────────────────
  .use(authMiddleware)
  .post("/logout", async ({ user, token, set }) => {
    try {
      // Add token JTI to blocklist until its expiry
      const exp = await getTokenExp(token);
      const ttl = exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.set(`token:blocklist:${user.jti}`, "1", "EX", ttl);
      }

      set.status = 204;
      return;
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  });
