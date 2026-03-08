import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LandingState {
  isAuthModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  selectedPlan: string | null;
  selectedPeriod: string | null;
  setPlan: (plan: string, period: string) => void;
  clearPlan: () => void;
}

export const useLanding = create<LandingState>()(
  persist(
    (set) => ({
      isAuthModalOpen: false,
      setAuthModalOpen: (open) => set({ isAuthModalOpen: open }),
      selectedPlan: null,
      selectedPeriod: null,
      setPlan: (plan, period) =>
        set({ selectedPlan: plan, selectedPeriod: period }),
      clearPlan: () => set({ selectedPlan: null, selectedPeriod: null }),
    }),
    {
      name: "lowkey-landing-storage",
    },
  ),
);
