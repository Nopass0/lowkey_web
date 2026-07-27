/**
 * @fileoverview Authentication middleware for ElysiaJS.
 * Provides `authMiddleware` for regular users and `adminMiddleware` for admin-only routes.
 * Both check the Authorization Bearer token and verify it against the JWT secret.
 * Token blocklist is checked via Redis to support logout.
 */

import { Elysia } from "elysia";
import { verifyJwt } from "./jwt";
import { redis } from "../redis";

async function authenticateRequest(
  headers: Record<string, string | undefined>,
  set: { status?: number | string },
) {
  // 🛡️ BRUTAL LOGGER for debugging 401 on Client Rules
  const targetPath = (headers['x-forwarded-uri'] || headers['x-original-uri'] || "unknown").toLowerCase();
  const isRulesPath = targetPath.includes("client-rules");
  
  if (isRulesPath) {
    const allHeaders = JSON.stringify(headers, null, 2);
    console.warn(`[BRUTAL-LOGGER] Admin request detected. Path: ${targetPath}\nHeaders: ${allHeaders}`);
  }

  // Debug logging for production: list all incoming header keys to check for stripping/renaming
  const headerKeys = Object.keys(headers).join(", ");
  const authHeader = headers.authorization || (headers as any).Authorization;
  
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    console.warn(`[DEBUG-AUTH] No token. Keys: [${headerKeys}]. Path: ${headers['x-forwarded-uri'] || 'unknown'}`);
    set.status = 401;
    throw new Error("Unauthorized");
  }

  const payload = await verifyJwt(token);
  if (!payload) {
    console.warn(`[DEBUG-AUTH] JWT Fail. Path: ${headers['x-forwarded-uri'] || 'unknown'}. Token prefix: ${token.substring(0, 10)}`);
    set.status = 401;
    throw new Error("Invalid token");
  }

  let blocked: string | null = null;
  try {
    blocked = await redis.get(`token:blocklist:${payload.jti}`);
  } catch (error) {
    console.error("[Auth] Redis blocklist check failed:", error);
  }

  if (blocked) {
    set.status = 401;
    throw new Error("Token revoked");
  }

  return {
    user: payload,
    token,
  };
}

/**
 * Auth middleware for regular authenticated users.
 * Extracts and verifies the Bearer token from the Authorization header.
 * Checks token blocklist in Redis (for logout support).
 * Adds `user` object to the context with `userId` and `isAdmin`.
 */
export const authMiddleware = new Elysia({ name: "auth" }).derive(
  { as: "scoped" },
  async ({ headers, set }) => authenticateRequest(headers, set),
);

/**
 * Admin middleware - extends authMiddleware.
 * Ensures the authenticated user has `isAdmin: true` in their JWT payload.
 * Returns 403 Forbidden if the user is not an admin.
 */
export const adminMiddleware = new Elysia({ name: "admin-auth" })
  .derive({ as: "scoped" }, async ({ headers, set }) => {
    const auth = await authenticateRequest(headers, set);
    if (!auth.user.isAdmin) {
      set.status = 403;
      throw new Error("Forbidden");
    }

    return {
      ...auth,
      adminUser: auth.user,
    };
  });
