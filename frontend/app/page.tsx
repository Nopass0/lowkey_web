"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LandingHeader } from "@/components/landing-header";
import { LandingBanner } from "@/components/landing-banner";
import { LandingPricing } from "@/components/landing-pricing";
import { LandingFooter } from "@/components/landing-footer";
import { Loader } from "@/components/ui/loader";

export default function Page() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && isAuthenticated) {
      router.push("/me");
    }
  }, [mounted, isAuthenticated, router]);

  if (!mounted || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col flex-1">
      <LandingHeader />
      <main className="flex flex-col flex-1">
        <LandingBanner />
        <LandingPricing />
      </main>
      <LandingFooter />
    </div>
  );
}
