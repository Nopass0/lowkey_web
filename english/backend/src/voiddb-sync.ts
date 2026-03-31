import { existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { VoidClient, parseSchemaFile } from "@voiddb/orm";
import { config } from "./config";
import { db } from "./db";

const SCHEMA_PATH = resolve(import.meta.dir, "../.voiddb/schema/english.schema");

function isAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /invalid or expired token|unauthorized|forbidden|401|403/i.test(message);
}

async function getSchemaClient() {
  if (config.voiddb.username && config.voiddb.password) {
    const client = VoidClient.fromEnv({ url: config.voiddb.url });
    await client.login(config.voiddb.username, config.voiddb.password);
    return client;
  }

  if (config.voiddb.token) {
    const tokenClient = VoidClient.fromEnv({
      url: config.voiddb.url,
      token: config.voiddb.token,
    });

    try {
      await tokenClient.listDatabases();
      return tokenClient;
    } catch (error) {
      if (!isAuthError(error)) {
        throw error;
      }
    }
  }

  return null;
}

export async function syncEnglishSchemaOnStartup() {
  if (!existsSync(SCHEMA_PATH)) {
    console.warn(`[voiddb] schema file not found: ${SCHEMA_PATH}`);
    return;
  }

  const client = await getSchemaClient();
  if (!client) {
    console.warn("[voiddb] schema sync skipped: missing valid auth");
    return;
  }

  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const project = parseSchemaFile(schema);
  const databases = [...new Set(project.models.map((model) => model.schema.database).filter(Boolean))];

  if (databases.length === 0) {
    console.warn("[voiddb] schema sync skipped: no databases declared");
    return;
  }

  const existingDatabases = await client.listDatabases();
  for (const database of databases) {
    if (!existingDatabases.includes(database)) {
      await client.createDatabase(database);
    }
  }

  const plan = await client.schema.push(project);
  if (plan.operations.length > 0) {
    for (const operation of plan.operations) {
      console.log(`[voiddb] APPLY ${operation.summary}`);
    }
  }
}

function guessImageContentType(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export async function backfillLegacyAvatarsToBlob() {
  const users = await db.findMany("EnglishUsers", {
    filters: [db.filter.contains("avatarUrl", "/uploads/avatars/")],
    limit: 500,
  });

  for (const user of users) {
    const avatarUrl = typeof user.avatarUrl === "string" ? user.avatarUrl : "";
    if (!avatarUrl.startsWith("/uploads/avatars/")) {
      continue;
    }

    const fileName = avatarUrl.split("/").pop();
    if (!fileName) {
      continue;
    }

    const filePath = resolve(config.uploadsDir, "avatars", fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const buffer = await readFile(filePath);

    try {
      await db.deleteFile("EnglishUsers", user.id, "avatar");
    } catch {
      // Ignore missing previous blob.
    }

    const avatarRef = await db.uploadFile("EnglishUsers", user.id, "avatar", buffer, {
      filename: fileName,
      contentType: guessImageContentType(fileName),
    });

    await db.update("EnglishUsers", user.id, {
      avatarUrl: await db.blobUrl("EnglishUsers", avatarRef),
    });

    console.log(`[voiddb] migrated avatar for user ${user.id}`);
  }
}
