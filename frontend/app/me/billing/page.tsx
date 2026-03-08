"use client";
import { useEffect, useState } from "react";
import { useUser, useUserTransactions } from "@/hooks/useUser";
import { useBilling, useSubscriptionPlans } from "@/hooks/useBilling";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader } from "@/components/ui/loader";
import {
  Check,
  Wallet,
  QrCode,
  Plus,
  Copy,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  VenetianMask,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Removed hardcoded plans and periods array here (now handled by hooks)

export default function BillingPage() {
  const { profile, isLoading, refetch } = useUser();
  const { transactions, fetchPage } = useUserTransactions();
  const { plans, isLoading: plansLoading } = useSubscriptionPlans();

  const periods = [
    { value: "monthly", label: "1 мес", disc: 0 },
    { value: "3months", label: "3 мес", disc: 0.05 },
    { value: "6months", label: "6 мес", disc: 0.15 },
    { value: "yearly", label: "1 год", disc: 0.2 },
  ];

  useEffect(() => {
    fetchPage(1, 20);
  }, [fetchPage]);
  const {
    paymentStatus,
    startPayment,
    qrUrl,
    amount,
    reset,
    checkStatus,
    pendingSubscription,
  } = useBilling();

  const [topUpAmount, setTopUpAmount] = useState("500");
  const [period, setPeriod] = useState("monthly");
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (paymentStatus === "pending") {
      setTimeLeft(180);
      timer = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [paymentStatus]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (paymentStatus === "pending") {
      interval = setInterval(async () => {
        const isSuccess = await checkStatus();
        if (isSuccess && amount && pendingSubscription) {
          // subscription will be bought automatically on success by billing hook
          setTimeout(() => refetch(), 2000);
        } else if (isSuccess) {
          setTimeout(() => refetch(), 1000);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [paymentStatus, checkStatus, amount, pendingSubscription, refetch]);

  useEffect(() => {
    if (paymentStatus === "success") {
      const t = setTimeout(() => {
        setIsTopUpOpen(false);
        reset();
      }, 2800);
      return () => clearTimeout(t);
    }
  }, [paymentStatus, reset]);

  useEffect(() => {
    if (!isTopUpOpen) {
      const t = setTimeout(reset, 300);
      return () => clearTimeout(t);
    }
  }, [isTopUpOpen, reset]);

  const handleCopyLink = () => {
    if (qrUrl) {
      navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center h-[50vh]">
        <Loader size={64} />
      </div>
    );
  }

  const handleTopUpClick = () => {
    const val = parseInt(topUpAmount);
    if (!isNaN(val) && val > 0) {
      startPayment(val);
    }
  };

  const handleSubscribe = async (
    planId: string,
    planName: string,
    cost: number,
  ) => {
    if (profile.balance >= cost) {
      const result = await useBilling
        .getState()
        .purchaseSubscription(planId, period);
      if (result) refetch();
    } else {
      const missingAmount = cost - profile.balance;
      setTopUpAmount(missingAmount.toString());
      setIsTopUpOpen(true);
      setTimeout(() => {
        startPayment(missingAmount, { planId, period, cost });
      }, 80);
    }
  };

  const curPeriod = periods.find((p) => p.value === period);
  const discount = curPeriod?.disc || 0;

  const minutesFmt = Math.floor(timeLeft / 60);
  const secondsFmt = (timeLeft % 60).toString().padStart(2, "0");

  const qrImgUrl = qrUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=12&color=000000&bgcolor=ffffff&data=${encodeURIComponent(qrUrl)}`
    : null;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Финансы</h1>
          <p className="text-muted-foreground mt-1">
            Пополнение баланса и управление подписками
          </p>
        </div>

        <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
          <div className="flex items-center gap-3 bg-card border border-border rounded-2xl px-5 py-3 w-full sm:w-auto">
            <div className="bg-primary/10 p-2 rounded-xl shrink-0">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider leading-none mb-0.5">
                Баланс
              </div>
              <div className="text-2xl font-black text-foreground tracking-tight leading-none">
                {profile.balance} ₽
              </div>
            </div>
            <DialogTrigger asChild>
              <Button
                size="icon"
                className="cursor-pointer shrink-0 rounded-xl h-10 w-10 bg-primary hover:bg-primary/90 shadow-none transition-all active:scale-95"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </Button>
            </DialogTrigger>
          </div>

          <DialogContent className="sm:max-w-sm bg-background border-border/60 p-0 gap-0 overflow-hidden shadow-none">
            <div className="px-6 pt-6 pb-4 border-b border-border/50">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold tracking-tight">
                  Пополнение баланса
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="px-6 py-6">
              <AnimatePresence mode="wait">
                {(paymentStatus === "idle" || paymentStatus === "failed") && (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-5"
                  >
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-muted-foreground">
                        Сумма к оплате (₽)
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={topUpAmount}
                          onChange={(e) => setTopUpAmount(e.target.value)}
                          min="100"
                          className="h-14 text-2xl font-bold pl-4 pr-10 rounded-xl border-border/60 bg-muted/40 focus-visible:ring-primary shadow-none"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-lg">
                          ₽
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={handleTopUpClick}
                      className="w-full h-12 rounded-xl font-bold shadow-none cursor-pointer text-base"
                    >
                      Перейти к оплате
                    </Button>
                  </motion.div>
                )}

                {(paymentStatus === "pending" ||
                  paymentStatus === "success") && (
                  <motion.div
                    key="qr"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="flex flex-col items-center gap-5"
                  >
                    {/* QR block */}
                    <div className="relative w-56 h-56 rounded-2xl border-2 border-border/60 overflow-hidden bg-white select-none shrink-0">
                      {qrImgUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={qrImgUrl}
                          alt="QR Code"
                          className="w-full h-full object-cover"
                        />
                      )}
                      {!qrImgUrl && (
                        <div className="w-full h-full flex items-center justify-center">
                          <QrCode className="w-12 h-12 text-muted-foreground/20" />
                        </div>
                      )}
                      {/* Logo overlay */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-primary w-11 h-11 rounded-xl border-4 border-white flex items-center justify-center">
                          <VenetianMask className="w-5 h-5 text-primary-foreground" />
                        </div>
                      </div>
                      {/* Success checkmark morphs over QR */}
                      <AnimatePresence>
                        {paymentStatus === "success" && (
                          <motion.div
                            key="success-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.25 }}
                            className="absolute inset-0 flex items-center justify-center bg-white/95 rounded-2xl"
                          >
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{
                                type: "spring",
                                stiffness: 280,
                                damping: 14,
                                delay: 0.1,
                              }}
                              className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center"
                            >
                              <Check className="w-10 h-10 text-white stroke-[3]" />
                            </motion.div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Status text */}
                    <div className="text-center min-h-[56px]">
                      {paymentStatus === "success" && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <div className="text-green-500 font-black text-xl">
                            Оплата прошла!
                          </div>
                          <div className="text-muted-foreground text-sm mt-1">
                            Баланс пополнен на{" "}
                            <strong className="text-foreground">
                              {amount} ₽
                            </strong>
                          </div>
                          {pendingSubscription && (
                            <div className="text-muted-foreground text-xs mt-1">
                              Подписка оформляется…
                            </div>
                          )}
                        </motion.div>
                      )}
                      {paymentStatus === "pending" && (
                        <>
                          <div className="text-sm text-muted-foreground font-medium">
                            Отсканируйте код в банковском приложении
                          </div>
                          <div className="text-3xl font-black text-foreground mt-1 tracking-tight">
                            {amount} ₽
                          </div>
                        </>
                      )}
                    </div>

                    {/* Actions - hidden on success */}
                    {paymentStatus === "pending" && (
                      <div className="w-full space-y-3">
                        <div className="flex gap-2">
                          <Button
                            asChild
                            variant="default"
                            className="flex-1 h-11 rounded-xl font-bold shadow-none cursor-pointer border border-transparent"
                          >
                            <a
                              href={qrUrl || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Открыть в банке
                            </a>
                          </Button>

                          <Button
                            variant="outline"
                            onClick={handleCopyLink}
                            className="flex-1 h-11 rounded-xl font-semibold shadow-none cursor-pointer border-border/60"
                          >
                            {copied ? (
                              <>
                                <Check className="w-4 h-4 mr-2 text-green-500" />
                                Скопировано
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 mr-2" />
                                Скопировать
                              </>
                            )}
                          </Button>
                        </div>

                        <div className="flex items-center justify-between bg-muted/50 rounded-xl px-4 py-3 border border-border/50">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            <span>Ожидаем оплату</span>
                          </div>
                          <div
                            className={`font-mono font-bold text-base tabular-nums ${
                              timeLeft < 60
                                ? "text-destructive animate-pulse"
                                : "text-primary"
                            }`}
                          >
                            {minutesFmt}:{secondsFmt}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Plans */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <h2 className="text-xl font-bold tracking-tight">Тарифы</h2>
          <div className="bg-muted/60 border border-border/50 p-1 rounded-xl inline-flex flex-wrap gap-1 w-full sm:w-auto">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  period === p.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
                {p.disc > 0 && (
                  <span
                    className={`ml-1.5 text-[10px] font-bold ${
                      period === p.value
                        ? "text-primary-foreground/70"
                        : "text-primary"
                    }`}
                  >
                    −{p.disc * 100}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {plans.map((plan, i) => {
            let monthsNum = 1;
            if (period === "3months") monthsNum = 3;
            if (period === "6months") monthsNum = 6;
            if (period === "yearly") monthsNum = 12;

            const monthly = plan.prices[period as keyof typeof plan.prices];
            const totalCost = monthly * monthsNum;
            const canAfford = profile.balance >= totalCost;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card
                  className={`flex flex-col relative shadow-none overflow-hidden h-full transition-colors duration-200 ${
                    plan.isPopular
                      ? "border-primary border-2"
                      : "border-border/60 hover:border-primary/40"
                  }`}
                >
                  {plan.isPopular && (
                    <div className="absolute top-0 inset-x-0 flex justify-center">
                      <div className="bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-b-xl">
                        Хит продаж
                      </div>
                    </div>
                  )}

                  <CardHeader
                    className={`pb-0 text-center ${plan.isPopular ? "pt-9" : "pt-6"}`}
                  >
                    <CardTitle className="text-base font-semibold text-muted-foreground">
                      {plan.name}
                    </CardTitle>
                    <div className="mt-3 flex items-end justify-center gap-1">
                      <span className="text-5xl font-black tracking-tighter text-foreground leading-none">
                        {monthly}
                      </span>
                      <span className="text-lg text-muted-foreground font-medium mb-1">
                        ₽/мес
                      </span>
                    </div>
                    {period !== "monthly" && (
                      <div className="text-sm text-muted-foreground line-through mt-1">
                        {plan.prices.monthly} ₽/мес
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="flex-1 pt-5 pb-4 px-5">
                    <div className="bg-muted/50 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground border border-border/40 text-center">
                      Итого:{" "}
                      <span className="text-foreground font-black text-base">
                        {totalCost} ₽
                      </span>{" "}
                      / {period === "yearly" ? "год" : `${monthsNum} мес.`}
                    </div>
                    <ul className="mt-4 space-y-2">
                      {plan.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <div className="w-4 h-4 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                            <Check className="w-2.5 h-2.5 text-primary stroke-[3]" />
                          </div>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter className="px-5 pb-5 pt-2">
                    <Button
                      className="w-full h-11 rounded-xl font-bold shadow-none cursor-pointer"
                      variant={plan.isPopular ? "default" : "secondary"}
                      onClick={() =>
                        handleSubscribe(plan.id, plan.name, totalCost)
                      }
                    >
                      {canAfford
                        ? "Купить тариф"
                        : `Пополнить на ${totalCost - profile.balance} ₽`}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* History */}
      <section className="space-y-4 pt-4 border-t border-border/40">
        <div className="flex items-center gap-2.5">
          <Receipt className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-xl font-bold tracking-tight">История операций</h2>
        </div>

        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
          {transactions.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors ${
                i < transactions.length - 1 ? "border-b border-border/40" : ""
              }`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  item.type === "topup"
                    ? "bg-green-500/10 text-green-500"
                    : "bg-primary/10 text-primary"
                }`}
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
                className={`font-bold text-sm tabular-nums shrink-0 ${
                  item.type === "topup" || item.type === "referral_earning"
                    ? "text-green-500"
                    : "text-foreground"
                }`}
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
      </section>
    </div>
  );
}
