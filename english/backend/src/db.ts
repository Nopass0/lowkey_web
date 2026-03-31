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

let authPromise: Promise<VoidClient> | null = null;

function mapField(field: string) {
  return field === "id" ? "_id" : field;
}

function normalizeInput(data: Record<string, any>, ensureId = false) {
  const { id, _id, ...rest } = data;
  const next = { ...rest } as Record<string, any>;
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

function buildQuery(opts: QueryOptions = {}) {
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

function isAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /invalid or expired token|unauthorized|forbidden|401|403/i.test(message);
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

export const db = {
  async create(collection: string, data: Record<string, any>) {
    const handle = await getCollection(collection);
    const id = await handle.insert(normalizeInput(data, true));
    return normalizeRow(await handle.findById(id));
  },

  async findOne(collection: string, filters: FilterOp[]) {
    const handle = await getCollection(collection);
    const rows = await handle.find(buildQuery({ filters, limit: 1 }));
    return normalizeRow(rows.first());
  },

  async findMany(collection: string, opts: QueryOptions = {}) {
    const handle = await getCollection(collection);
    const rows = await handle.find(buildQuery(opts));
    return rows.toArray().map((row) => normalizeRow(row));
  },

  async count(collection: string, filters: FilterOp[] = []) {
    const handle = await getCollection(collection);
    return handle.count(buildQuery({ filters }));
  },

  async update(collection: string, id: string, data: Record<string, any>) {
    const handle = await getCollection(collection);
    const row = await handle.patch(id, normalizeInput(data));
    return normalizeRow(row);
  },

  async delete(collection: string, id: string) {
    const handle = await getCollection(collection);
    await handle.delete(id);
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
