"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4">
      <div className="w-24 h-24 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
        <ShieldAlert className="w-12 h-12 text-destructive" />
      </div>
      <h1 className="text-5xl font-black mb-4">Ой, ошибка!</h1>
      <h2 className="text-xl font-medium text-muted-foreground mb-8">
        Что-то пошло не так на нашей стороне. Сервер не смог обработать ваш
        запрос.
      </h2>

      <div className="flex items-center gap-4">
        <Button onClick={() => reset()} size="lg" className="cursor-pointer">
          Попробовать снова
        </Button>
        <Button asChild size="lg" variant="outline" className="cursor-pointer">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
