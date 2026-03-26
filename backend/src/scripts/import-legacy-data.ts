import { PrismaClient } from "@prisma/client";
import { VoidClient } from "@voiddb/orm";
import Redis from "ioredis";

type ImportSpec = {
  delegate: string;
  collection: string;
};

type ImportStats = {
  inserted: number;
  replaced: number;
  skipped: number;
};

const DATABASE_NAME = "lowkey";
const BATCH_SIZE = 200;
const RECENCY_FIELDS = [
  "updatedAt",
  "processedAt",
  "sentAt",
  "processingAt",
  "creditedAt",
  "refundedAt",
  "lastSeenAt",
  "periodStartsAt",
  "activeUntil",
  "expiresAt",
  "activatedAt",
  "withdrawalDate",
  "createdAt",
  "joinedAt",
] as const;

const IMPORT_SPECS: ImportSpec[] = [
  { delegate: "user", collection: "users" },
  { delegate: "telegramMailing", collection: "telegram_mailings" },
  { delegate: "subscriptionPlan", collection: "subscription_plans" },
  { delegate: "subscriptionPrice", collection: "subscription_prices" },
  { delegate: "subscription", collection: "subscriptions" },
  { delegate: "transaction", collection: "transactions" },
  { delegate: "payment", collection: "payments" },
  { delegate: "paymentMethod", collection: "payment_methods" },
  { delegate: "yokassaSettings", collection: "yokassa_settings" },
  { delegate: "device", collection: "devices" },
  { delegate: "promoCode", collection: "promo_codes" },
  { delegate: "promoActivation", collection: "promo_activations" },
  { delegate: "withdrawal", collection: "withdrawals" },
  { delegate: "financeWithdrawal", collection: "finance_withdrawals" },
  { delegate: "financeSettings", collection: "finance_settings" },
  { delegate: "appRelease", collection: "app_releases" },
  { delegate: "supportTicket", collection: "support_tickets" },
  { delegate: "vpnServer", collection: "vpn_servers" },
  { delegate: "vpnToken", collection: "vpn_tokens" },
  { delegate: "aiSettings", collection: "ai_settings" },
  { delegate: "aiSubscription", collection: "ai_subscriptions" },
  { delegate: "aiConversation", collection: "ai_conversations" },
  { delegate: "aiMessage", collection: "ai_messages" },
  { delegate: "aiUsageEntry", collection: "ai_usage_entries" },
  { delegate: "aiFile", collection: "ai_files" },
];

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getLegacyDatabaseUrl(): string {
  return process.env.LEGACY_DATABASE_URL ?? getRequiredEnv("DATABASE_URL");
}

function getLegacyRedisUrl(): string | null {
  return process.env.LEGACY_REDIS_URL ?? process.env.REDIS_URL ?? null;
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      out[key] = normalizeValue(nestedValue);
    }
    return out;
  }

  return value;
}

function toVoidDocument(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key === "id" ? "_id" : key] = normalizeValue(value);
  }
  return out;
}

function toTimestamp(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = new Date(String(value)).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function getRecency(value: Record<string, unknown>): number | null {
  let max: number | null = null;

  for (const field of RECENCY_FIELDS) {
    const timestamp = toTimestamp(value[field]);
    if (timestamp == null) {
      continue;
    }

    max = max == null ? timestamp : Math.max(max, timestamp);
  }

  return max;
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    status?: number;
    response?: { status?: number };
    message?: string;
  };

  return (
    candidate.status === 404 ||
    candidate.response?.status === 404 ||
    candidate.message?.includes("404") === true
  );
}

async function importCollection(
  prisma: PrismaClient,
  client: VoidClient,
  spec: ImportSpec,
): Promise<ImportStats> {
  const delegate = (prisma as Record<string, any>)[spec.delegate];
  if (!delegate) {
    throw new Error(`Legacy Prisma delegate missing: ${spec.delegate}`);
  }

  const collection = client.db(DATABASE_NAME).collection<Record<string, unknown> & { _id: string }>(spec.collection);
  const stats: ImportStats = { inserted: 0, replaced: 0, skipped: 0 };
  let skip = 0;

  for (;;) {
    const rows = (await delegate.findMany({
      orderBy: { id: "asc" },
      skip,
      take: BATCH_SIZE,
    })) as Array<Record<string, unknown>>;

    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      const document = toVoidDocument(row);
      const id = String(document._id);
      const sourceRecency = getRecency(row);

      try {
        const existing = await collection.findById(id);
        const targetRecency = getRecency(existing as Record<string, unknown>);
        const shouldReplace =
          sourceRecency == null ||
          targetRecency == null ||
          sourceRecency >= targetRecency;

        if (!shouldReplace) {
          stats.skipped += 1;
          continue;
        }

        const { _id, ...payload } = document;
        await collection.replace(id, payload);
        stats.replaced += 1;
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }

        await collection.insert(document);
        stats.inserted += 1;
      }
    }

    skip += rows.length;
  }

  return stats;
}

async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
  let cursor = "0";
  const keys: string[] = [];

  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", "200");
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");

  return keys;
}

async function importLegacyCache(client: VoidClient, redisUrl: string): Promise<number> {
  const redis = new Redis(redisUrl);

  try {
    const keys = Array.from(
      new Set(
        (
          await Promise.all([
            scanKeys(redis, "admin:otp:*"),
            scanKeys(redis, "token:blocklist:*"),
            scanKeys(redis, "device:online:*"),
          ])
        ).flat(),
      ),
    );

    let imported = 0;
    for (const key of keys) {
      const value = await redis.get(key);
      if (value == null) {
        continue;
      }

      const ttl = await redis.ttl(key);
      await client.cache.set(
        key,
        {
          value,
          expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : null,
        },
        ttl > 0 ? ttl : undefined,
      );
      imported += 1;
    }

    return imported;
  } finally {
    redis.disconnect();
  }
}

async function main() {
  const legacyDatabaseUrl = getLegacyDatabaseUrl();
  const legacyRedisUrl = getLegacyRedisUrl();
  const client = VoidClient.fromEnv();

  if (process.env.VOIDDB_USERNAME && process.env.VOIDDB_PASSWORD) {
    await client.login(process.env.VOIDDB_USERNAME, process.env.VOIDDB_PASSWORD);
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: legacyDatabaseUrl,
      },
    },
  });

  try {
    for (const spec of IMPORT_SPECS) {
      const stats = await importCollection(prisma, client, spec);
      console.log(
        `[import] ${spec.collection}: inserted=${stats.inserted} replaced=${stats.replaced} skipped=${stats.skipped}`,
      );
    }

    if (legacyRedisUrl) {
      const importedCacheKeys = await importLegacyCache(client, legacyRedisUrl);
      console.log(`[import] cache: imported=${importedCacheKeys}`);
    } else {
      console.log("[import] cache: skipped (LEGACY_REDIS_URL/REDIS_URL not configured)");
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
