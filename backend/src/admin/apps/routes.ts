/**
 * @fileoverview Admin app releases management routes.
 * CRUD for app releases with file upload and set-latest functionality.
 */

import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";
import { config } from "../../config";
import { mkdir } from "fs/promises";
import { join } from "path";

/**
 * Admin app releases routes group.
 * Full CRUD for app releases including file upload and latest management.
 */
export const adminAppRoutes = new Elysia({ prefix: "/admin/apps" })
  .use(adminMiddleware)

  // ─── GET /admin/apps/releases ──────────────────────────
  .get("/releases", async ({ set }) => {
    try {
      const releases = await db.appRelease.findMany({
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
  })

  // ─── POST /admin/apps/releases ─────────────────────────
  .post(
    "/releases",
    async ({ body, set }) => {
      try {
        const { platform, version, changelog, file } = body;

        // Validate platform
        if (!["android", "windows"].includes(platform)) {
          set.status = 400;
          return { message: "Platform must be 'android' or 'windows'" };
        }

        // Ensure uploads directory exists
        const uploadsDir = join(config.APP_FILES_DIR, "releases");
        await mkdir(uploadsDir, { recursive: true });

        // Determine file extension
        const ext = platform === "android" ? ".apk" : ".exe";
        const fileName = `${platform}-${version}${ext}`;
        const filePath = join(uploadsDir, fileName);

        // Write file
        const buffer = await file.arrayBuffer();
        await Bun.write(filePath, buffer);

        // Calculate file size in MB
        const fileSizeMb = parseFloat(
          (buffer.byteLength / (1024 * 1024)).toFixed(2),
        );

        // Create download URL
        const downloadUrl = `/uploads/releases/${fileName}`;

        const release = await db.appRelease.create({
          data: {
            platform,
            version,
            changelog,
            downloadUrl,
            fileSizeMb,
          },
        });

        set.status = 201;
        return {
          id: release.id,
          platform: release.platform,
          version: release.version,
          changelog: release.changelog,
          downloadUrl: release.downloadUrl,
          fileSizeMb: release.fileSizeMb,
          downloadCount: release.downloadCount,
          isLatest: release.isLatest,
          createdAt: release.createdAt.toISOString(),
        };
      } catch (err) {
        console.error("[Admin Apps] Upload error:", err);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        platform: t.String(),
        version: t.String(),
        changelog: t.String(),
        file: t.File(),
      }),
    },
  )

  // ─── PATCH /admin/apps/releases/:id/set-latest ────────
  .patch(
    "/releases/:id/set-latest",
    async ({ params, set }) => {
      try {
        const release = await db.appRelease.findUnique({
          where: { id: params.id },
        });

        if (!release) {
          set.status = 404;
          return { message: "Release not found" };
        }

        // Reset isLatest for all releases of this platform, then set this one.
        // Use callback form so the VoidDB adapter can preserve sequencing.
        await db.$transaction(async (tx) => {
          await tx.appRelease.updateMany({
            where: { platform: release.platform },
            data: { isLatest: false },
          });
          await tx.appRelease.update({
            where: { id: params.id },
            data: { isLatest: true },
          });
        });

        const updated = await db.appRelease.findUnique({
          where: { id: params.id },
        });

        return {
          id: updated!.id,
          platform: updated!.platform,
          version: updated!.version,
          changelog: updated!.changelog,
          downloadUrl: updated!.downloadUrl,
          fileSizeMb: updated!.fileSizeMb,
          downloadCount: updated!.downloadCount,
          isLatest: updated!.isLatest,
          createdAt: updated!.createdAt.toISOString(),
        };
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )

  // ─── DELETE /admin/apps/releases/:id ───────────────────
  .delete(
    "/releases/:id",
    async ({ params, set }) => {
      try {
        await db.appRelease.delete({ where: { id: params.id } });
        set.status = 204;
        return;
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );
