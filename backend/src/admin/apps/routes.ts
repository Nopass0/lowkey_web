/**
 * @fileoverview Admin app releases management routes.
 * CRUD for app releases with file upload (MSI/APK), SHA-256 verification,
 * and set-latest functionality.
 */

import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";
import { config } from "../../config";
import { mkdir } from "fs/promises";
import { extname, join } from "path";
import { createHash } from "crypto";

/**
 * Compute SHA-256 hex digest of a Buffer / ArrayBuffer.
 */
function sha256hex(data: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(data)).digest("hex");
}

function sanitizeVersion(version: string): string {
  return version.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
}

/**
 * Admin app releases routes group.
 * Full CRUD for app releases including MSI/APK upload, SHA-256 tracking,
 * and latest release management.
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
        sha256: r.sha256 ?? "",
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
        if (!(file instanceof File)) {
          set.status = 400;
          return { message: "File is required" };
        }
        const normalizedVersion = sanitizeVersion(version);
        if (!normalizedVersion) {
          set.status = 400;
          return { message: "Version is required" };
        }
        const maxMb = Number(process.env.APP_RELEASE_MAX_MB ?? "2048");
        const maxBytes = Number.isFinite(maxMb) && maxMb > 0 ? maxMb * 1024 * 1024 : 2048 * 1024 * 1024;
        if (file.size > maxBytes) {
          set.status = 413;
          return { message: `File is too large (max ${Math.floor(maxBytes / (1024 * 1024))} MB)` };
        }

        // Ensure uploads directory exists
        const uploadsDir = join(config.APP_FILES_DIR, "releases");
        await mkdir(uploadsDir, { recursive: true });

        // Determine safe file extension and normalize common Windows formats.
        const incomingExt = extname(file.name ?? "").toLowerCase();
        const allowedWindows = new Set([".msi", ".exe"]);
        const ext =
          platform === "android"
            ? ".apk"
            : allowedWindows.has(incomingExt)
              ? incomingExt
              : ".msi";
        const fileName = `${platform}-${normalizedVersion}${ext}`;
        const filePath = join(uploadsDir, fileName);

        // Read file bytes
        const buffer = await file.arrayBuffer();

        // Write file
        await Bun.write(filePath, buffer);

        // Calculate file size in MB
        const fileSizeMb = parseFloat(
          (buffer.byteLength / (1024 * 1024)).toFixed(2),
        );

        // Compute SHA-256 for integrity verification by the client updater
        const sha256 = sha256hex(buffer);

        // Create download URL
        const downloadUrl = `/uploads/releases/${fileName}`;

        const release = await db.appRelease.create({
          data: {
            platform,
            version: normalizedVersion,
            changelog,
            downloadUrl,
            fileSizeMb,
            sha256,
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
          sha256: release.sha256 ?? sha256,
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
          sha256: updated!.sha256 ?? "",
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
