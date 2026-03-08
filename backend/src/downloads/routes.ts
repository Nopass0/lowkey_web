/**
 * @fileoverview Downloads routes: public app releases endpoint.
 * No authentication required.
 */

import Elysia from "elysia";
import { db } from "../db";

/**
 * Downloads routes group.
 * Provides a public endpoint for fetching latest app releases.
 */
export const downloadRoutes = new Elysia({ prefix: "/downloads" })
  // ─── GET /downloads/releases ───────────────────────────
  .get("/releases", async ({ set }) => {
    try {
      const releases = await db.appRelease.findMany({
        where: { isLatest: true },
        orderBy: { createdAt: "desc" },
      });

      return releases.map((r) => ({
        id: r.id,
        platform: r.platform,
        version: r.version,
        changelog: r.changelog,
        downloadUrl: r.downloadUrl,
        fileSizeMb: r.fileSizeMb,
        downloadCount: r.downloadCount,
        isLatest: r.isLatest,
        createdAt: r.createdAt.toISOString(),
      }));
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  });
