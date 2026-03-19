"use client";
import { useUser } from "@/hooks/useUser";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import { Shield, Calendar, RefreshCw, AlertCircle } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";

export default function SubscriptionsPage() {
  const { profile, isLoading } = useUser();

  if (isLoading || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center h-[50vh]">
        <Loader size={64} />
      </div>
    );
  }

  const sub = profile.subscription;
  const isExpired = sub ? new Date(sub.activeUntil) < new Date() : false;
  const daysLeft = sub
    ? Math.ceil(
        (new Date(sub.activeUntil).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Подписка</h1>
        <p className="text-muted-foreground mt-1">
          Управление подпиской и автопродлением
        </p>
      </div>

      {sub && !isExpired ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="font-bold text-lg">{sub.planName}</div>
                <div className="text-sm text-muted-foreground">
                  Подписка активна
                </div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-background border border-border/60 rounded-xl p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Истекает
                </div>
                <div className="font-bold text-base">
                  {new Date(sub.activeUntil).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                <div
                  className={`text-xs mt-1 font-medium ${
                    daysLeft <= 7 ? "text-orange-500" : "text-muted-foreground"
                  }`}
                >
                  {daysLeft > 0
                    ? `${daysLeft} ${
                        daysLeft === 1
                          ? "день"
                          : daysLeft < 5
                            ? "дня"
                            : "дней"
                      }`
                    : "Сегодня"}
                </div>
              </div>
              <div className="bg-background border border-border/60 rounded-xl p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Автопродление
                </div>
                <div className="font-bold text-base">
                  Настроить в настройках
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Пополните баланс заранее
                </div>
              </div>
            </div>
          </div>
          <Button
            asChild
            className="w-full h-12 rounded-xl font-bold shadow-none"
          >
            <Link href="/me/billing">Сменить тариф или продлить</Link>
          </Button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="bg-muted/40 border border-border/60 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <div className="font-bold text-lg">
                {isExpired ? "Подписка истекла" : "Нет активной подписки"}
              </div>
              <div className="text-muted-foreground text-sm mt-1">
                Оформите подписку для доступа к VPN
              </div>
            </div>
            <Button
              asChild
              className="h-12 px-8 rounded-xl font-bold shadow-none"
            >
              <Link href="/me/billing">Выбрать тариф</Link>
            </Button>
          </div>
        </motion.div>
      )}

      <div className="bg-muted/40 border border-border/40 rounded-xl px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p>
          • Подписка продлевается автоматически при наличии достаточного
          баланса.
        </p>
        <p>
          • Для продления заблаговременно пополните баланс на сумму тарифа.
        </p>
        <p>
          • После оплаты услуга считается оказанной. Возвраты производятся в
          исключительных случаях согласно оферте.
        </p>
      </div>
    </div>
  );
}
