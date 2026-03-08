/**
 * @fileoverview Admin server status and incidents hook.
 *
 * Admin-only.
 *
 * Endpoints:
 * - GET /admin/server/status    → live server stats
 * - GET /admin/server/incidents → recent incidents
 *
 * @example
 * const { status, incidents, refresh } = useAdminServer();
 */

"use client";

import { useState, useCallback } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type { ServerStatus, ServerIncident } from "@/api/types";

// ── Mock data ──────────────────────────────────────────────────

const MOCK_STATUS: ServerStatus = {
  status: "online",
  uptimePct: 99.98,
  activeConnections: 1247,
  bandwidthGbps: 3.4,
  latencyMs: 12,
  uptimeSince: "2025-09-01T00:00:00Z",
};

const MOCK_INCIDENTS: ServerIncident[] = [
  {
    id: "i1",
    severity: "low",
    description: "Незначительные задержки маршрутизации (< 5 мин)",
    occurredAt: "2026-02-28T14:22:00Z",
    resolvedAt: "2026-02-28T14:27:00Z",
  },
  {
    id: "i2",
    severity: "medium",
    description: "Кратковременная перегрузка узла DE-1",
    occurredAt: "2026-02-15T03:11:00Z",
    resolvedAt: "2026-02-15T03:38:00Z",
  },
  {
    id: "i3",
    severity: "high",
    description: "Плановое обслуживание — 20 мин даунтайм",
    occurredAt: "2026-01-30T19:45:00Z",
    resolvedAt: "2026-01-30T20:05:00Z",
  },
  {
    id: "i4",
    severity: "low",
    description: "Автообновление сертификатов SSL",
    occurredAt: "2026-01-12T08:01:00Z",
    resolvedAt: "2026-01-12T08:02:00Z",
  },
  {
    id: "i5",
    severity: "low",
    description: "Плановое резервное копирование",
    occurredAt: "2025-12-25T00:00:00Z",
    resolvedAt: "2025-12-25T00:15:00Z",
  },
];

// ── Hook ───────────────────────────────────────────────────────

/**
 * Server status and incident log for the admin dashboard.
 */
export function useAdminServer() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [incidents, setIncidents] = useState<ServerIncident[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Fetch current server status and latest incidents.
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    if (API_CONFIG.debug) {
      await new Promise((r) => setTimeout(r, 600));
      setStatus(MOCK_STATUS);
      setIncidents(MOCK_INCIDENTS);
      setIsLoading(false);
      return;
    }
    try {
      const [s, inc] = await Promise.all([
        apiClient.get<ServerStatus>("/admin/server/status"),
        apiClient.get<ServerIncident[]>("/admin/server/incidents"),
      ]);
      setStatus(s);
      setIncidents(inc);
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { status, incidents, isLoading, refresh };
}
