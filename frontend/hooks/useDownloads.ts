/**
 * @fileoverview App release download links for user-facing downloads page.
 *
 * GET /downloads/releases → latest release per platform (android, windows).
 *
 * @example
 * const { releases, isLoading } = useDownloads();
 */

"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type { AppRelease } from "@/api/types";

// ── Mock data ──────────────────────────────────────────────────

const MOCK_RELEASES: AppRelease[] = [
  {
    id: "rel-android-1",
    platform: "android",
    version: "1.4.2",
    changelog:
      "• Улучшен Kill Switch\n• Исправлены проблемы с подключением на Android 14\n• Ускорен старт соединения",
    downloadUrl: "https://cdn.lowkey.vpn/releases/android/lowkey-1.4.2.apk",
    fileSizeMb: 28.4,
    downloadCount: 1247,
    isLatest: true,
    createdAt: "2026-02-20T00:00:00Z",
  },
  {
    id: "rel-windows-1",
    platform: "windows",
    version: "1.3.8",
    changelog:
      "• Нативная интеграция с Windows 11\n• Автозапуск при включении ПК\n• Исправлены зависания при переключении серверов",
    downloadUrl:
      "https://cdn.lowkey.vpn/releases/windows/lowkey-setup-1.3.8.exe",
    fileSizeMb: 65.2,
    downloadCount: 894,
    isLatest: true,
    createdAt: "2026-02-18T00:00:00Z",
  },
];

// ── Hook ───────────────────────────────────────────────────────

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
          setReleases(MOCK_RELEASES);
          setIsLoading(false);
        }
      }, 400);
      return () => {
        mounted = false;
      };
    }
    apiClient
      .get<AppRelease[]>("/downloads/releases")
      .then((d) => {
        if (mounted) {
          setReleases(d.filter((r) => r.isLatest));
          setIsLoading(false);
        }
      })
      .catch((e) => {
        if (mounted) {
          setError((e as Error).message);
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const getByPlatform = (platform: "android" | "windows" | "ios") =>
    releases.find((r) => r.platform === platform) ?? null;

  return { releases, isLoading, error, getByPlatform };
}
