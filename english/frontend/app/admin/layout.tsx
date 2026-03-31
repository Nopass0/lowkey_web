"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
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
      <main className="ml-60 pt-14 min-h-screen">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
