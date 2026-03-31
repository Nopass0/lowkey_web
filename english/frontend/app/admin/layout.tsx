"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { useAuthStore } from "@/store/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, token, fetchMe } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!token) { router.push("/login"); return; }
    if (!user) fetchMe();
  }, [token]);

  if (!token) return null;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Topbar title="Администрирование" />
      <BottomNav />
      <main className="md:ml-60 pt-14 min-h-screen pb-20 md:pb-0">
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
