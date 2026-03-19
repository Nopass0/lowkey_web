"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart2,
  Brain,
  CreditCard,
  Download,
  Gift,
  Home,
  Laptop,
  Package,
  Receipt,
  Send,
  Server,
  Shield,
  Tag,
  Users,
  VenetianMask,
} from "lucide-react";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useUser } from "@/hooks/useUser";

const userNav = [
  { title: "AI workspace", url: "/ai", icon: Brain },
  { title: "Кабинет", url: "/me", icon: Home },
  { title: "Финансы и тарифы", url: "/me/billing", icon: CreditCard },
  { title: "Промокоды", url: "/me/promo", icon: Gift },
  { title: "Рефералы", url: "/me/referral", icon: Users },
  { title: "Приложения", url: "/me/downloads", icon: Download },
  { title: "Устройства", url: "/me/devices", icon: Laptop },
];

const adminNav = [
  { title: "AI", url: "/me/admin/ai", icon: Brain },
  { title: "Аналитика", url: "/me/admin/finance", icon: BarChart2 },
  { title: "Пользователи", url: "/me/admin/users", icon: Users },
  { title: "Тарифы", url: "/me/admin/tariffs", icon: CreditCard },
  { title: "Заявки вывода", url: "/me/admin/withdrawals", icon: Receipt },
  { title: "Промокоды", url: "/me/admin/promo", icon: Tag },
  { title: "Приложения", url: "/me/admin/apps", icon: Package },
  { title: "Сервер", url: "/me/admin/server", icon: Server },
];

adminNav.splice(adminNav.length - 1, 0, {
  title: "Рассылки",
  url: "/me/admin/mailings",
  icon: Send,
});

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();
  const { profile } = useUser();
  const hideAi = profile?.hideAiMenu || profile?.hideAiMenuForAll;
  const visibleUserNav = hideAi
    ? userNav.filter((item) => item.url !== "/ai")
    : userNav;

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-border/50 bg-background/50 backdrop-blur-xl"
      {...props}
    >
      <SidebarHeader className="pt-6 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="cursor-pointer hover:bg-transparent"
            >
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/20 shrink-0">
                  <VenetianMask className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-[15px] font-bold tracking-tight text-foreground">
                    lowkey
                  </span>
                  <span className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Workspace
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="mt-4">
        <NavMain items={visibleUserNav} />

        {user?.isAdmin && (
          <>
            <div className="px-3 pt-4 pb-1 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-500">
                <Shield className="h-3 w-3" />
                Администратор
              </div>
            </div>
            <NavMain items={adminNav} />
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="pb-6">
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
