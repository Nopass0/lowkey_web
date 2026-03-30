import { config } from "./config";

const BASE_URL = config.voiddb.url;
const API_KEY = config.voiddb.apiKey;

async function voidRequest(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`VoidDB error ${res.status}: ${text}`);
  }
  return res.json();
}

export type FilterOp = { field: string; op: string; value: any };
export type SortOp = { field: string; direction: "asc" | "desc" };

export interface QueryOptions {
  filters?: FilterOp[];
  sort?: SortOp[];
  limit?: number;
  offset?: number;
}

function buildQuery(collection: string, opts: QueryOptions = {}) {
  return {
    collection,
    filters: opts.filters || [],
    sort: opts.sort || [],
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
  };
}

export const db = {
  async create(collection: string, data: Record<string, any>) {
    return voidRequest("POST", "/documents", { collection, data });
  },

  async findOne(collection: string, filters: FilterOp[]) {
    const result = await voidRequest("POST", "/query", buildQuery(collection, { filters, limit: 1 }));
    return result?.documents?.[0] ?? null;
  },

  async findMany(collection: string, opts: QueryOptions = {}) {
    const result = await voidRequest("POST", "/query", buildQuery(collection, opts));
    return result?.documents ?? [];
  },

  async count(collection: string, filters: FilterOp[] = []) {
    const result = await voidRequest("POST", "/query", buildQuery(collection, { filters, limit: 0 }));
    return result?.total ?? 0;
  },

  async update(collection: string, id: string, data: Record<string, any>) {
    return voidRequest("PATCH", `/documents/${collection}/${id}`, data);
  },

  async delete(collection: string, id: string) {
    return voidRequest("DELETE", `/documents/${collection}/${id}`);
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
