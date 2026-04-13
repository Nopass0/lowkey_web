/**
 * @fileoverview Application configuration loaded from environment variables.
 * All env vars are validated and typed here — import `config` everywhere else.
 */

/** Application configuration object */
export const config = {
  /** VoidDB base URL used by the backend and provisioned VPN nodes */
  VOIDDB_URL: process.env.VOIDDB_URL ?? "https://db.lowkey.su",

  /** VoidDB username used when provisioned VPN nodes connect directly */
  VOIDDB_USERNAME: process.env.VOIDDB_USERNAME ?? "",

  /** VoidDB password used when provisioned VPN nodes connect directly */
  VOIDDB_PASSWORD: process.env.VOIDDB_PASSWORD ?? "",

  /** VoidDB token used when provisioned VPN nodes connect directly */
  VOIDDB_TOKEN: process.env.VOIDDB_TOKEN ?? "",

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

  /** Shared secret used by VPN nodes for /servers/* write endpoints */
  BACKEND_SECRET: process.env.BACKEND_SECRET ?? "",

  /** Email used by deploy-time Let's Encrypt issuance on the main site server */
  LETSENCRYPT_EMAIL: process.env.LETSENCRYPT_EMAIL ?? "",

  /** PEM certificate body served to VPN nodes when auto-provisioning TLS */
  VPN_TLS_CERT_PEM: process.env.VPN_TLS_CERT_PEM ?? "",

  /** PEM private key body served to VPN nodes when auto-provisioning TLS */
  VPN_TLS_KEY_PEM: process.env.VPN_TLS_KEY_PEM ?? "",

  /** Filesystem path to the wildcard/fullchain certificate used for VPN node TLS */
  VPN_TLS_CERT_FILE: process.env.VPN_TLS_CERT_FILE ?? "",

  /** Filesystem path to the private key used for VPN node TLS */
  VPN_TLS_KEY_FILE: process.env.VPN_TLS_KEY_FILE ?? "",

  /** Optional certbot cert name override when it differs from the site hostname */
  VPN_TLS_CERT_NAME: process.env.VPN_TLS_CERT_NAME ?? "",

  /** Mounted certbot live directory visible to the backend container */
  VPN_TLS_CERTBOT_DIR:
    process.env.VPN_TLS_CERTBOT_DIR ?? "/etc/letsencrypt/live",

  /** Optional hostname suffix restriction for auto-issued VPN node TLS */
  VPN_TLS_ALLOWED_SUFFIX: process.env.VPN_TLS_ALLOWED_SUFFIX ?? ".lowkey.su",

  /** Git repository cloned by remote VPN node bootstrap */
  VPN_NODE_REPO_URL:
    process.env.VPN_NODE_REPO_URL ??
    "https://github.com/Nopass0/lowkey_hysteria.git",

  /** Base directory used on remote VPN nodes for the cloned repo */
  VPN_NODE_BASE_DIR: process.env.VPN_NODE_BASE_DIR ?? "/opt/lowkey_hysteria",

  /** PM2 process name prefix used for remote VPN node deployment */
  VPN_NODE_PM2_PREFIX: process.env.VPN_NODE_PM2_PREFIX ?? "hysteria",

  /** JWT token expiry for regular users */
  JWT_EXPIRY: process.env.JWT_EXPIRY ?? "30d",

  /** JOPA relay API base URL (e.g. http://89.169.54.87:9109) */
  JOPA_API_URL: process.env.JOPA_API_URL ?? "http://89.169.54.87:9109",

  /** JOPA relay bootstrap login */
  JOPA_LOGIN: process.env.JOPA_LOGIN ?? "rtest1",

  /** JOPA relay bootstrap password */
  JOPA_PASSWORD: process.env.JOPA_PASSWORD ?? "rtest1",

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
