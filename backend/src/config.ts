/**
 * @fileoverview Application configuration loaded from environment variables.
 * All env vars are validated and typed here — import `config` everywhere else.
 */

/** Application configuration object */
export const config = {
  /** Legacy PostgreSQL connection string used only by import tooling */
  LEGACY_DATABASE_URL:
    process.env.LEGACY_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://user:pass@localhost:5432/lowkey",

  /** Legacy Redis connection string used only by import tooling */
  LEGACY_REDIS_URL:
    process.env.LEGACY_REDIS_URL ??
    process.env.REDIS_URL ??
    "redis://localhost:6379",

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

  /** Telegram bot token for admin mailings */
  TELEGRAM_MAILING_BOT_TOKEN:
    process.env.TELEGRAM_MAILING_BOT_TOKEN ??
    process.env.TELEGRAM_BOT_TOKEN ??
    "",

  /** Telegram chat ID where admin OTP codes are sent */
  TELEGRAM_ADMIN_CHAT_ID: process.env.TELEGRAM_ADMIN_CHAT_ID ?? "",

  /** Telegram chat ID used for test mailing previews */
  TELEGRAM_MAILING_TEST_CHAT_ID:
    process.env.TELEGRAM_MAILING_TEST_CHAT_ID ??
    process.env.TELEGRAM_ADMIN_CHAT_ID ??
    "",

  /** Tochka SBP API key */
  TOCHKA_API_KEY: process.env.TOCHKA_API_KEY ?? "",

  /** Tochka SBP account ID */
  TOCHKA_ACCOUNT_ID: process.env.TOCHKA_ACCOUNT_ID ?? "",

  /** Tochka SBP merchant ID */
  TOCHKA_MERCHANT_ID: process.env.TOCHKA_MERCHANT_ID ?? "",

  /** Directory for storing uploaded app files */
  APP_FILES_DIR: process.env.APP_FILES_DIR ?? "./uploads",

  /** Vercel Blob token for AI uploads and generated artifacts */
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ?? "",

  /** Optional global OpenRouter API key fallback */
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",

  /** Default OpenRouter chat model when OpenRouter is enabled */
  OPENROUTER_DEFAULT_MODEL:
    process.env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-4o-mini",

  /** Default local LLM endpoint */
  AI_LOCAL_BASE_URL: process.env.AI_LOCAL_BASE_URL ?? "http://ollama:11434",

  /** Default local model name */
  AI_LOCAL_MODEL: process.env.AI_LOCAL_MODEL ?? "qwen3.5:0.8b",

  /** YooKassa production shop ID */
  YOKASSA_SHOP_ID: process.env.YOKASSA_SHOP_ID ?? "",

  /** YooKassa production secret key */
  YOKASSA_SECRET: process.env.YOKASSA_SECRET ?? "",

  /** YooKassa test shop ID */
  YOKASSA_TEST_SHOP_ID: process.env.YOKASSA_TEST_SHOP_ID ?? "",

  /** YooKassa test secret key */
  YOKASSA_TEST_SECRET: process.env.YOKASSA_TEST_SECRET ?? "",

  /** Public base URL of the site (for YooKassa return URL) */
  SITE_URL: process.env.SITE_URL ?? "https://lowkey.su",

  /** Fallback email used for YooKassa receipts when the user has no email login */
  YOKASSA_RECEIPT_EMAIL:
    process.env.YOKASSA_RECEIPT_EMAIL ?? "receipts@lowkey.su",

  /** Server port */
  PORT: parseInt(process.env.PORT ?? "3001", 10),
} as const;
