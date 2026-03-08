/**
 * @fileoverview Prisma client singleton.
 * Import `db` from this module in all database-accessing code.
 */

import { PrismaClient } from "@prisma/client";

/** Global Prisma client singleton */
export const db = new PrismaClient();
