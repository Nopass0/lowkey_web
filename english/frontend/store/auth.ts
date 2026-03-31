import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi } from "@/api/client";

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: string;
  isPremium: boolean;
  premiumUntil?: string;
  dailyGoal: number;
  studyStreak: number;
  lastStudyDate?: string;
  xp: number;
  level: string;
  notificationsEnabled: boolean;
  notificationTime: string;
  nativeLanguage: string;
  telegramId?: string;
  telegramUsername?: string;
  createdAt: string;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  hasHydrated: boolean;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  setHasHydrated: (value: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      hasHydrated: false,

      setUser: (user) => set({ user }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setToken: (token) => {
        set({ token });
        if (typeof window !== "undefined") localStorage.setItem("english_token", token);
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { token, user } = await authApi.login({ email, password });
          get().setToken(token);
          set({ user, isLoading: false });
        } catch (e) {
          set({ isLoading: false });
          throw e;
        }
      },

      register: async (email, password, name) => {
        set({ isLoading: true });
        try {
          const { token, user } = await authApi.register({ email, password, name });
          get().setToken(token);
          set({ user, isLoading: false });
        } catch (e) {
          set({ isLoading: false });
          throw e;
        }
      },

      logout: () => {
        set({ user: null, token: null });
        if (typeof window !== "undefined") {
          localStorage.removeItem("english_token");
          localStorage.removeItem("english-auth");
        }
      },

      fetchMe: async () => {
        try {
          const user = await authApi.me();
          set({ user });
        } catch (e: any) {
          // Only logout on 401 (invalid/expired token), not on network errors
          const status = e?.response?.status;
          if (status === 401 || status === 403) {
            get().logout();
          }
          // else: keep session alive (network/server error, try again later)
        }
      },

      updateUser: async (data) => {
        const updated = await authApi.update(data);
        set({ user: updated });
      },
    }),
    {
      name: "english-auth",
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (typeof window !== "undefined" && !state?.token) {
          const fallbackToken = localStorage.getItem("english_token");
          if (fallbackToken) {
            state?.setToken(fallbackToken);
          }
        }

        state?.setHasHydrated(true);
      },
    }
  )
);
