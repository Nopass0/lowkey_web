#!/usr/bin/env bun

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { VoidClient, parseSchemaFile } from "@voiddb/orm";

const VOIDDB_URL = (process.env.VOIDDB_URL || "https://db.lowkey.su").replace(/\/$/, "");
const SCHEMA_PATH = resolve(import.meta.dir, "../.voiddb/schema/english.schema");

function requireVoidDbAuth() {
  const token = process.env.VOIDDB_TOKEN || "";
  const username = process.env.VOIDDB_USERNAME || "";
  const password = process.env.VOIDDB_PASSWORD || "";

  if (token) {
    return { token };
  }

  if (username && password) {
    return { username, password };
  }

  throw new Error("Set VOIDDB_TOKEN or VOIDDB_USERNAME/VOIDDB_PASSWORD before syncing the English schema.");
}

function isAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /invalid or expired token|unauthorized|forbidden|401|403/i.test(message);
}

async function getClient() {
  const auth = requireVoidDbAuth();

  if ("token" in auth) {
    const tokenClient = VoidClient.fromEnv({
      url: VOIDDB_URL,
      token: auth.token,
    });

    try {
      await tokenClient.listDatabases();
      return tokenClient;
    } catch (error) {
      const username = process.env.VOIDDB_USERNAME || "";
      const password = process.env.VOIDDB_PASSWORD || "";
      if (!isAuthError(error) || !username || !password) {
        throw error;
      }

      console.warn("[sync-db] token rejected, falling back to username/password auth");
      const passwordClient = VoidClient.fromEnv({ url: VOIDDB_URL });
      await passwordClient.login(username, password);
      return passwordClient;
    }
  }

  const client = VoidClient.fromEnv({ url: VOIDDB_URL });
  await client.login(auth.username, auth.password);
  return client;
}

async function main() {
  if (!existsSync(SCHEMA_PATH)) {
    throw new Error(`Schema file not found: ${SCHEMA_PATH}`);
  }

  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const project = parseSchemaFile(schema);
  const client = await getClient();

  const databases = [...new Set(project.models.map((model) => model.schema.database).filter(Boolean))];
  if (databases.length === 0) {
    throw new Error("No databases declared in english.schema");
  }

  const existingDatabases = await client.listDatabases();
  for (const database of databases) {
    if (!existingDatabases.includes(database)) {
      console.log(`Creating database ${database}`);
      await client.createDatabase(database);
    }
  }

  const plan = await client.schema.push(project);
  if (plan.operations.length === 0) {
    console.log("Schema already up to date.");
  } else {
    for (const operation of plan.operations) {
      console.log(`APPLY ${operation.summary}`);
    }
  }

  for (const database of databases) {
    const declaredCollections = project.models
      .filter((model) => model.schema.database === database)
      .map((model) => model.schema.collection || model.name);
    const existingCollections = await client.db(database).listCollections();

    for (const collection of declaredCollections) {
      if (!existingCollections.includes(collection)) {
        throw new Error(`Collection ${database}.${collection} was not created`);
      }

      console.log(`OK ${database}.${collection}`);
    }
  }

  console.log(`Schema synced to ${VOIDDB_URL} for database(s): ${databases.join(", ")}`);
}

main().catch((error) => {
  console.error(`[sync-db] ${error.message}`);
  process.exit(1);
});
