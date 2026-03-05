/**
 * @fileoverview Connected device list with long-polling for online status.
 *
 * - Initial load: GET /user/devices
 * - Long-poll: GET /user/devices/status every 10s to update online/speed state
 * - Block/unblock: PATCH /user/devices/:id/block
 *
 * @example
 * const { devices, isLoading, toggleBlock } = useDevices();
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type { Device, DeviceStatusItem, BlockDeviceRequest } from "@/api/types";

// ── Mock data ──────────────────────────────────────────────────

const MOCK_DEVICES: Device[] = [
  {
    id: "1",
    name: "PC-BOGDAN",
    os: "Windows",
    version: "11",
    lastIp: "192.168.0.24",
    isOnline: true,
    speedKbps: 14500,
    isBlocked: false,
    lastSeenAt: new Date().toISOString(),
  },
  {
    id: "2",
    name: "iPhone 15 Pro",
    os: "iOS",
    version: "17.4",
    lastIp: "10.0.0.12",
    isOnline: false,
    speedKbps: null,
    isBlocked: false,
    lastSeenAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "3",
    name: "Unknown Tablet",
    os: "Android",
    version: "13",
    lastIp: "144.20.12.1",
    isOnline: false,
    speedKbps: null,
    isBlocked: true,
    lastSeenAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

// ── Hook ───────────────────────────────────────────────────────

/**
 * Manages the list of devices connected to the user's VPN account.
 *
 * Automatically starts long-polling for device online status every 10 seconds
 * after the initial device list is loaded.
 */
export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Initial load ──────────────────────────────────────────────
  const fetchDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    if (API_CONFIG.debug) {
      await new Promise((r) => setTimeout(r, 800));
      setDevices(MOCK_DEVICES);
      setIsLoading(false);
      return;
    }
    try {
      const data = await apiClient.get<Device[]>("/user/devices");
      setDevices(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // ── Long-poll for online status ───────────────────────────────
  useEffect(() => {
    if (isLoading) return;

    const pollStatus = async () => {
      if (API_CONFIG.debug) {
        // Simulated random speed fluctuation in debug mode
        setDevices((prev) =>
          prev.map((d) =>
            d.isOnline
              ? { ...d, speedKbps: Math.floor(10000 + Math.random() * 10000) }
              : d,
          ),
        );
        return;
      }
      try {
        const statuses = await apiClient.get<DeviceStatusItem[]>(
          "/user/devices/status",
        );
        setDevices((prev) =>
          prev.map((d) => {
            const s = statuses.find((x) => x.id === d.id);
            return s
              ? { ...d, isOnline: s.isOnline, speedKbps: s.speedKbps }
              : d;
          }),
        );
      } catch {
        // Silently ignore polling errors
      }
    };

    const id = setInterval(pollStatus, API_CONFIG.devicePollInterval);
    return () => clearInterval(id);
  }, [isLoading]);

  // ── Block / unblock ────────────────────────────────────────────
  const toggleBlock = useCallback(
    async (id: string) => {
      const device = devices.find((d) => d.id === id);
      if (!device) return;

      const newBlocked = !device.isBlocked;

      // Optimistic update
      setDevices((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                isBlocked: newBlocked,
                isOnline: newBlocked ? false : d.isOnline,
                speedKbps: newBlocked ? null : d.speedKbps,
              }
            : d,
        ),
      );

      if (!API_CONFIG.debug) {
        try {
          await apiClient.patch(`/user/devices/${id}/block`, {
            isBlocked: newBlocked,
          } satisfies BlockDeviceRequest);
        } catch {
          // Rollback on error
          setDevices((prev) => prev.map((d) => (d.id === id ? device : d)));
        }
      }
    },
    [devices],
  );

  const onlineCount = devices.filter((d) => d.isOnline).length;

  return {
    devices,
    isLoading,
    error,
    onlineCount,
    toggleBlock,
    refetch: fetchDevices,
  };
}
