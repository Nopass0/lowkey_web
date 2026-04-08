/**
 * @fileoverview App version endpoint for Android auto-update.
 *
 * GET /api/app/version  — returns the latest APK version info.
 *
 * The APK file itself should be placed at the path defined by
 * APP_FILES_DIR/apk/lowkey-latest.apk (or set APP_APK_URL env var
 * to an absolute download URL).
 *
 * Version is controlled by the APP_VERSION / APP_VERSION_CODE env vars
 * so you don't need to redeploy the backend to bump the version —
 * just restart with the new values.
 */

import Elysia from "elysia";
import { config } from "../config";

/** Current Android APK version info. */
const APK_VERSION      = process.env.APP_VERSION       ?? "1.0.0";
const APK_VERSION_CODE = parseInt(process.env.APP_VERSION_CODE ?? "1", 10);
const APK_NOTES        = process.env.APP_RELEASE_NOTES ?? "Обновление безопасности и исправления ошибок.";
const APK_FORCE        = process.env.APP_FORCE_UPDATE  === "true";

/** Download URL — defaults to serving from the uploads directory. */
function getApkDownloadUrl(): string {
  if (process.env.APP_APK_URL) {
    return process.env.APP_APK_URL;
  }
  return `${config.SITE_URL}/uploads/apk/lowkey-latest.apk`;
}

export const appVersionRoutes = new Elysia({ prefix: "/api/app" })

  /**
   * Returns the latest Android APK version information.
   *
   * The Android client compares versionCode with its own PackageInfo.versionCode
   * and prompts for an update when the server value is higher.
   */
  .get("/version", () => ({
    latestVersion: APK_VERSION,
    versionCode:   APK_VERSION_CODE,
    downloadUrl:   getApkDownloadUrl(),
    releaseNotes:  APK_NOTES,
    forceUpdate:   APK_FORCE,
  }));
