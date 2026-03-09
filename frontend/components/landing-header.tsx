"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Moon, Sun, VenetianMask } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanding } from "@/hooks/useLanding";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "./ui/button";
import { AuthForm } from "./auth-form";

function LandingHeaderContent() {
  const { isAuthModalOpen, setAuthModalOpen } = useLanding();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    if (!mounted || isAuthenticated) {
      return;
    }

    if (searchParams.get("ref") || searchParams.get("auth") === "register") {
      setAuthModalOpen(true);
    }
  }, [isAuthenticated, mounted, searchParams, setAuthModalOpen]);

  return (
    <>
      <header className="flex items-center justify-between p-4 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50 2xl:px-100 xl:px-20 lg:px-10 md:px-5 sm:px-2">
        <Link
          href="/"
          className="flex items-center gap-2 cursor-pointer transition-transform hover:scale-105"
        >
          <VenetianMask className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold tracking-tight">lowkey</span>
        </Link>
        <div className="flex items-center gap-2">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={toggleTheme}
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </Button>
          )}
          {mounted && isAuthenticated ? (
            <Button
              variant="default"
              className="cursor-pointer px-6 py-4"
              asChild
            >
              <Link href="/me">В кабинет</Link>
            </Button>
          ) : mounted ? (
            <Button
              variant="default"
              className="cursor-pointer px-6 py-4"
              onClick={() => setAuthModalOpen(true)}
            >
              Войти
            </Button>
          ) : (
            <div className="w-[100px] h-14" />
          )}
        </div>
      </header>
      <AuthForm
        isOpen={isAuthModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
}

export function LandingHeader() {
  return (
    <Suspense fallback={null}>
      <LandingHeaderContent />
    </Suspense>
  );
}
