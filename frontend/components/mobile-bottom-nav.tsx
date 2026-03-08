"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { CreditCard, Download, Gift, Home, Laptop } from "lucide-react";

const navItems = [
  {
    title: "Кабинет",
    url: "/me",
    icon: Home,
  },
  {
    title: "Финансы",
    url: "/me/billing",
    icon: CreditCard,
  },
  {
    title: "Промокоды",
    url: "/me/promo",
    icon: Gift,
  },
  {
    title: "Приложения",
    url: "/me/downloads",
    icon: Download,
  },
  {
    title: "Устройства",
    url: "/me/devices",
    icon: Laptop,
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-t border-border pb-safe">
      <nav className="flex items-center justify-around px-2 h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.url;
          return (
            <Link
              key={item.url}
              href={item.url}
              className="relative flex flex-col items-center justify-center w-full h-full gap-1"
            >
              <div className="relative z-10 flex flex-col items-center">
                <item.icon
                  className={`w-5 h-5 transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
                />
                <span
                  className={`text-[10px] font-medium mt-0.5 transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
                >
                  {item.title}
                </span>
              </div>

              {isActive && (
                <motion.div
                  layoutId="mobile-nav-indicator"
                  className="absolute inset-x-2 inset-y-1 bg-primary/10 rounded-xl -z-0"
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
