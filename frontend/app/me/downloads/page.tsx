"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Download,
  Monitor,
  Smartphone,
  Check,
  Loader2,
  HardDrive,
} from "lucide-react";
import { motion } from "motion/react";
import { useDownloads } from "@/hooks/useDownloads";

const PLATFORM_META = {
  android: {
    name: "Android",
    sub: "Android 8.0 или выше",
    icon: Smartphone,
    features: [
      "Фоновая работа без разрывов",
      "Минимальный расход батареи",
      "Встроенный Kill Switch",
    ],
    fallbackUrl:
      "https://play.google.com/store/apps/details?id=com.v2raytun.android",
    fallbackName: "v2rayTun (Google Play)",
  },
  ios: {
    name: "iOS (iPhone/iPad)",
    sub: "iOS 12.0 или выше",
    icon: Smartphone,
    features: [
      "Интеграция с системой",
      "Безопасный веб-серфинг",
      "Простое управление",
    ],
    fallbackUrl: "https://apps.apple.com/us/app/v2raytun/id6476628951",
    fallbackName: "v2rayTun (App Store)",
  },
  windows: {
    name: "Windows",
    sub: "Windows 10/11 64-bit",
    icon: Monitor,
    features: [
      "Быстрый старт вместе с ОС",
      "Специальный режим для игр",
      "Полная совместимость с торрентами",
    ],
    fallbackUrl:
      "https://github.com/throneproj/Throne/releases/download/1.0.13/Throne-1.0.13-windows64-installer.exe",
    fallbackName: "Throne (.exe)",
  },
} as const;

export default function DownloadsPage() {
  const { releases, isLoading, getByPlatform } = useDownloads();

  const platforms: Array<keyof typeof PLATFORM_META> = [
    "android",
    "ios",
    "windows",
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        Загрузка приложений...
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Приложения</h1>
        <p className="text-muted-foreground mt-1">
          Защитите соединение на всех устройствах — удобно и в один клик
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {platforms.map((platform, i) => {
          const meta = PLATFORM_META[platform];
          const release = getByPlatform(platform);
          return (
            <motion.div
              key={platform}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="bg-card border border-border/60 rounded-2xl p-7 flex flex-col h-full hover:border-primary/40 transition-colors">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0 border border-primary/15">
                    <meta.icon className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">{meta.name}</h2>
                    <p className="text-sm text-muted-foreground font-medium mt-0.5">
                      {meta.sub}
                    </p>
                  </div>
                </div>

                <ul className="space-y-3 mb-5 flex-1">
                  {meta.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-green-500 stroke-[3]" />
                      </div>
                      <span className="text-muted-foreground text-[15px] font-medium leading-snug">
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                {release && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-4 px-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-primary">
                        v{release.version}
                      </span>
                      <span>·</span>
                      <span>
                        {new Date(release.createdAt).toLocaleDateString(
                          "ru-RU",
                          { day: "numeric", month: "short" },
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5" />
                      {release.fileSizeMb} МБ
                    </div>
                  </div>
                )}

                <Button
                  asChild
                  variant={platform === "android" ? "default" : "secondary"}
                  className="w-full h-12 cursor-pointer font-bold shadow-none rounded-xl"
                >
                  {release ? (
                    <a href={release.downloadUrl} download>
                      <Download className="w-4 h-4 mr-2" />
                      Скачать {platform === "android" ? "APK" : "Installer"} (v
                      {release.version})
                    </a>
                  ) : (
                    <a
                      href={meta.fallbackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Скачать {meta.fallbackName}
                    </a>
                  )}
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
