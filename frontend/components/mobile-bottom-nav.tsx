"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  Brain,
  CreditCard,
  Download,
  Gift,
  Home,
  Laptop,
} from "lucide-react";
import { useUser } from "@/hooks/useUser";

const navItems = [
  { title: "AI", url: "/ai", icon: Brain },
  { title: "Кабинет", url: "/me", icon: Home },
  { title: "Финансы", url: "/me/billing", icon: CreditCard },
  { title: "Промо", url: "/me/promo", icon: Gift },
  { title: "Файлы", url: "/me/downloads", icon: Download },
  { title: "VPN", url: "/me/devices", icon: Laptop },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { profile } = useUser();
  const hideAi = profile?.hideAiMenu || profile?.hideAiMenuForAll;
  const visibleNavItems = hideAi
    ? navItems.filter((item) => item.url !== "/ai")
    : navItems;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/90 backdrop-blur-md pb-safe md:hidden">
      <nav className="flex h-16 items-center justify-around px-2">
        {visibleNavItems.map((item) => {
          const isActive =
            pathname === item.url ||
            (item.url === "/ai" && pathname.startsWith("/ai"));

          return (
            <Link
              key={item.url}
              href={item.url}
              className="relative flex h-full w-full flex-col items-center justify-center gap-1"
            >
              <div className="relative z-10 flex flex-col items-center">
                <item.icon
                  className={`h-5 w-5 transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <span
                  className={`mt-0.5 text-[10px] font-medium transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.title}
                </span>
              </div>

              {isActive && (
                <motion.div
                  layoutId="mobile-nav-indicator"
                  className="absolute inset-y-1 inset-x-2 -z-0 rounded-xl bg-primary/10"
                  initial={false}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
