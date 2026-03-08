/**
 * @fileoverview Admin hook for app release management (Android + Windows).
 *
 * Admin-only.
 *
 * Endpoints:
 * - GET    /admin/apps/releases              → list all releases (paginated)
 * - POST   /admin/apps/releases              → upload new release (multipart)
 * - PATCH  /admin/apps/releases/:id/set-latest → mark as latest for platform
 * - DELETE /admin/apps/releases/:id          → delete release
 *
 * @example
 * const { releases, uploadRelease, setLatest, deleteRelease } = useAdminApps();
 */

"use client";

import { useState, useCallback } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type { AdminAppRelease } from "@/api/types";

// ── Mock data ──────────────────────────────────────────────────

const MOCK_RELEASES: AdminAppRelease[] = [
  {
    id: "aa1",
    platform: "android",
    version: "1.4.2",
    changelog: "• Улучшен Kill Switch\n• Исправлены проблемы на Android 14",
    downloadUrl: "#",
    fileSizeMb: 28.4,
    downloadCount: 1247,
    isLatest: true,
    createdAt: "2026-02-20T00:00:00Z",
  },
  {
    id: "aa2",
    platform: "android",
    version: "1.4.1",
    changelog: "• Исправлен баг с переподключением",
    downloadUrl: "#",
    fileSizeMb: 28.1,
    downloadCount: 890,
    isLatest: false,
    createdAt: "2026-02-10T00:00:00Z",
  },
  {
    id: "aa3",
    platform: "android",
    version: "1.4.0",
    changelog: "• Начальная поддержка Android 14",
    downloadUrl: "#",
    fileSizeMb: 27.5,
    downloadCount: 2100,
    isLatest: false,
    createdAt: "2026-01-20T00:00:00Z",
  },
  {
    id: "aw1",
    platform: "windows",
    version: "1.3.8",
    changelog:
      "• Нативная интеграция с Windows 11\n• Автозапуск при включении ПК",
    downloadUrl: "#",
    fileSizeMb: 65.2,
    downloadCount: 894,
    isLatest: true,
    createdAt: "2026-02-18T00:00:00Z",
  },
  {
    id: "aw2",
    platform: "windows",
    version: "1.3.7",
    changelog: "• Исправлены зависания при переключении серверов",
    downloadUrl: "#",
    fileSizeMb: 64.8,
    downloadCount: 650,
    isLatest: false,
    createdAt: "2026-02-05T00:00:00Z",
  },
];

// ── Hook ───────────────────────────────────────────────────────

/**
 * App release management hook for the admin panel.
 * Supports listing, uploading, marking latest, and deleting releases.
 */
export function useAdminApps() {
  const [releases, setReleases] = useState<AdminAppRelease[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  /** Fetch all releases (both platforms) */
  const fetchReleases = useCallback(async () => {
    setIsLoading(true);
    if (API_CONFIG.debug) {
      await new Promise((r) => setTimeout(r, 500));
      setReleases(MOCK_RELEASES);
      setIsLoading(false);
      return;
    }
    try {
      const data = await apiClient.get<AdminAppRelease[]>(
        "/admin/apps/releases",
      );
      setReleases(data);
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Upload a new app release (multipart/form-data).
   * @param platform - "android" | "windows"
   * @param version - semantic version string, e.g. "1.4.3"
   * @param changelog - release notes text
   * @param file - the APK or EXE file
   */
  const uploadRelease = useCallback(
    async (
      platform: "android" | "windows",
      version: string,
      changelog: string,
      file: File,
    ): Promise<AdminAppRelease | null> => {
      setUploadProgress(0);

      if (API_CONFIG.debug) {
        // Simulate upload progress
        for (let i = 10; i <= 100; i += 10) {
          await new Promise((r) => setTimeout(r, 150));
          setUploadProgress(i);
        }
        const newRel: AdminAppRelease = {
          id: "a" + Date.now(),
          platform,
          version,
          changelog,
          downloadUrl: "#",
          fileSizeMb: Math.round((file.size / 1024 / 1024) * 10) / 10,
          downloadCount: 0,
          isLatest: false,
          createdAt: new Date().toISOString(),
        };
        setReleases((prev) => [newRel, ...prev]);
        setUploadProgress(null);
        return newRel;
      }

      try {
        const fd = new FormData();
        fd.append("platform", platform);
        fd.append("version", version);
        fd.append("changelog", changelog);
        fd.append("file", file);
        const rel = await apiClient.upload<AdminAppRelease>(
          "/admin/apps/releases",
          fd,
        );
        setReleases((prev) => [rel, ...prev]);
        setUploadProgress(null);
        return rel;
      } catch {
        setUploadProgress(null);
        return null;
      }
    },
    [],
  );

  /**
   * Mark a release as the latest for its platform.
   * Automatically demotes previous latest for the same platform.
   * @param id - release ID
   */
  const setLatest = useCallback(
    async (id: string) => {
      const release = releases.find((r) => r.id === id);
      if (!release) return;
      // Optimistic update: demote old latest, promote this one
      setReleases((prev) =>
        prev.map((r) =>
          r.platform === release.platform ? { ...r, isLatest: r.id === id } : r,
        ),
      );
      if (!API_CONFIG.debug) {
        try {
          await apiClient.patch(`/admin/apps/releases/${id}/set-latest`);
        } catch {
          // Rollback
          setReleases((prev) =>
            prev.map((r) =>
              r.platform === release.platform
                ? { ...r, isLatest: r.id !== id }
                : r,
            ),
          );
        }
      }
    },
    [releases],
  );

  /**
   * Delete a release. Optimistically removes from list.
   * @param id - release ID
   */
  const deleteRelease = useCallback(
    async (id: string) => {
      const prev = releases.find((r) => r.id === id);
      setReleases((p) => p.filter((r) => r.id !== id));
      if (!API_CONFIG.debug) {
        try {
          await apiClient.delete(`/admin/apps/releases/${id}`);
        } catch {
          if (prev) setReleases((p) => [prev, ...p]);
        }
      }
    },
    [releases],
  );

  const getByPlatform = (platform: "android" | "windows") =>
    releases.filter((r) => r.platform === platform);

  return {
    releases,
    isLoading,
    uploadProgress,
    fetchReleases,
    uploadRelease,
    setLatest,
    deleteRelease,
    getByPlatform,
  };
}
