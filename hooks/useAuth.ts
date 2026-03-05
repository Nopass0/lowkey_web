/**
 * @fileoverview Authentication state store (Zustand + localStorage persist).
 *
 * Handles:
 * - Regular user login / registration
 * - Admin OTP flow (code sent to Telegram)
 * - Token storage and automatic injection via apiClient
 * - Logout with server notification
 *
 * @example
 * const { login, logout, user, isAuthenticated } = useAuth();
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiClient } from "@/api/client";
import { API_CONFIG } from "@/api/config";
import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
  AdminVerifyRequest,
} from "@/api/types";

/** Admin login constant — when the user types this login, show OTP flow */
export const ADMIN_LOGIN = "nopass";

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  /** JWT token stored for apiClient */
  token: string | null;

  /**
   * Log in a regular user with login + password.
   * If a user is registered with Telegram, it returns "requireOtp".
   * Otherwise it returns "success" and stores token.
   */
  login: (login: string, password: string) => Promise<"success" | "requireOtp">;

  /** Step 2 of regular user auth: verify OTP if Telegram is linked */
  verifyOtp: (login: string, code: string) => Promise<void>;

  /**
   * Register a new user.
   * @param referralCode - optional referral code from another user
   */
  register: (
    login: string,
    password: string,
    referralCode?: string,
  ) => Promise<void>;

  /**
   * Step 1 of admin auth: request a one-time code sent to Telegram.
   */
  requestAdminCode: (login: string) => Promise<void>;

  /**
   * Step 2 of admin auth: verify the OTP.
   * On success, stores token with isAdmin=true.
   */
  verifyAdminCode: (login: string, code: string) => Promise<void>;

  /**
   * Log out. Calls server to invalidate token, then clears local state.
   */
  logout: () => Promise<void>;
}

// ── Mock helpers ───────────────────────────────────────────────

function mockHash(login: string): string {
  let h = 0;
  for (let i = 0; i < login.length; i++)
    h = login.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h).toString(16).substring(0, 6) + "ff";
}

function mockAuthResponse(login: string, isAdmin = false) {
  return {
    token: `mock_token_${login}`,
    user: { id: "u1", login, avatarHash: mockHash(login), isAdmin },
  };
}

// ── Store ──────────────────────────────────────────────────────

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      token: null,

      login: async (login, password) => {
        if (API_CONFIG.debug) {
          const { user, token } = mockAuthResponse(login);
          set({ isAuthenticated: true, user, token });
          return "success";
        }
        const res = await apiClient.post<AuthResponse>("/auth/login", {
          login,
          password,
        } satisfies LoginRequest);
        if ("requireOtp" in res && res.requireOtp) {
          return "requireOtp";
        } else if ("token" in res) {
          set({ isAuthenticated: true, user: res.user, token: res.token });
          return "success";
        }
        throw new Error("Invalid response from server");
      },

      verifyOtp: async (login, code) => {
        if (API_CONFIG.debug) return;
        const res = await apiClient.post<AuthResponse>("/auth/login-otp", {
          login,
          code,
        });
        if ("requireOtp" in res) throw new Error("Unexpected response");
        set({ isAuthenticated: true, user: res.user, token: res.token });
      },

      register: async (login, password, referralCode) => {
        if (API_CONFIG.debug) {
          const { user, token } = mockAuthResponse(login);
          set({ isAuthenticated: true, user, token });
          return;
        }
        const payload: RegisterRequest = { login, password };
        if (referralCode) payload.referralCode = referralCode;
        const { user, token } = await apiClient.post<AuthResponse>(
          "/auth/register",
          payload,
        );
        set({ isAuthenticated: true, user, token });
      },

      requestAdminCode: async (login) => {
        if (API_CONFIG.debug) return; // debug: skip, code auto-accepted in verifyAdminCode
        await apiClient.post("/auth/admin/request-code", { login });
      },

      verifyAdminCode: async (login, code) => {
        if (API_CONFIG.debug) {
          const { user, token } = mockAuthResponse(login, true);
          set({ isAuthenticated: true, user, token });
          return;
        }
        const { user, token } = await apiClient.post<AuthResponse>(
          "/auth/admin/verify-code",
          { login, code } satisfies AdminVerifyRequest,
        );
        set({ isAuthenticated: true, user, token });
      },

      logout: async () => {
        if (!API_CONFIG.debug) {
          try {
            await apiClient.post("/auth/logout");
          } catch {}
        }
        set({ isAuthenticated: false, user: null, token: null });
      },
    }),
    { name: "lowkey-auth" },
  ),
);
