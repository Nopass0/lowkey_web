const defaultFrontendUrl = process.env.NODE_ENV === "production"
  ? "https://english.lowkey.su"
  : "http://localhost:3003";

function parseOrigins(value: string | undefined) {
  const defaults = [
    defaultFrontendUrl,
    "http://localhost:3003",
    "http://127.0.0.1:3003",
    "https://english.lowkey.su",
  ];

  if (!value) {
    return [...new Set(defaults)];
  }

  return [...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .concat(defaults)
  )];
}

export const config = {
  host: process.env.HOST || "0.0.0.0",
  port: parseInt(process.env.PORT || "3002"),
  jwtSecret: process.env.JWT_SECRET || "english-learning-secret-key-change-in-prod",
  voiddb: {
    url: process.env.VOIDDB_URL || "https://db.lowkey.su",
    database: process.env.VOIDDB_DATABASE || "english",
    token: process.env.VOIDDB_TOKEN || "",
    username: process.env.VOIDDB_USERNAME || "",
    password: process.env.VOIDDB_PASSWORD || "",
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || "",
  },
  yokassa: {
    shopId: process.env.YOKASSA_SHOP_ID || "",
    secret: process.env.YOKASSA_SECRET || "",
    testShopId: process.env.YOKASSA_TEST_SHOP_ID || "",
    testSecret: process.env.YOKASSA_TEST_SECRET || "",
    testMode: process.env.YOKASSA_TEST_MODE === "true",
  },
  bitllm: {
    url: process.env.BITLLM_URL || "http://localhost:8080",
    apiKey: process.env.BITLLM_API_KEY || "",
  },
  uploadsDir: process.env.UPLOADS_DIR || "./uploads",
  frontendUrl: process.env.FRONTEND_URL || defaultFrontendUrl,
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
};
