import Link from "next/link";
import { Bot, VenetianMask } from "lucide-react";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background py-16 px-4 md:px-8">
      <div className="max-w-6xl mx-auto flex flex-col items-center md:items-start text-center md:text-left">
        <div className="flex flex-col md:flex-row justify-between w-full gap-10">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-2">
              <VenetianMask className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold tracking-tight">lowkey</span>
            </div>
            <div className="text-muted-foreground text-sm space-y-1">
              <p className="font-semibold text-foreground">
                ИП Галин Богдан Маратович
              </p>
              <p>ИНН 740414494214</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 items-center md:items-end w-full md:w-auto">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-foreground mb-1">
              Документы
            </h4>
            <Link
              href="/legal/offer"
              className="text-sm text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
            >
              Публичная оферта
            </Link>
            <Link
              href="/legal/privacy"
              className="text-sm text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
            >
              Политика конфиденциальности
            </Link>
            <Link
              href="https://t.me/lowkeyvpnbot"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
            >
              <Bot className="h-4 w-4" />
              @lowkeyvpnbot
            </Link>
          </div>
        </div>

        <div className="w-full h-px bg-border my-8" />

        <div className="w-full text-center text-xs text-muted-foreground/60">
          <p>© {new Date().getFullYear()} lowkey. Все права защищены.</p>
        </div>
      </div>
    </footer>
  );
}
