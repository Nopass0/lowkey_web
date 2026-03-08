/**
 * @fileoverview Application configuration loaded from environment variables.
 * All env vars are validated and typed here — import `config` everywhere else.
 */

/** Application configuration object */
export const config = {
  /** PostgreSQL connection string */
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/lowkey",

  /** Redis connection string */
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",

  /** Secret key for signing JWTs (min 32 chars) */
  JWT_SECRET:
    process.env.JWT_SECRET ?? "your-secret-key-min-32-chars-change-me",

  /** JWT token expiry for regular users */
  JWT_EXPIRY: process.env.JWT_EXPIRY ?? "30d",

  /** Admin login username */
  ADMIN_LOGIN: process.env.ADMIN_LOGIN ?? "nopass",

  /** JWT token expiry for admin users */
  ADMIN_JWT_EXPIRY: process.env.ADMIN_JWT_EXPIRY ?? "8h",

  /** Telegram bot token for sending admin OTP codes */
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",

  /** Telegram chat ID where admin OTP codes are sent */
  TELEGRAM_ADMIN_CHAT_ID: process.env.TELEGRAM_ADMIN_CHAT_ID ?? "",

  /** Tochka SBP API key */
  TOCHKA_API_KEY: process.env.TOCHKA_API_KEY ?? "",

  /** Tochka SBP account ID */
  TOCHKA_ACCOUNT_ID: process.env.TOCHKA_ACCOUNT_ID ?? "",

  /** Tochka SBP merchant ID */
  TOCHKA_MERCHANT_ID: process.env.TOCHKA_MERCHANT_ID ?? "",

  /** Directory for storing uploaded app files */
  APP_FILES_DIR: process.env.APP_FILES_DIR ?? "./uploads",

  /** Server port */
  PORT: parseInt(process.env.PORT ?? "3001", 10),
} as const;
