"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { VenetianMask } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center">
        <VenetianMask className="w-20 h-20 text-muted-foreground/30 mb-8" />
        <h1 className="text-8xl font-black text-foreground tracking-tighter mb-4">
          404
        </h1>
        <h2 className="text-2xl font-semibold mb-2">Страница не найдена</h2>
        <p className="text-muted-foreground max-w-md mb-8">
          Возможно вы перешли по устаревшей ссылке или такой страницы никогда не
          существовало в защищенном контуре.
        </p>

        <Button
          asChild
          size="lg"
          className="rounded-full cursor-pointer px-8 shadow-xl shadow-primary/20"
        >
          <Link href="/">Вернуться в безопасность</Link>
        </Button>
      </div>
    </div>
  );
}
