/**
 * API configuration for the lowkey frontend.
 * Set NEXT_PUBLIC_API_URL in .env.local to override the base URL.
 * Set NEXT_PUBLIC_DEBUG=true to use mock data instead of real API calls.
 *
 * @example
 * // .env.local
 * NEXT_PUBLIC_API_URL=http://localhost:3001
 * NEXT_PUBLIC_DEBUG=false
 */
export const API_CONFIG = {
  /** Base URL for all API requests */
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",

  /** When true, hooks return mock data instead of making real API calls */
  debug: false,

  /** Milliseconds between payment status long-poll requests */
  paymentPollInterval: 3_000,

  /** Milliseconds between device online-status long-poll requests */
  devicePollInterval: 10_000,

  /** Request timeout in milliseconds */
  requestTimeout: 15_000,
} as const;
