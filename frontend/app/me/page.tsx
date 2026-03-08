"use client";

import { useEffect } from "react";
import { useUser, useUserTransactions } from "@/hooks/useUser";
import { useAuth } from "@/hooks/useAuth";
import { useDevices } from "@/hooks/useDevices";
import { useReferralInfo } from "@/hooks/useReferral";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Clock,
  AlertCircle,
  Wallet,
  Users,
  Laptop,
  ArrowRight,
  CreditCard,
  Download,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

const mockHistory = [
  {
    id: 1,
    type: "topup",
    amount: 500,
    title: "Пополнение через СБП",
    date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 2,
    type: "subscription",
    amount: -1497,
    title: "Оплата тарифа «Продвинутый»",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
];

export default function DashboardPage() {
  const { profile, isLoading: isProfileLoading } = useUser();
  const { transactions, fetchPage } = useUserTransactions();
  const { user } = useAuth();
  const { devices } = useDevices();
  const { info: refInfo } = useReferralInfo();

  useEffect(() => {
    fetchPage(1, 5);
  }, [fetchPage]);

  if (isProfileLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-[50vh]">
        <Loader size={64} />
      </div>
    );
  }

  const sub = profile?.subscription;
  const isSubActive = sub && new Date(sub.activeUntil) > new Date();
  const onlineDevices = devices.filter(
    (d) => d.isOnline && !d.isBlocked,
  ).length;

  const daysLeft = isSubActive
    ? Math.ceil(
        (new Date(sub.activeUntil).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Добро пожаловать, <span className="text-primary">{user?.login}</span>
        </h1>
        <p className="text-muted-foreground mt-1 text-lg">
          Управление аккаунтом и подписками
        </p>
      </div>

      {/* Telegram Link Banner */}
      {profile && !profile.telegramId && profile.telegramLinkCode && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-primary/10 border border-primary/20 rounded-2xl p-6"
        >
          <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between">
            <div className="space-y-1.5 flex-1">
              <h3 className="font-bold text-lg text-primary flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Привяжите Telegram аккаунт
              </h3>
              <p className="text-sm text-foreground/80 leading-relaxed max-w-xl">
                Отправьте этот код нашему Telegram боту, чтобы авторизовываться
                на сайте без пароля и получать уведомления о подписке.
              </p>
            </div>
            <div className="bg-background border border-border/50 rounded-xl p-4 md:min-w-[200px] text-center shrink-0 shadow-sm relative overflow-hidden">
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 opacity-80">
                Ваш код привязки
              </div>
              <div className="text-2xl font-black tracking-[0.2em] text-foreground font-mono relative z-10">
                {profile.telegramLinkCode}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Stat chips */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Баланс",
            value: `${profile?.balance ?? 0} ₽`,
            icon: Wallet,
            href: "/me/billing",
            color: "text-primary",
            bg: "bg-primary/10",
          },
          {
            label: "Подписка",
            value: isSubActive ? sub.planName : "Нет",
            sub: isSubActive ? `Ещё ${daysLeft} дн.` : "Оформить",
            icon: Shield,
            href: "/me/billing",
            color: isSubActive ? "text-green-500" : "text-muted-foreground",
            bg: isSubActive ? "bg-green-500/10" : "bg-muted/50",
          },
          {
            label: "Устройства онлайн",
            value: String(onlineDevices),
            sub: `из ${devices.length} всего`,
            icon: Laptop,
            href: "/me/devices",
            color: "text-primary",
            bg: "bg-primary/10",
          },
          {
            label: "Реф. доход",
            value: `${refInfo?.totalEarned || 0} ₽`,
            sub: `Баланс: ${refInfo?.balance || 0} ₽`,
            icon: Users,
            href: "/me/referral",
            color: "text-violet-500",
            bg: "bg-violet-500/10",
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
          >
            <Link href={stat.href}>
              <div className="bg-card border border-border/60 rounded-2xl p-5 hover:border-primary/40 transition-colors cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                  {stat.label}
                </div>
                <div
                  className={`text-2xl font-black tracking-tight ${stat.color}`}
                >
                  {stat.value}
                </div>
                {stat.sub && (
                  <div className="text-xs text-muted-foreground font-medium mt-0.5">
                    {stat.sub}
                  </div>
                )}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Subscription status */}
      <div className="grid md:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <div className="bg-card border border-border/60 rounded-2xl p-6 h-full">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-base font-bold">Текущая подписка</h2>
            </div>
            {isSubActive ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-black text-foreground">
                    {sub.planName}
                  </span>
                  <span className="bg-green-500/10 text-green-500 text-xs font-bold px-2.5 py-1 rounded-full">
                    Активна
                  </span>
                </div>
                <div className="bg-muted/50 border border-border/50 p-4 rounded-xl flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">
                      Действует до
                    </div>
                    <div className="text-sm font-bold">
                      {new Date(sub.activeUntil).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </div>
                <Button
                  asChild
                  variant="outline"
                  className="w-full cursor-pointer shadow-none border-border/60 rounded-xl"
                >
                  <Link href="/me/billing">Продлить подписку</Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center gap-4 bg-muted/30 rounded-xl border border-dashed border-border">
                <AlertCircle className="w-8 h-8 text-muted-foreground" />
                <div>
                  <div className="font-bold">Нет активной подписки</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Оформите тариф для доступа к VPN
                  </p>
                </div>
                <Button
                  asChild
                  className="cursor-pointer shadow-none rounded-xl"
                >
                  <Link href="/me/billing">Выбрать тариф</Link>
                </Button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42 }}
        >
          <div className="bg-card border border-border/60 rounded-2xl p-6 h-full">
            <h2 className="text-base font-bold mb-4">Быстрые действия</h2>
            <div className="space-y-2">
              {[
                {
                  icon: CreditCard,
                  label: "Пополнить баланс",
                  sub: "Через СБП мгновенно",
                  href: "/me/billing",
                },
                {
                  icon: Download,
                  label: "Скачать приложение",
                  sub: "Android & Windows",
                  href: "/me/downloads",
                },
                {
                  icon: Users,
                  label: "Реферальная программа",
                  sub: "Зарабатывайте вместе",
                  href: "/me/referral",
                },
              ].map((action) => (
                <Link key={action.href} href={action.href}>
                  <div className="flex items-center gap-4 p-3.5 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer group">
                    <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                      <action.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">
                        {action.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {action.sub}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent history */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">Последние операции</h2>
          <Link
            href="/me/billing"
            className="text-sm text-primary font-medium hover:underline"
          >
            Все →
          </Link>
        </div>
        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
          {transactions.slice(0, 5).map((item, i) => (
            <div
              key={item.id}
              className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors ${i < Math.min(transactions.length, 5) - 1 ? "border-b border-border/40" : ""}`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${item.type === "topup" ? "bg-green-500/10 text-green-500" : "bg-primary/10 text-primary"}`}
              >
                {item.type === "topup" ? (
                  <ArrowDownLeft className="w-4 h-4" />
                ) : (
                  <ArrowUpRight className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">
                  {item.title}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(item.createdAt).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div
                className={`font-bold text-sm tabular-nums shrink-0 ${item.type === "topup" || item.type === "referral_earning" ? "text-green-500" : "text-foreground"}`}
              >
                {item.amount > 0 ? "+" : ""}
                {item.amount} ₽
              </div>
            </div>
          ))}
          {transactions.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Операций пока нет
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
