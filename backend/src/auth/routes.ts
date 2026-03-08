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

/**
 * Sends a message to the configured Telegram admin chat via Bot API.
 *
 * @param message - Text message to send
 */
async function sendTelegramMessage(message: string): Promise<void> {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_ADMIN_CHAT_ID) {
    console.warn(
      "[Telegram] Bot token or chat ID not configured, skipping message:",
      message,
    );
    return;
  }
  try {
    await fetch(
      `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.TELEGRAM_ADMIN_CHAT_ID,
          text: message,
        }),
      },
    );
  } catch (err) {
    console.error("[Telegram] Failed to send message:", err);
  }
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

        const token = await signJwt({ userId: user.id, isAdmin: false });

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

        const token = await signJwt({ userId: user.id, isAdmin: false });
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
        code: t.String(),
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
          const referrer = await db.user.findUnique({
            where: { referralCode },
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
          await sendTelegramMessage(`🔐 Код входа: ${code}`);
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
            },
          });
        }

        const token = await signJwt(
          { userId: adminUser.id, isAdmin: true },
          config.ADMIN_JWT_EXPIRY,
        );

        return {
          token,
          user: {
            id: adminUser.id,
            login: adminUser.login,
            avatarHash: avatarHash(adminUser.login),
            isAdmin: true,
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
