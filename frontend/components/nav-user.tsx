"use client";

import { useEffect, useState } from "react";

import {
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Moon,
  Sun,
  UserCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useUser } from "@/hooks/useUser";
import { useTheme } from "@/hooks/useTheme";
import { Skeleton } from "@/components/ui/skeleton";

export function NavUser() {
  const { isMobile } = useSidebar();
  const { user, logout } = useAuth();
  const { profile, isLoading } = useUser();
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const displayUser = user || { login: "nopass", avatarHash: "abcdef" };
  const avatarHue =
    parseInt(displayUser.avatarHash.substring(0, 6) || "0", 16) % 360;
  const avatarColor = `hsl(${avatarHue}, 85%, 55%)`;

  if (!mounted) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="grid flex-1 gap-1 group-data-[collapsible=icon]:hidden">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback
                  className="rounded-lg text-primary-foreground font-bold"
                  style={{
                    backgroundColor: avatarColor,
                  }}
                >
                  {displayUser.login.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">
                  {displayUser.login}
                </span>
                {isLoading && !profile ? (
                  <Skeleton className="h-3 w-16" />
                ) : (
                  <span className="truncate text-xs text-primary flex items-center gap-1 font-medium">
                    <span
                      className={
                        profile?.subscription
                          ? "text-primary flex-1 truncate"
                          : "text-muted-foreground flex-1 truncate"
                      }
                    >
                      {profile?.subscription
                        ? profile.subscription.planName
                        : "Нет подписки"}
                    </span>
                    <span className="text-primary/100 bg-primary/10 border border-primary/20 rounded-md px-1 shrink-0">
                      {profile?.balance || 0} ₽
                    </span>
                  </span>
                )}
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback
                    className="rounded-lg text-primary-foreground font-bold"
                    style={{
                      backgroundColor: avatarColor,
                    }}
                  >
                    {displayUser.login.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {displayUser.login}
                  </span>
                  <span className="truncate text-xs font-mono text-muted-foreground">
                    Баланс: {profile?.balance || 0} ₽
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={toggleTheme}
                className="cursor-pointer"
              >
                {theme === "dark" ? (
                  <Sun className="mr-2 size-4" />
                ) : (
                  <Moon className="mr-2 size-4" />
                )}
                {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push("/me/billing")}
                className="cursor-pointer"
              >
                <CreditCard className="mr-2 size-4" />
                Кошелек
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive cursor-pointer font-medium"
              onClick={() => {
                logout();
                router.push("/");
              }}
            >
              <LogOut className="mr-2 size-4" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
