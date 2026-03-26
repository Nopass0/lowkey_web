/**
 * @fileoverview Redis-compatible cache wrapper backed by VoidDB cache.
 * Supports the subset used by the backend: get/set/del/ttl.
 */

import { getVoidClient } from "./db";

type CacheEnvelope = {
  value: string;
  expiresAt?: number | null;
};

function isEnvelope(value: unknown): value is CacheEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof (value as Record<string, unknown>).value === "string"
  );
}

class VoidRedisCompat {
  async get(key: string): Promise<string | null> {
    const entry = await (await getVoidClient()).cache.get<CacheEnvelope | string>(key);
    if (entry == null) {
      return null;
    }

    if (typeof entry === "string") {
      return entry;
    }

    if (!isEnvelope(entry)) {
      return JSON.stringify(entry);
    }

    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
      await this.del(key);
      return null;
    }

    return entry.value;
  }

  async set(
    key: string,
    value: string,
    mode?: "EX",
    ttlSeconds?: number,
  ): Promise<"OK"> {
    const ttl = mode === "EX" ? ttlSeconds : undefined;
    const payload: CacheEnvelope = {
      value,
      expiresAt: typeof ttl === "number" ? Date.now() + ttl * 1000 : null,
    };

    await (await getVoidClient()).cache.set(key, payload, ttl);
    return "OK";
  }

  async del(key: string): Promise<number> {
    await (await getVoidClient()).cache.delete(key);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const entry = await (await getVoidClient()).cache.get<CacheEnvelope | string>(key);
    if (entry == null) {
      return -2;
    }

    if (typeof entry === "string" || !isEnvelope(entry) || entry.expiresAt == null) {
      return -1;
    }

    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    if (remaining <= 0) {
      await this.del(key);
      return -2;
    }

    return remaining;
  }
}

export const redis = new VoidRedisCompat();
