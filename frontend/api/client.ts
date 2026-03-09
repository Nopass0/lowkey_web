/**
 * @fileoverview Typed API client for the lowkey frontend.
 *
 * Wraps the native fetch API with:
 * - Automatic Bearer token injection from Zustand auth store
 * - 401 interception → logout + redirect
 * - Request timeout via AbortController
 * - Typed response parsing and unified error throwing
 *
 * @example
 * import { apiClient } from "@/api/client";
 *
 * const profile = await apiClient.get<UserProfile>("/user/profile");
 * const result  = await apiClient.post<AuthResponse>("/auth/login", { login, password });
 */

import { API_CONFIG } from "@/api/config";
import type { ApiError } from "@/api/types";

// ─── Error class ──────────────────────────────────────────────

/** Thrown by apiClient when the server returns a non-2xx response */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

// ─── Token getter ─────────────────────────────────────────────

/**
 * Lazily imports the auth store to avoid circular dependencies.
 * Returns the current JWT token or null if not authenticated.
 */
function getToken(): string | null {
  try {
    // Read directly from localStorage to avoid circular import
    const raw = localStorage.getItem("lowkey-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed?.state?.token as string) ?? null;
  } catch {
    return null;
  }
}

/** Triggers logout and redirects to home. Called on 401 responses. */
function handleUnauthorized() {
  try {
    localStorage.removeItem("lowkey-auth");
  } catch {}
  if (typeof window !== "undefined") {
    window.location.href = "/";
  }
}

// ─── Core fetch wrapper ───────────────────────────────────────

interface RequestOptions {
  /** Additional headers to merge */
  headers?: Record<string, string>;
  /** AbortSignal for external cancellation */
  signal?: AbortSignal;
}

/**
 * Core fetch wrapper. Handles auth header, timeout, and error normalization.
 * Do not use this directly — use the typed methods below.
 */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
  isFormData = false,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    API_CONFIG.requestTimeout,
  );

  const token = getToken();
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...options.headers,
  };

  try {
    const res = await fetch(`${API_CONFIG.baseUrl}${path}`, {
      method,
      headers,
      body: isFormData
        ? (body as FormData)
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
      signal: options.signal ?? controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.status === 401) {
      handleUnauthorized();
      throw new ApiClientError(401, "Unauthorized");
    }

    if (!res.ok) {
      let errData: Partial<ApiError> = {};
      try {
        errData = await res.json();
      } catch {}
      throw new ApiClientError(
        res.status,
        errData.message ?? `HTTP ${res.status}`,
        errData.code,
      );
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    return (await res.json()) as T;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof ApiClientError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new ApiClientError(0, "Request timed out");
    }
    throw new ApiClientError(0, (err as Error).message ?? "Network error");
  }
}

// ─── Public API ───────────────────────────────────────────────

export const apiClient = {
  /**
   * HTTP GET
   * @param path - API path relative to baseUrl, e.g. "/user/profile"
   * @param query - Optional query-string params object
   */
  get<T>(
    path: string,
    query?: Record<string, string | number>,
    options?: RequestOptions,
  ): Promise<T> {
    const url = query
      ? `${path}?${new URLSearchParams(
          Object.entries(query).map(([k, v]) => [k, String(v)]),
        ).toString()}`
      : path;
    return request<T>("GET", url, undefined, options);
  },

  /**
   * HTTP POST with JSON body
   * @param path - API path relative to baseUrl
   * @param body - Request payload (will be JSON-serialized)
   */
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>("POST", path, body, options);
  },

  /**
   * HTTP PATCH with JSON body
   * @param path - API path relative to baseUrl
   * @param body - Partial update payload
   */
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>("PATCH", path, body, options);
  },

  /**
   * HTTP PUT with JSON body
   * @param path - API path relative to baseUrl
   * @param body - Full replacement payload
   */
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>("PUT", path, body, options);
  },

  /**
   * HTTP DELETE
   * @param path - API path relative to baseUrl, typically includes :id
   */
  delete<T = void>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>("DELETE", path, undefined, options);
  },

  /**
   * Multipart form-data upload (for file uploads)
   * @param path - API path relative to baseUrl
   * @param formData - FormData instance with file and fields
   */
  upload<T>(
    path: string,
    formData: FormData,
    options?: RequestOptions,
  ): Promise<T> {
    return request<T>("POST", path, formData, options, true);
  },

  /**
   * Open a streaming SSE connection to POST /user/ai/chat/stream.
   * Returns a simple event emitter you can listen on.
   *
   * @example
   * const stream = apiClient.streamChat({ message: "Hello" });
   * stream.on("delta", (d) => console.log(d.text));
   * stream.on("done", (d) => console.log(d));
   */
  streamChat(params: {
    message: string;
    conversationId?: string;
    model?: string;
    attachmentIds?: string[];
  }): StreamHandle {
    const listeners: Record<string, Array<(data: unknown) => void>> = {};

    const handle: StreamHandle = {
      on(event, cb) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb as (data: unknown) => void);
        return handle;
      },
      close() {
        handle._aborted = true;
      },
      _aborted: false,
    };

    (async () => {
      const token = getToken();
      let res: Response;
      try {
        res = await fetch(`${API_CONFIG.baseUrl}/user/ai/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(params),
        });
      } catch (err) {
        listeners["error"]?.forEach((cb) =>
          cb({ message: (err as Error).message }),
        );
        return;
      }

      if (res.status === 401) {
        handleUnauthorized();
        listeners["error"]?.forEach((cb) => cb({ message: "Unauthorized" }));
        return;
      }

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          msg = (j as { message?: string }).message ?? msg;
        } catch {}
        listeners["error"]?.forEach((cb) => cb({ message: msg }));
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (!handle._aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as unknown;
              if (currentEvent) {
                listeners[currentEvent]?.forEach((cb) => cb(data));
              }
            } catch {}
            currentEvent = "";
          }
        }
      }
    })();

    return handle;
  },
} as const;

/** Opaque handle returned by streamChat */
export interface StreamHandle {
  on(event: string, cb: (data: unknown) => void): StreamHandle;
  close(): void;
  _aborted: boolean;
}
