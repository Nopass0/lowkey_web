import axios from "axios";
import { VoidClient, query } from "@voiddb/orm";
import { nanoid } from "nanoid";
import { config } from "./config";

type VoidRow = {
  _id: string;
  [key: string]: any;
};

export type FilterOp = { field: string; op: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "contains" | "in"; value: any };
export type SortOp = { field: string; direction: "asc" | "desc" };

export interface QueryOptions {
  filters?: FilterOp[];
  sort?: SortOp[];
  limit?: number;
  offset?: number;
}

type QueryInput = QueryOptions | FilterOp[];
type BlobRef = {
  _blob_bucket: string;
  _blob_key: string;
  _blob_url: string;
};

let authPromise: Promise<VoidClient> | null = null;
let rawTokenPromise: Promise<string> | null = null;
const ensuredBuckets = new Set<string>();

function mapField(field: string) {
  return field === "id" ? "_id" : field;
}

function stripUndefined(data: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

function normalizeInput(data: Record<string, any>, ensureId = false) {
  const { id, _id, ...rest } = data;
  const next = stripUndefined({ ...rest }) as Record<string, any>;
  const resolvedId = _id || id || (ensureId ? nanoid() : undefined);

  if (resolvedId) {
    next.id = resolvedId;
    next._id = resolvedId;
  }

  return next;
}

function normalizeRow<T extends Record<string, any> | null>(row: T) {
  if (!row) {
    return null;
  }

  const resolvedId = row._id || row.id;
  const { _id, id, ...rest } = row;
  return {
    id: resolvedId,
    _id: resolvedId,
    ...rest,
  };
}

function normalizeQueryOptions(input: QueryInput = {}): QueryOptions {
  if (Array.isArray(input)) {
    return { filters: input };
  }

  return input || {};
}

function buildQuery(input: QueryInput = {}) {
  const opts = normalizeQueryOptions(input);
  let builder = query();

  for (const filter of opts.filters || []) {
    builder = builder.where(mapField(filter.field), filter.op, filter.value);
  }

  for (const sort of opts.sort || []) {
    builder = builder.orderBy(mapField(sort.field), sort.direction);
  }

  if (typeof opts.limit === "number") {
    builder = builder.limit(opts.limit);
  }

  if (typeof opts.offset === "number" && opts.offset > 0) {
    builder = builder.skip(opts.offset);
  }

  return builder;
}

function createClient(token?: string) {
  return VoidClient.fromEnv({
    url: config.voiddb.url,
    token: token || undefined,
  });
}

function baseVoidUrl() {
  return config.voiddb.url.replace(/\/$/, "");
}

function encodePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function isAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /invalid or expired token|unauthorized|forbidden|401|403/i.test(message);
}

function isMissingBucketError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /bucket|blob|not found|404/i.test(message);
}

function isMissingOrUnsupportedFileRoute(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /404|not found|files\//i.test(message);
}

function matchesPatch(actual: any, expected: any): boolean {
  if (expected === undefined) {
    return true;
  }

  if (expected === null || typeof expected !== "object") {
    return actual === expected;
  }

  if (Array.isArray(expected)) {
    return Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected);
  }

  if (!actual || typeof actual !== "object") {
    return false;
  }

  return Object.entries(expected).every(([key, value]) => matchesPatch(actual[key], value));
}

function preservesDocumentState(
  before: Record<string, any>,
  after: Record<string, any>,
  patch: Record<string, any>,
) {
  if (!matchesPatch(after, patch)) {
    return false;
  }

  return Object.entries(before).every(([key, value]) => {
    if (key === "updatedAt" || Object.prototype.hasOwnProperty.call(patch, key)) {
      return true;
    }

    return matchesPatch(after[key], value);
  });
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (config.voiddb.token && !forceRefresh) {
    return config.voiddb.token;
  }

  if (!forceRefresh && rawTokenPromise) {
    return rawTokenPromise;
  }

  rawTokenPromise = (async () => {
    if (config.voiddb.token && !forceRefresh) {
      return config.voiddb.token;
    }

    if (!config.voiddb.username || !config.voiddb.password) {
      throw new Error(
        "VoidDB auth is missing. Set VOIDDB_TOKEN or VOIDDB_USERNAME/VOIDDB_PASSWORD.",
      );
    }

    const response = await axios.post(
      `${baseVoidUrl()}/v1/auth/login`,
      {
        username: config.voiddb.username,
        password: config.voiddb.password,
      },
      {
        adapter: "http",
        timeout: 30_000,
      },
    );

    const token =
      response.data?.access_token ||
      response.data?.token ||
      response.data?.accessToken;

    if (!token) {
      throw new Error("VoidDB login succeeded but did not return an access token.");
    }

    return token as string;
  })();

  return rawTokenPromise;
}

async function rawVoidRequest<T = any>(configOverrides: {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  data?: any;
  headers?: Record<string, string>;
  timeout?: number;
}) {
  const send = async (token: string) =>
    axios.request<T>({
      adapter: "http",
      method: configOverrides.method,
      url: configOverrides.url,
      data: configOverrides.data,
      timeout: configOverrides.timeout || 60_000,
      headers: {
        Authorization: `Bearer ${token}`,
        ...configOverrides.headers,
      },
    });

  try {
    return await send(await getAccessToken());
  } catch (error) {
    if (isAuthError(error) && config.voiddb.username && config.voiddb.password) {
      rawTokenPromise = null;
      return send(await getAccessToken(true));
    }
    throw error;
  }
}

async function getClient() {
  if (!authPromise) {
    authPromise = (async () => {
      if (config.voiddb.token) {
        const tokenClient = createClient(config.voiddb.token);

        try {
          await tokenClient.listDatabases();
          return tokenClient;
        } catch (error) {
          if (
            !isAuthError(error) ||
            !config.voiddb.username ||
            !config.voiddb.password
          ) {
            if (isAuthError(error)) {
              throw new Error(
                "VoidDB token is invalid or expired, and username/password auth is not configured.",
              );
            }
            throw error;
          }
        }
      }

      if (!config.voiddb.username || !config.voiddb.password) {
        throw new Error(
          "VoidDB auth is missing. Set VOIDDB_TOKEN or VOIDDB_USERNAME/VOIDDB_PASSWORD.",
        );
      }

      const passwordClient = createClient();
      await passwordClient.login(config.voiddb.username, config.voiddb.password);
      return passwordClient;
    })();
  }

  return authPromise;
}

async function getCollection(name: string) {
  return (await getClient()).db(config.voiddb.database).collection<VoidRow>(name);
}

async function findRowById(collection: string, id: string) {
  const handle = await getCollection(collection);
  const rows = await handle.find(query().where("_id", "eq", id).limit(1));
  return rows.first() ?? null;
}

async function ensureBucket(bucket: string) {
  if (ensuredBuckets.has(bucket)) {
    return;
  }

  try {
    await rawVoidRequest({
      method: "PUT",
      url: `${baseVoidUrl()}/s3/${encodeURIComponent(bucket)}`,
      timeout: 30_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (!/409|already exists/i.test(message)) {
      throw error;
    }
  }

  ensuredBuckets.add(bucket);
}

function buildBlobRef(bucket: string, key: string): BlobRef {
  return {
    _blob_bucket: bucket,
    _blob_key: key,
    _blob_url: `${baseVoidUrl()}/s3/${encodeURIComponent(bucket)}/${encodePath(key)}`,
  };
}

function buildBlobKey(
  collection: string,
  id: string,
  field: string,
  options?: { filename?: string; key?: string },
) {
  if (options?.key) {
    return options.key;
  }

  const safeFilename = (options?.filename || `${field}-${nanoid(8)}`)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || `${field}-${nanoid(8)}`;

  return `${collection}/${id}/${field}/${Date.now()}-${safeFilename}`;
}

async function persistDocumentPatch(
  collection: string,
  id: string,
  patch: Record<string, any>,
  options: { verify?: boolean } = {},
) {
  const verify = options.verify ?? true;
  const handle = await getCollection(collection);
  const normalizedPatch = normalizeInput(patch);
  const current = await findRowById(collection, id);

  if (!current) {
    throw new Error(`Document not found: ${collection}/${id}`);
  }

  if (!verify) {
    const replacement = normalizeInput({
      ...current,
      ...normalizedPatch,
      id,
      _id: id,
      ...(Object.prototype.hasOwnProperty.call(current, "updatedAt") &&
      !Object.prototype.hasOwnProperty.call(normalizedPatch, "updatedAt")
        ? { updatedAt: new Date().toISOString() }
        : {}),
    });

    await handle.delete(id);
    try {
      await handle.insert(replacement);
    } catch (error) {
      try {
        await handle.insert(normalizeInput({ ...current, id, _id: id }));
      } catch {
        // Best-effort restore only.
      }
      throw error;
    }

    const reloaded = await findRowById(collection, id);
    if (reloaded) {
      return reloaded;
    }

    throw new Error(`VoidDB rewrite fallback did not persist for ${collection}/${id}`);
  }

  try {
    await handle.patch(id, normalizedPatch);
    const reloaded = await findRowById(collection, id);
    if (reloaded && preservesDocumentState(current, reloaded, normalizedPatch)) {
      return reloaded;
    }
    console.warn(
      "[voiddb] patch did not persist for %s/%s, falling back to rewrite",
      collection,
      id,
    );
  } catch (error) {
    console.warn(
      "[voiddb] patch failed for %s/%s, falling back to rewrite: %s",
      collection,
      id,
      error instanceof Error ? error.message : String(error || ""),
    );
  }

  const replacement = normalizeInput({
    ...current,
    ...normalizedPatch,
    id,
    _id: id,
    ...(Object.prototype.hasOwnProperty.call(current, "updatedAt") &&
    !Object.prototype.hasOwnProperty.call(normalizedPatch, "updatedAt")
      ? { updatedAt: new Date().toISOString() }
      : {}),
  });

  await handle.delete(id);
  try {
    await handle.insert(replacement);
  } catch (error) {
    try {
      await handle.insert(normalizeInput({ ...current, id, _id: id }));
    } catch {
      // Best-effort restore only.
    }
    throw error;
  }

  const reloaded = await findRowById(collection, id);
  if (reloaded && preservesDocumentState(current, reloaded, normalizedPatch)) {
    return reloaded;
  }

  throw new Error(`VoidDB rewrite fallback did not persist for ${collection}/${id}`);
}

async function uploadViaS3(
  collection: string,
  id: string,
  field: string,
  source: ArrayBuffer | Uint8Array,
  options?: { filename?: string; contentType?: string; bucket?: string; key?: string },
) {
  const bucket = options?.bucket || `${config.voiddb.database}-blobs`;
  const key = buildBlobKey(collection, id, field, options);
  const ref = buildBlobRef(bucket, key);
  const body = source instanceof Uint8Array ? source : new Uint8Array(source);

  await ensureBucket(bucket);
  await rawVoidRequest({
    method: "PUT",
    url: `${baseVoidUrl()}/s3/${encodeURIComponent(bucket)}/${encodePath(key)}`,
    data: body,
    headers: {
      "Content-Type": options?.contentType || "application/octet-stream",
    },
    timeout: 120_000,
  });

  await persistDocumentPatch(collection, id, { [field]: ref }, { verify: false });
  return ref;
}

async function deleteViaS3(collection: string, id: string, field: string) {
  const current = await findRowById(collection, id);
  const ref = current?.[field] as BlobRef | undefined;

  if (ref?._blob_bucket && ref?._blob_key) {
    try {
      await rawVoidRequest({
        method: "DELETE",
        url: `${baseVoidUrl()}/s3/${encodeURIComponent(ref._blob_bucket)}/${encodePath(ref._blob_key)}`,
        timeout: 60_000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (!/404|not found/i.test(message)) {
        throw error;
      }
    }
  }

  await persistDocumentPatch(collection, id, { [field]: null }, { verify: false });
}

export const db = {
  async create(collection: string, data: Record<string, any>) {
    const handle = await getCollection(collection);
    const id = await handle.insert(normalizeInput(data, true));
    return normalizeRow(await findRowById(collection, id));
  },

  async findOne(collection: string, filters: FilterOp[]) {
    const handle = await getCollection(collection);
    const rows = await handle.find(buildQuery({ filters, limit: 1 }));
    return normalizeRow(rows.first());
  },

  async findMany(collection: string, opts: QueryInput = {}) {
    const handle = await getCollection(collection);
    const rows = await handle.find(buildQuery(opts));
    return rows.toArray().map((row) => normalizeRow(row));
  },

  async count(collection: string, filters: FilterOp[] = []) {
    const handle = await getCollection(collection);
    return handle.count(buildQuery({ filters }));
  },

  async update(collection: string, id: string, data: Record<string, any>) {
    return normalizeRow(await persistDocumentPatch(collection, id, data));
  },

  async delete(collection: string, id: string) {
    const handle = await getCollection(collection);
    await handle.delete(id);
  },

  async uploadFile(
    collection: string,
    id: string,
    field: string,
    source: ArrayBuffer | Uint8Array,
    options?: { filename?: string; contentType?: string; bucket?: string; key?: string },
  ) {
    const handle = await getCollection(collection);
    try {
      return await handle.uploadFile(id, field, source, options);
    } catch (error) {
      if (options?.bucket && isMissingBucketError(error)) {
        console.warn(
          "[voiddb] upload failed for bucket %s, retrying with default bucket for %s.%s",
          options.bucket,
          collection,
          field,
        );
        const { bucket: _bucket, ...fallbackOptions } = options;
        try {
          return await handle.uploadFile(id, field, source, fallbackOptions);
        } catch (fallbackError) {
          if (isMissingOrUnsupportedFileRoute(fallbackError)) {
            console.warn(
              "[voiddb] upload endpoint unsupported for %s.%s, falling back to raw /s3 upload",
              collection,
              field,
            );
            return uploadViaS3(collection, id, field, source, options);
          }
          throw fallbackError;
        }
      }

      if (isMissingOrUnsupportedFileRoute(error)) {
        console.warn(
          "[voiddb] upload endpoint unsupported for %s.%s, falling back to raw /s3 upload",
          collection,
          field,
        );
        return uploadViaS3(collection, id, field, source, options);
      }
      throw error;
    }
  },

  async deleteFile(collection: string, id: string, field: string) {
    const handle = await getCollection(collection);
    try {
      await handle.deleteFile(id, field);
    } catch (error) {
      if (isMissingOrUnsupportedFileRoute(error)) {
        console.warn(
          "[voiddb] delete endpoint unsupported for %s.%s, falling back to raw /s3 delete",
          collection,
          field,
        );
        await deleteViaS3(collection, id, field);
        return;
      }
      throw error;
    }
  },

  async blobUrl(collection: string, ref: any) {
    const handle = await getCollection(collection);
    return handle.blobUrl(ref);
  },

  async upsert(collection: string, filters: FilterOp[], data: Record<string, any>) {
    const existing = await db.findOne(collection, filters);
    if (existing) {
      return db.update(collection, existing.id, data);
    }

    return db.create(collection, data);
  },

  filter: {
    eq: (field: string, value: any): FilterOp => ({ field, op: "eq", value }),
    ne: (field: string, value: any): FilterOp => ({ field, op: "ne", value }),
    gt: (field: string, value: any): FilterOp => ({ field, op: "gt", value }),
    lt: (field: string, value: any): FilterOp => ({ field, op: "lt", value }),
    gte: (field: string, value: any): FilterOp => ({ field, op: "gte", value }),
    lte: (field: string, value: any): FilterOp => ({ field, op: "lte", value }),
    contains: (field: string, value: any): FilterOp => ({ field, op: "contains", value }),
    in: (field: string, value: any[]): FilterOp => ({ field, op: "in", value }),
  },
};
