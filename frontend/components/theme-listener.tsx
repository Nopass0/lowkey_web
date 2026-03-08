"use client";

import { useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";

export function ThemeListener() {
  const { theme } = useTheme();

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // Set the theme class to HTML node immediately on mount to prevent SSR flash (handled as best effort for static SSR without hydration)
  // But wait, since it's next.js, the simplest is the above effect.

  return null;
}
