/**
 * @fileoverview Authentication middleware for ElysiaJS.
 * Provides `authMiddleware` for regular users and `adminMiddleware` for admin-only routes.
 * Both check the Authorization Bearer token and verify it against the JWT secret.
 * Token blocklist is checked via Redis to support logout.
 */

import { Elysia } from "elysia";
import { verifyJwt } from "./jwt";
import { redis } from "../redis";

/**
 * Auth middleware for regular authenticated users.
 * Extracts and verifies the Bearer token from the Authorization header.
 * Checks token blocklist in Redis (for logout support).
 * Adds `user` object to the context with `userId` and `isAdmin`.
 */
export const authMiddleware = new Elysia({ name: "auth" }).derive(
  { as: "global" },
  async ({ headers, set }) => {
    const token = headers.authorization?.replace("Bearer ", "");
    if (!token) {
      set.status = 401;
      throw new Error("Unauthorized");
    }

    const payload = await verifyJwt(token);
    if (!payload) {
      set.status = 401;
      throw new Error("Invalid token");
    }

    try {
      const blocked = await redis.get(`token:blocklist:${payload.jti}`);
      if (blocked) {
        set.status = 401;
        throw new Error("Token revoked");
      }
    } catch (error) {
      console.error("[Auth] Redis blocklist check failed:", error);
    }

    return {
      user: payload,
      token,
    };
  },
);

/**
 * Admin middleware - extends authMiddleware.
 * Ensures the authenticated user has `isAdmin: true` in their JWT payload.
 * Returns 403 Forbidden if the user is not an admin.
 */
export const adminMiddleware = new Elysia({ name: "admin-auth" })
  .use(authMiddleware)
  .derive({ as: "global" }, async ({ user, set }) => {
    if (!user || !user.isAdmin) {
      set.status = 403;
      throw new Error("Forbidden");
    }

    return { adminUser: user };
  });
