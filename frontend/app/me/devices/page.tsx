"use client";

import { useDevices } from "@/hooks/useDevices";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import {
  MonitorSmartphone,
  ShieldBan,
  Monitor,
  Smartphone,
  Globe,
  Activity,
  Wifi,
  WifiOff,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function DevicesPage() {
  const { devices, isLoading, toggleBlock } = useDevices();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-[50vh]">
        <Loader size={64} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <MonitorSmartphone className="w-7 h-7 text-primary" />
            Устройства
          </h1>
          <p className="text-muted-foreground mt-1">
            Управляйте подключениями к вашей VPN подписке
          </p>
        </div>
        <div className="bg-muted/50 border border-border/50 rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground">
          {devices.filter((d) => d.isOnline && !d.isBlocked).length} онлайн из{" "}
          {devices.length}
        </div>
      </div>

      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        <AnimatePresence>
          {devices.map((device, i) => {
            const isDesktop =
              device.os.toLowerCase().includes("windows") ||
              device.os.toLowerCase().includes("mac");

            return (
              <motion.div
                key={device.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  delay: i * 0.08,
                  type: "spring",
                  stiffness: 220,
                  damping: 22,
                }}
                className={`flex flex-col sm:flex-row items-stretch transition-colors border-b border-border/40 last:border-b-0 ${
                  device.isBlocked ? "bg-destructive/5" : ""
                }`}
              >
                {/* Device icon */}
                <div className="p-5 flex items-center justify-center sm:min-w-[100px] bg-muted/20 border-b sm:border-b-0 sm:border-r border-border/40">
                  {isDesktop ? (
                    <Monitor className="w-10 h-10 text-muted-foreground/60" />
                  ) : (
                    <Smartphone className="w-10 h-10 text-muted-foreground/60" />
                  )}
                </div>

                {/* Info */}
                <div className="p-5 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-lg">{device.name}</h3>
                      {device.isBlocked && (
                        <span className="bg-destructive/10 text-destructive text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                          Заблокировано
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">
                      {device.os} {device.version}
                    </p>
                    <p className="text-xs text-muted-foreground/60 font-mono flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      {device.lastIp}
                    </p>
                  </div>

                  {/* Status + action */}
                  <div className="flex flex-col sm:items-end gap-3 shrink-0">
                    {device.isBlocked ? (
                      <div className="flex items-center gap-2 text-destructive text-sm font-semibold">
                        <ShieldBan className="w-4 h-4" />
                        Доступ ограничен
                      </div>
                    ) : device.isOnline ? (
                      <div className="flex flex-col sm:items-end gap-1">
                        <div className="flex items-center gap-2 text-green-500 font-bold text-sm">
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          Онлайн
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-muted/50 px-2.5 py-1 rounded-lg border border-border/50">
                          <Activity className="w-3 h-3 text-primary" />
                          {(device.speedKbps! / 1024).toFixed(1)} МБ/с
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                        <WifiOff className="w-4 h-4" />
                        Офлайн
                      </div>
                    )}

                    <Button
                      variant={device.isBlocked ? "outline" : "destructive"}
                      size="sm"
                      className="cursor-pointer font-semibold shadow-none rounded-xl w-full sm:w-auto"
                      onClick={() => toggleBlock(device.id)}
                    >
                      {device.isBlocked ? (
                        <>
                          <Wifi className="w-3.5 h-3.5 mr-1.5" />
                          Разблокировать
                        </>
                      ) : (
                        <>
                          <ShieldBan className="w-3.5 h-3.5 mr-1.5" />
                          Заблокировать
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
