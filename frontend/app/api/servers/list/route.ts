import { NextResponse } from "next/server";
import { API_CONFIG } from "@/api/config";

/**
 * GET /api/servers/list
 *
 * Public proxy endpoint. Fetches the list of online VPN servers from the
 * backend and returns it to the client (no auth required).
 *
 * The Android / desktop apps use this URL as one of their fallback sources
 * for syncing the VPN server list at startup. If the primary backend domain
 * is blocked in a region, the apps iterate their hardcoded fallback URL list
 * until one of them succeeds.
 *
 * Response format:
 * {
 *   servers: Array<{ id, ip, port, supportedProtocols, serverType, currentLoad }>,
 *   updatedAt: string (ISO-8601),
 *   source: "frontend-proxy"
 * }
 */
export async function GET() {
  try {
    const resp = await fetch(`${API_CONFIG.baseUrl}/servers/list`, {
      // 10-second timeout to avoid hanging the Next.js edge function
      signal: AbortSignal.timeout(10_000),
      cache: "no-store", // always return fresh data
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: "Backend unavailable", servers: [] },
        { status: resp.status },
      );
    }

    const data = await resp.json();

    return NextResponse.json(
      { ...data, source: "frontend-proxy" },
      {
        status: 200,
        headers: {
          // Allow Android / CORS-limited clients to use this endpoint
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch servers", servers: [] },
      { status: 503 },
    );
  }
}
