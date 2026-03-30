#!/usr/bin/env bun

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const VOIDDB_URL = (process.env.VOIDDB_URL || "http://localhost:7701").replace(/\/$/, "");
const VOIDDB_API_KEY = process.env.VOIDDB_API_KEY || "english-voiddb-key";
const CONTAINER_NAME = process.env.VOIDDB_CONTAINER_NAME || "english-voiddb";
const SHOULD_RESTART = process.argv.includes("--restart-container") || process.env.SYNC_DB_RESTART_CONTAINER === "true";
const SCHEMA_PATH = resolve(import.meta.dir, "../.voiddb/schema/english.schema");

interface ParsedDatabase {
  name: string;
  collections: string[];
}

function extractBlocks(source: string, keyword: string) {
  const blocks: Array<{ name: string; body: string }> = [];
  const pattern = keyword === "database" ? /\bdatabase\s*\{/g : /\bmodel\s+(\w+)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const openBraceIndex = source.indexOf("{", match.index);
    if (openBraceIndex === -1) {
      continue;
    }

    let depth = 1;
    let cursor = openBraceIndex + 1;

    while (cursor < source.length && depth > 0) {
      const char = source[cursor];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      cursor += 1;
    }

    if (depth !== 0) {
      throw new Error(`Unclosed ${keyword} block in ${SCHEMA_PATH}`);
    }

    blocks.push({
      name: keyword === "database" ? "" : match[1],
      body: source.slice(openBraceIndex + 1, cursor - 1),
    });

    pattern.lastIndex = cursor;
  }

  return blocks;
}

function parseDatabases(schema: string) {
  const databases = extractBlocks(schema, "database").map((databaseBlock) => {
    const nameMatch = databaseBlock.body.match(/\bname\s*=\s*"([^"]+)"/);
    const models = extractBlocks(databaseBlock.body, "model");
    const collections = models.map((modelBlock) => {
      const mapMatch = modelBlock.body.match(/@@map\("([^"]+)"\)/);
      return mapMatch?.[1] || modelBlock.name;
    });

    if (!nameMatch) {
      throw new Error("Every database block must declare a name.");
    }

    if (collections.length === 0) {
      throw new Error(`Database "${nameMatch[1]}" does not declare any models.`);
    }

    return {
      name: nameMatch[1],
      collections,
    };
  });

  if (databases.length > 0) {
    return databases;
  }

  const legacyCollections = [...schema.matchAll(/^collection\s+(\w+)\s*\{/gm)].map((match) => match[1]);
  if (legacyCollections.length > 0) {
    return [{ name: "legacy", collections: legacyCollections }];
  }

  return [];
}

async function request(pathname: string, body?: unknown) {
  const response = await fetch(`${VOIDDB_URL}${pathname}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": VOIDDB_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });

  return response;
}

async function waitForHealth(timeoutSeconds = 90) {
  for (let second = 0; second < timeoutSeconds; second += 1) {
    try {
      const response = await request("/health");
      if (response.ok) {
        return;
      }
    } catch {
      // ignore
    }

    await Bun.sleep(1000);
  }

  throw new Error(`VoidDB is not reachable at ${VOIDDB_URL}`);
}

function runDocker(args: string[]) {
  return Bun.spawnSync({
    cmd: ["docker", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
}

function containerExists() {
  const result = runDocker(["ps", "-a", "--filter", `name=^/${CONTAINER_NAME}$`, "--format", "{{.Names}}"]);
  return result.exitCode === 0 && result.stdout.toString().trim() === CONTAINER_NAME;
}

async function restartContainerIfNeeded() {
  if (!SHOULD_RESTART || !containerExists()) {
    return false;
  }

  const result = runDocker(["restart", CONTAINER_NAME]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString().trim() || `Failed to restart ${CONTAINER_NAME}`);
  }

  await waitForHealth();
  return true;
}

async function verifyCollection(name: string) {
  const response = await request("/query", {
    collection: name,
    filters: [],
    limit: 1,
    offset: 0,
  });

  return response.ok;
}

async function main() {
  if (!existsSync(SCHEMA_PATH)) {
    throw new Error(`Schema file not found: ${SCHEMA_PATH}`);
  }

  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const databases = parseDatabases(schema);
  const collections = [...new Set(databases.flatMap((database) => database.collections))];

  if (collections.length === 0) {
    throw new Error("No database models or legacy collections were found in english.schema");
  }

  const restarted = await restartContainerIfNeeded();
  if (!restarted) {
    await waitForHealth();
  }

  console.log(`Schema databases: ${databases.map((database) => database.name).join(", ")}`);

  const missing: string[] = [];

  for (const collection of collections) {
    const ok = await verifyCollection(collection);
    console.log(`${ok ? "OK " : "ERR"} ${collection}`);
    if (!ok) {
      missing.push(collection);
    }
  }

  if (missing.length > 0) {
    throw new Error(`VoidDB schema is missing collections: ${missing.join(", ")}`);
  }

  console.log(`Schema verified for ${collections.length} collections across ${databases.length} database(s).`);
}

main().catch((error) => {
  console.error(`[sync-db] ${error.message}`);
  process.exit(1);
});
