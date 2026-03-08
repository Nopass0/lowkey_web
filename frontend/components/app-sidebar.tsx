"use client";
import * as React from "react";
import {
  CreditCard,
  Download,
  Gift,
  Home,
  Laptop,
  VenetianMask,
  Users,
  Shield,
  Receipt,
  Server,
  Tag,
  BarChart2,
  Package,
} from "lucide-react";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

const userNav = [
  { title: "Кабинет", url: "/me", icon: Home },
  { title: "Финансы и тарифы", url: "/me/billing", icon: CreditCard },
  { title: "Промокоды", url: "/me/promo", icon: Gift },
  { title: "Рефералы", url: "/me/referral", icon: Users },
  { title: "Приложения", url: "/me/downloads", icon: Download },
  { title: "Устройства", url: "/me/devices", icon: Laptop },
];

const adminNav = [
  { title: "Аналитика", url: "/me/admin/finance", icon: BarChart2 },
  { title: "Пользователи", url: "/me/admin/users", icon: Users },
  { title: "Тарифы", url: "/me/admin/tariffs", icon: CreditCard },
  { title: "Заявки вывода", url: "/me/admin/withdrawals", icon: Receipt },
  { title: "Промокоды", url: "/me/admin/promo", icon: Tag },
  { title: "Приложения", url: "/me/admin/apps", icon: Package },
  { title: "Сервер", url: "/me/admin/server", icon: Server },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();

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
              className="hover:bg-transparent cursor-pointer"
            >
              <Link href="/">
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg shadow-md shadow-primary/20 shrink-0">
                  <VenetianMask className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-bold text-[15px] tracking-tight text-foreground">
                    lowkey
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">
                    Workspace
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="mt-4">
        <NavMain items={userNav} />

        {user?.isAdmin && (
          <>
            {/* Divider label */}
            <div className="px-3 pt-4 pb-1 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-500">
                <Shield className="w-3 h-3" />
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
