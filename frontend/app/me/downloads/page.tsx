"use client";

import { Button } from "@/components/ui/button";
import {
  Check,
  Download,
  HardDrive,
  Loader2,
  Monitor,
  Smartphone,
} from "lucide-react";
import { motion } from "motion/react";
import { useDownloads } from "@/hooks/useDownloads";

const PLATFORM_META = {
  android: {
    name: "Android",
    sub: "Android 8.0 или новее",
    icon: Smartphone,
    features: [
      "Стабильное фоновое подключение",
      "Низкий расход батареи",
      "Поддержка Kill Switch",
    ],
    fallbackUrl:
      "https://play.google.com/store/apps/details?id=com.v2raytun.android",
    fallbackName: "Google Play",
    actionLabel: "Открыть в Google Play",
  },
  ios: {
    name: "iOS (iPhone/iPad)",
    sub: "iOS 12.0 или новее",
    icon: Smartphone,
    features: [
      "Интеграция с системой",
      "Безопасный веб-серфинг",
      "Простая установка",
    ],
    fallbackUrl: "https://apps.apple.com/us/app/v2raytun/id6476628951",
    fallbackName: "App Store",
    actionLabel: "Открыть в App Store",
  },
  windows: {
    name: "Windows",
    sub: "Windows 10/11 64-bit",
    icon: Monitor,
    features: [
      "Быстрый запуск вместе с ОС",
      "Удобная работа на десктопе",
      "Совместимость с рекомендуемым клиентом",
    ],
    fallbackUrl:
      "https://github.com/throneproj/Throne/releases/download/1.0.13/Throne-1.0.13-windows64-installer.exe",
    fallbackName: "Throne (.exe)",
    actionLabel: "Скачать для Windows",
  },
} as const;

export default function DownloadsPage() {
  const { isLoading, getByPlatform } = useDownloads();
  const platforms: Array<keyof typeof PLATFORM_META> = [
    "android",
    "ios",
    "windows",
  ];

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-3 h-6 w-6 animate-spin" />
        Загрузка приложений...
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-8 pb-20 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Приложения</h1>
        <p className="mt-1 text-muted-foreground">
          Установите рекомендованный клиент для вашего устройства и подключайтесь
          в один клик.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {platforms.map((platform, index) => {
          const meta = PLATFORM_META[platform];
          const release = getByPlatform(platform);
          const ctaLabel =
            release && platform === "windows"
              ? `${meta.actionLabel} (v${release.version})`
              : release
                ? meta.actionLabel
                : `Открыть ${meta.fallbackName}`;

          return (
            <motion.div
              key={platform}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="flex h-full flex-col rounded-2xl border border-border/60 bg-card p-7 transition-colors hover:border-primary/40">
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10">
                    <meta.icon className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">{meta.name}</h2>
                    <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                      {meta.sub}
                    </p>
                  </div>
                </div>

                <ul className="mb-5 flex-1 space-y-3">
                  {meta.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/10">
                        <Check className="h-3 w-3 stroke-[3] text-green-500" />
                      </div>
                      <span className="text-[15px] font-medium leading-snug text-muted-foreground">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {release && (
                  <div className="mb-4 flex items-center justify-between px-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-primary">
                        {platform === "windows" ? `v${release.version}` : "Магазин"}
                      </span>
                      <span>·</span>
                      <span>
                        {new Date(release.createdAt).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <HardDrive className="h-3.5 w-3.5" />
                      {release.fileSizeMb > 0 ? `${release.fileSizeMb} МБ` : "Ссылка"}
                    </div>
                  </div>
                )}

                <Button
                  asChild
                  variant={platform === "android" ? "default" : "secondary"}
                  className="h-12 w-full rounded-xl font-bold shadow-none"
                >
                  <a
                    href={release?.downloadUrl ?? meta.fallbackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {ctaLabel}
                  </a>
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
