"use client";

import { type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon: LucideIcon;
  }[];
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-muted-foreground font-medium text-xs tracking-wider uppercase mb-2">
        Навигация
      </SidebarGroupLabel>
      <SidebarMenu className="gap-1.5">
        {items.map((item) => {
          const isActive = pathname === item.url;
          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={isActive}
                className={
                  isActive
                    ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                    : ""
                }
              >
                <Link href={item.url}>
                  {item.icon && <item.icon />}
                  <span className="group-data-[collapsible=icon]:hidden">
                    {item.title}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
