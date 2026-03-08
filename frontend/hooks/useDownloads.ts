/**
 * @fileoverview App release download links for user-facing downloads page.
 *
 * GET /downloads/releases -> latest release per platform.
 *
 * @example
 * const { releases, isLoading } = useDownloads();
 */

"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type { AppRelease } from "@/api/types";

const HTTP_URL_RE = /^https?:\/\//i;

const MOCK_RELEASES: AppRelease[] = [
  {
    id: "rel-android-1",
    platform: "android",
    version: "store",
    changelog:
      "Official Google Play install link for the Android client.",
    downloadUrl:
      "https://play.google.com/store/apps/details?id=com.v2raytun.android",
    fileSizeMb: 0,
    downloadCount: 1247,
    isLatest: true,
    createdAt: "2026-02-20T00:00:00Z",
  },
  {
    id: "rel-ios-1",
    platform: "ios",
    version: "store",
    changelog: "Official App Store install link for the iOS client.",
    downloadUrl: "https://apps.apple.com/us/app/v2raytun/id6476628951",
    fileSizeMb: 0,
    downloadCount: 938,
    isLatest: true,
    createdAt: "2026-02-20T00:00:00Z",
  },
  {
    id: "rel-windows-1",
    platform: "windows",
    version: "1.0.13",
    changelog: "Official Throne installer for Windows.",
    downloadUrl:
      "https://github.com/throneproj/Throne/releases/download/1.0.13/Throne-1.0.13-windows64-installer.exe",
    fileSizeMb: 0,
    downloadCount: 894,
    isLatest: true,
    createdAt: "2026-02-18T00:00:00Z",
  },
];

function hasPublicDownloadUrl(release: AppRelease) {
  return HTTP_URL_RE.test(release.downloadUrl.trim());
}

/**
 * Fetches the latest app release for each supported platform.
 * Used on the `/me/downloads` page.
 */
export function useDownloads() {
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (API_CONFIG.debug) {
      setTimeout(() => {
        if (mounted) {
          setReleases(MOCK_RELEASES.filter(hasPublicDownloadUrl));
          setIsLoading(false);
        }
      }, 400);

      return () => {
        mounted = false;
      };
    }

    apiClient
      .get<AppRelease[]>("/downloads/releases")
      .then((data) => {
        if (mounted) {
          setReleases(
            data.filter((release) => release.isLatest && hasPublicDownloadUrl(release)),
          );
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError((err as Error).message);
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const getByPlatform = (platform: "android" | "ios" | "windows") =>
    releases.find((release) => release.platform === platform) ?? null;

  return { releases, isLoading, error, getByPlatform };
}
