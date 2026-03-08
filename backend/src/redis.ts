/**
 * @fileoverview Redis client singleton using ioredis.
 * Used for OTP storage, token blocklist, and device online status.
 */

import Redis from "ioredis";
import { config } from "./config";

/** Global Redis client singleton */
export const redis = new Redis(config.REDIS_URL);
