/**
 * @fileoverview JWT utility functions using the `jose` library.
 * Provides sign and verify helpers for user authentication tokens.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { config } from "../config";

/** Shape of our JWT payload stored in the token */
export interface JwtTokenPayload {
  /** User ID (UUID) */
  userId: string;
  /** Whether this user is an admin */
  isAdmin: boolean;
  /** JWT ID for token blocklisting */
  jti: string;
}

/** Secret key encoded for jose */
const secret = new TextEncoder().encode(config.JWT_SECRET);

/**
 * Parses a duration string like "30d" or "8h" into seconds.
 *
 * @param duration - Duration string (e.g. "30d", "8h", "1m")
 * @returns Number of seconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 30 * 24 * 60 * 60; // default 30 days
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 60 * 60;
    case "d":
      return value * 24 * 60 * 60;
    default:
      return 30 * 24 * 60 * 60;
  }
}

/**
 * Signs a JWT token with the given payload and expiry.
 *
 * @param payload - Data to encode in the token (userId, isAdmin)
 * @param expiry - Token expiry duration string (e.g. "30d", "8h")
 * @returns Signed JWT string
 */
export async function signJwt(
  payload: { userId: string; isAdmin: boolean },
  expiry: string = config.JWT_EXPIRY,
): Promise<string> {
  const jti = crypto.randomUUID();
  const seconds = parseDuration(expiry);

  return new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + seconds)
    .sign(secret);
}

/**
 * Verifies a JWT token and returns the decoded payload.
 * Returns null if the token is invalid or expired.
 *
 * @param token - JWT string to verify
 * @returns Decoded payload or null
 */
export async function verifyJwt(
  token: string,
): Promise<JwtTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId as string,
      isAdmin: payload.isAdmin as boolean,
      jti: payload.jti as string,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts the expiration timestamp from a JWT payload.
 *
 * @param token - JWT string
 * @returns Expiration time in seconds since epoch, or 0
 */
export async function getTokenExp(token: string): Promise<number> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload.exp as number) ?? 0;
  } catch {
    return 0;
  }
}
