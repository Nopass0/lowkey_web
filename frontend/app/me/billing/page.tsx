"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser, useUserTransactions } from "@/hooks/useUser";
import { useBilling, useSubscriptionPlans } from "@/hooks/useBilling";
import {
  useYKBilling,
  usePaymentMethods,
  type YKPaymentType,
} from "@/hooks/useYokassa";
import type { PaymentMethod } from "@/api/types";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  CreditCard,
  Trash2,
  Star,
  Smartphone,
  Zap,
  Tag,
  Shield,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

// ─── Constants ───────────────────────────────────────────────────────────────

const PERIODS = [
  { value: "monthly", label: "1 мес", disc: 0 },
  { value: "3months", label: "3 мес", disc: 0.05 },
  { value: "6months", label: "6 мес", disc: 0.15 },
  { value: "yearly", label: "1 год", disc: 0.2 },
] as const;

type Period = (typeof PERIODS)[number]["value"];

function formatPromoDuration(
  count: number | null | undefined,
  unit: string | null | undefined,
) {
  const safeCount = count && count > 0 ? count : 1;
  if (unit === "day") {
    return safeCount === 1 ? "1 день" : `${safeCount} дн.`;
  }
  if (unit === "week") {
    return safeCount === 1 ? "1 неделю" : `${safeCount} нед.`;
  }
  return safeCount === 1 ? "1 месяц" : `${safeCount} мес.`;
}

const PAYMENT_TYPE_META: Record<
  YKPaymentType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  bank_card: {
    label: "Банковская карта",
    icon: <CreditCard className="w-4 h-4" />,
    color: "text-blue-500",
  },
  sbp: {
    label: "СБП",
    icon: <Smartphone className="w-4 h-4" />,
    color: "text-green-500",
  },
  tinkoff_bank: {
    label: "Т-Банк",
    icon: <Zap className="w-4 h-4" />,
    color: "text-yellow-500",
  },
};

// ─── CardBrandIcon ────────────────────────────────────────────────────────────

function CardBrandIcon({
  brand,
  className = "",
}: {
  brand: string | null;
  className?: string;
}) {
  const b = (brand ?? "").toLowerCase();
  if (b.includes("visa")) {
    return (
      <span
        className={`font-black italic text-blue-600 text-sm leading-none ${className}`}
      >
        VISA
      </span>
    );
  }
  if (b.includes("mastercard") || b.includes("master")) {
    return (
      <span
        className={`font-black text-red-500 text-sm leading-none ${className}`}
      >
        MC
      </span>
    );
  }
  if (b.includes("mir") || b.includes("мир")) {
    return (
      <span
        className={`font-black text-green-600 text-sm leading-none ${className}`}
      >
        МИР
      </span>
    );
  }
  return (
    <CreditCard className={`w-4 h-4 text-muted-foreground ${className}`} />
  );
}

// ─── PaymentTypeSelector ─────────────────────────────────────────────────────

function PaymentTypeSelector({
  selected,
  onChange,
  savedCards,
  selectedCardId,
  onCardSelect,
}: {
  selected: YKPaymentType;
  onChange: (t: YKPaymentType) => void;
  savedCards: PaymentMethod[];
  selectedCardId: string | null;
  onCardSelect: (id: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-muted-foreground">
        Способ оплаты
      </label>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(PAYMENT_TYPE_META) as YKPaymentType[]).map((type) => {
          const meta = PAYMENT_TYPE_META[type];
          const isActive = selected === type;
          return (
            <button
              key={type}
              onClick={() => {
                onChange(type);
                if (type !== "bank_card") onCardSelect(null);
              }}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <span className={isActive ? "text-primary" : meta.color}>
                {meta.icon}
              </span>
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Saved cards list — only shown for bank_card */}
      <AnimatePresence>
        {selected === "bank_card" && savedCards.length > 0 && (
          <motion.div
            key="saved-cards"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 pt-1">
              {/* "New card" option */}
              <button
                onClick={() => onCardSelect(null)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                  selectedCardId === null
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border/50 text-muted-foreground hover:border-primary/30"
                }`}
              >
                <Plus className="w-4 h-4 shrink-0" />
                Новая карта
              </button>

              {savedCards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => onCardSelect(card.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                    selectedCardId === card.id
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border/50 text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <CardBrandIcon brand={card.cardBrand} className="shrink-0" />
                  <span className="flex-1 text-left">
                    •••• {card.cardLast4}
                    {card.cardExpMonth && card.cardExpYear && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {String(card.cardExpMonth).padStart(2, "0")}/
                        {String(card.cardExpYear).slice(-2)}
                      </span>
                    )}
                  </span>
                  {card.isDefault && (
                    <Star className="w-3.5 h-3.5 text-primary shrink-0" />
                  )}
                  {selectedCardId === card.id && (
                    <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SavedCardsSection ────────────────────────────────────────────────────────

function SavedCardsSection({
  methods,
  isLoading,
  onRemove,
  onSetDefault,
  onSetAutoCharge,
  onLinkCard,
}: {
  methods: PaymentMethod[];
  isLoading: boolean;
  onRemove: (id: string) => void;
  onSetDefault: (id: string) => void;
  onSetAutoCharge: (id: string, allowAutoCharge: boolean) => void;
  onLinkCard: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AnimatePresence initial={false}>
        {methods.length === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-muted/40 border border-border/60 rounded-2xl p-8 flex flex-col items-center gap-3 text-center"
          >
            <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center">
              <CreditCard className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <div className="font-bold text-base">Нет сохранённых карт</div>
              <div className="text-sm text-muted-foreground mt-1">
                Привяжите карту для быстрых платежей
              </div>
            </div>
          </motion.div>
        )}

        {methods.map((card, i) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
            transition={{ delay: i * 0.04 }}
            className="bg-card border border-border/60 rounded-2xl px-5 py-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center shrink-0">
              <CardBrandIcon brand={card.cardBrand} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm flex items-center gap-2">
                •••• {card.cardLast4 ?? "????"}
                {card.isDefault && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 font-bold"
                  >
                    Основная
                  </Badge>
                )}
              </div>
              {card.cardExpMonth && card.cardExpYear && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Действует до{" "}
                  {String(card.cardExpMonth).padStart(2, "0")}/
                  {card.cardExpYear}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                Автосписание: {card.allowAutoCharge === false ? "выключено" : "включено"}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!card.isDefault && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onSetDefault(card.id)}
                  className="h-8 px-3 text-xs rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Star className="w-3.5 h-3.5 mr-1" />
                  Основная
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onSetAutoCharge(card.id, card.allowAutoCharge === false)}
                className="h-8 px-3 text-xs rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {card.allowAutoCharge === false ? "Вкл. авто" : "Выкл. авто"}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onRemove(card.id)}
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <Button
        variant="outline"
        onClick={onLinkCard}
        className="w-full h-11 rounded-xl font-semibold shadow-none border-border/60 cursor-pointer"
      >
        <Plus className="w-4 h-4 mr-2" />
        Привязать карту
      </Button>
    </div>
  );
}

// ─── BillingPage ─────────────────────────────────────────────────────────────

type ActiveTab = "plans" | "cards" | "history";

export default function BillingPage() {
  const searchParams = useSearchParams();
  const { profile, isLoading, refetch } = useUser();
  const { transactions, fetchPage } = useUserTransactions();
  const { plans, isLoading: plansLoading } = useSubscriptionPlans();

  // SBP legacy billing
  const {
    paymentStatus,
    startPayment,
    qrUrl,
    amount: sbpAmount,
    reset: sbpReset,
    checkStatus,
    purchaseSubscription,
    pendingSubscription,
  } = useBilling();

  // YooKassa billing
  const {
    status: ykStatus,
    confirmationUrl: ykConfirmationUrl,
    amount: ykAmount,
    startTopup,
    startLinkCard,
    startPromoSubscribe,
    checkStatus: ykCheckStatus,
    restorePending,
    reset: ykReset,
  } = useYKBilling();

  // Payment methods (saved cards)
  const {
    methods: savedCards,
    isLoading: cardsLoading,
    refetch: refetchCards,
    removeCard,
    setDefault,
    setAutoCharge,
  } = usePaymentMethods();

  // UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>("plans");
  const [period, setPeriod] = useState<Period>("monthly");
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("500");
  const [paymentType, setPaymentType] = useState<YKPaymentType>("bank_card");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [pendingPlanPurchase, setPendingPlanPurchase] = useState<{
    planId: string;
    cost: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180);
  const intentHandledRef = useRef(false);

  // Fetch history + handle URL params on mount
  useEffect(() => {
    fetchPage(1, 20);
  }, [fetchPage]);

  useEffect(() => {
    restorePending();
  }, [restorePending]);

  useEffect(() => {
    const linked = searchParams.get("linked");
    const subscribed = searchParams.get("subscribed");
    if (linked === "1" || subscribed === "1") {
      refetch();
      refetchCards();
      if (linked === "1") setActiveTab("cards");
    }
  }, [searchParams, refetch, refetchCards]);

  useEffect(() => {
    if (intentHandledRef.current) return;

    const tab = searchParams.get("tab");
    if (tab === "plans" || tab === "cards" || tab === "history") {
      setActiveTab(tab);
    }

    const nextPeriod = searchParams.get("period");
    if (
      nextPeriod === "monthly" ||
      nextPeriod === "3months" ||
      nextPeriod === "6months" ||
      nextPeriod === "yearly"
    ) {
      setPeriod(nextPeriod);
    }

    const intent = searchParams.get("intent");
    const amount = searchParams.get("amount");
    if (intent === "topup") {
      if (amount && /^\d+$/.test(amount)) {
        setTopUpAmount(amount);
      }
      setIsTopUpOpen(true);
    }

    intentHandledRef.current = true;
  }, [searchParams]);

  // SBP countdown timer
  useEffect(() => {
    if (paymentStatus !== "pending") return;
    setTimeLeft(180);
    const timer = setInterval(
      () => setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0)),
      1000,
    );
    return () => clearInterval(timer);
  }, [paymentStatus]);

  // SBP polling — every 3s while pending
  useEffect(() => {
    if (paymentStatus !== "pending") return;
    const interval = setInterval(async () => {
      const done = await checkStatus();
      if (done) {
        setTimeout(() => refetch(), 1000);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [paymentStatus, checkStatus, refetch]);

  // Close top-up dialog on SBP success after delay
  useEffect(() => {
    if (paymentStatus !== "success") return;
    const t = setTimeout(() => {
      setIsTopUpOpen(false);
      sbpReset();
    }, 2800);
    return () => clearTimeout(t);
  }, [paymentStatus, sbpReset]);

  // YK polling — every 4s while pending
  useEffect(() => {
    if (ykStatus !== "pending") return;
    const interval = setInterval(async () => {
      const result = await ykCheckStatus();
      if (result === "success") {
        setTimeout(() => {
          refetch();
          refetchCards();
        }, 1000);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [ykStatus, ykCheckStatus, refetch, refetchCards]);

  // Close top-up dialog on YK success after delay
  useEffect(() => {
    if (ykStatus !== "success") return;
    const t = setTimeout(() => {
      setIsTopUpOpen(false);
      setPendingPlanPurchase(null);
      ykReset();
    }, 2800);
    return () => clearTimeout(t);
  }, [ykStatus, ykReset]);

  // Reset payment state when dialog closes
  const prevOpen = useRef(isTopUpOpen);
  useEffect(() => {
    if (prevOpen.current && !isTopUpOpen) {
      setTimeout(() => {
        sbpReset();
        ykReset();
        setPendingPlanPurchase(null);
      }, 300);
    }
    prevOpen.current = isTopUpOpen;
  }, [isTopUpOpen, sbpReset, ykReset]);

  if (isLoading || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center h-[50vh]">
        <Loader size={64} />
      </div>
    );
  }

  // ── Handlers ──────────────────────────────────────────────────

  const handleTopUpYK = async () => {
    const val = parseInt(topUpAmount, 10);
    if (isNaN(val) || val < 1) return;
    const res = await startTopup(val, paymentType, {
      cardMethodId: selectedCardId ?? undefined,
      subscriptionPlanId: pendingPlanPurchase?.planId,
      subscriptionPeriod: pendingPlanPurchase ? period : undefined,
    });
    if (res?.confirmationUrl) {
      window.location.assign(res.confirmationUrl);
    }
  };

  const handleTopUpSBP = async () => {
    const val = parseInt(topUpAmount, 10);
    if (isNaN(val) || val < 1) return;
    if (profile.sbpProvider === "yookassa") {
      const res = await startTopup(val, "sbp", {
        subscriptionPlanId: pendingPlanPurchase?.planId,
        subscriptionPeriod: pendingPlanPurchase ? period : undefined,
      });
      if (res?.confirmationUrl) {
        window.location.assign(res.confirmationUrl);
      }
      return;
    }
    await startPayment(val);
  };

  const handleLinkCard = async (opts?: {
    subscriptionPlanId?: string;
    subscriptionPeriod?: string;
  }) => {
    const res = await startLinkCard(opts);
    if (res?.confirmationUrl) {
      window.location.assign(res.confirmationUrl);
    }
  };

  const handleSubscribe = async (planId: string, cost: number) => {
    const autoRenewMethodId =
      selectedCardId ??
      savedCards.find((card) => card.isDefault)?.id ??
      savedCards.find((card) => card.allowAutoCharge !== false)?.id;

    if (!autoRenewMethodId) {
      if (profile.balance >= cost) {
        await handleLinkCard({
          subscriptionPlanId: planId,
          subscriptionPeriod: period,
        });
        return;
      }
    }

    if (profile.balance >= cost) {
      const result = await purchaseSubscription(
        planId,
        period,
        autoRenewMethodId ?? undefined,
      );
      if (result) refetch();
    } else {
      const needed = cost - profile.balance;
      setTopUpAmount(needed.toString());
      setPendingPlanPurchase({ planId, cost });
      setPaymentType(profile.sbpProvider === "yookassa" ? "sbp" : "bank_card");
      setIsTopUpOpen(true);
    }
  };

  const handlePromoSubscribe = async (planSlug: string) => {
    const res = await startPromoSubscribe(planSlug, period);
    if (res?.confirmationUrl) {
      window.location.assign(res.confirmationUrl);
    }
  };

  const handleCopySBP = () => {
    if (qrUrl) {
      navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Derived values ─────────────────────────────────────────────

  const minutesFmt = Math.floor(timeLeft / 60);
  const secondsFmt = (timeLeft % 60).toString().padStart(2, "0");

  const sbpQrImgUrl = qrUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=12&color=000000&bgcolor=ffffff&data=${encodeURIComponent(qrUrl)}`
    : null;

  // Overall dialog payment status for UI
  const dialogState = (() => {
    if (
      paymentStatus === "pending" ||
      paymentStatus === "success" ||
      paymentStatus === "failed"
    )
      return paymentStatus;
    if (ykStatus === "redirecting") return "yk_redirecting";
    if (ykStatus === "pending") return "yk_pending";
    if (ykStatus === "success") return "yk_success";
    if (ykStatus === "failed") return "yk_failed";
    return "idle";
  })();

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "plans", label: "Тарифы" },
    { key: "cards", label: "Карты" },
    { key: "history", label: "История" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Финансы</h1>
          <p className="text-muted-foreground mt-1">
            Пополнение баланса и управление подписками
          </p>
        </div>

        {/* Balance card + top-up dialog */}
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
                {/* ── Idle / failed form ── */}
                {(dialogState === "idle" || dialogState === "yk_failed") && (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-5"
                  >
                    {/* Amount input */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-muted-foreground">
                        Сумма к оплате (₽)
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={topUpAmount}
                          onChange={(e) => setTopUpAmount(e.target.value)}
                          min="1"
                          className="h-14 text-2xl font-bold pl-4 pr-10 rounded-xl border-border/60 bg-muted/40 focus-visible:ring-primary shadow-none"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-lg">
                          ₽
                        </span>
                      </div>
                    </div>

                    {/* Payment type selector */}
                    <PaymentTypeSelector
                      selected={paymentType}
                      onChange={setPaymentType}
                      savedCards={savedCards}
                      selectedCardId={selectedCardId}
                      onCardSelect={setSelectedCardId}
                    />

                    {pendingPlanPurchase && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                        После пополнения недостающей суммы тариф купится автоматически.
                        Для автосписаний выберите сохранённую карту или оплатите новой картой.
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="space-y-2">
                      {paymentType === "sbp" ? (
                        <Button
                          onClick={handleTopUpSBP}
                          className="w-full h-12 rounded-xl font-bold shadow-none cursor-pointer text-base"
                        >
                          <QrCode className="w-4 h-4 mr-2" />
                          Получить QR-код
                        </Button>
                      ) : (
                        <Button
                          onClick={handleTopUpYK}
                          className="w-full h-12 rounded-xl font-bold shadow-none cursor-pointer text-base"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Перейти к оплате
                        </Button>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* ── YK redirecting (link opened) ── */}
                {dialogState === "yk_redirecting" && (
                  <motion.div
                    key="yk_redirecting"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex flex-col items-center gap-5 text-center"
                  >
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                      <ExternalLink className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <div className="font-bold text-lg">Переход к оплате</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Страница оплаты открыта в новой вкладке
                      </div>
                    </div>
                    {ykConfirmationUrl && (
                      <Button
                        asChild
                        variant="outline"
                        className="h-11 rounded-xl font-semibold shadow-none border-border/60 cursor-pointer"
                      >
                        <a
                          href={ykConfirmationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Открыть снова
                        </a>
                      </Button>
                    )}
                    <div className="text-xs text-muted-foreground">
                      После оплаты баланс обновится автоматически
                    </div>
                  </motion.div>
                )}

                {/* ── YK pending (waiting confirmation) ── */}
                {dialogState === "yk_pending" && (
                  <motion.div
                    key="yk_pending"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="flex flex-col items-center gap-5 text-center"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Loader size={32} />
                    </div>
                    <div>
                      <div className="font-bold text-lg">Ожидаем оплату</div>
                      <div className="text-muted-foreground text-sm mt-1">
                        Проверяем статус платежа…
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── YK success ── */}
                {dialogState === "yk_success" && (
                  <motion.div
                    key="yk_success"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="flex flex-col items-center gap-5 text-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 280,
                        damping: 14,
                      }}
                      className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center"
                    >
                      <Check className="w-10 h-10 text-white stroke-[3]" />
                    </motion.div>
                    <div>
                      <div className="text-green-500 font-black text-xl">
                        Оплата прошла!
                      </div>
                      <div className="text-muted-foreground text-sm mt-1">
                        Баланс пополнен на{" "}
                        <strong className="text-foreground">
                          {ykAmount} ₽
                        </strong>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── SBP QR pending / success ── */}
                {(dialogState === "pending" || dialogState === "success") && (
                  <motion.div
                    key="sbp_qr"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="flex flex-col items-center gap-5"
                  >
                    {/* QR block */}
                    <div className="relative w-56 h-56 rounded-2xl border-2 border-border/60 overflow-hidden bg-white select-none shrink-0">
                      {sbpQrImgUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={sbpQrImgUrl}
                          alt="QR Code"
                          className="w-full h-full object-cover"
                        />
                      ) : (
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
                      {/* Success checkmark */}
                      <AnimatePresence>
                        {dialogState === "success" && (
                          <motion.div
                            key="sbp-success-overlay"
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
                      {dialogState === "success" ? (
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
                              {sbpAmount} ₽
                            </strong>
                          </div>
                          {pendingSubscription && (
                            <div className="text-muted-foreground text-xs mt-1">
                              Подписка оформляется…
                            </div>
                          )}
                        </motion.div>
                      ) : (
                        <>
                          <div className="text-sm text-muted-foreground font-medium">
                            Отсканируйте код в банковском приложении
                          </div>
                          <div className="text-3xl font-black text-foreground mt-1 tracking-tight">
                            {sbpAmount} ₽
                          </div>
                        </>
                      )}
                    </div>

                    {/* Actions — hidden on success */}
                    {dialogState === "pending" && (
                      <div className="w-full space-y-3">
                        <div className="flex gap-2">
                          <Button
                            asChild
                            variant="default"
                            className="flex-1 h-11 rounded-xl font-bold shadow-none cursor-pointer"
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
                            onClick={handleCopySBP}
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

      {/* ── Tabs ── */}
      <div className="border-b border-border/50">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Plans tab ── */}
      <AnimatePresence mode="wait">
        {activeTab === "plans" && (
          <motion.div
            key="tab-plans"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            {/* Active subscription banner */}
            {profile.subscription && (
              <div className="bg-primary/5 border border-primary/20 rounded-2xl px-5 py-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">
                    {profile.subscription.planName}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Активна до{" "}
                    {new Date(
                      profile.subscription.activeUntil,
                    ).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs font-bold shrink-0">
                  Активна
                </Badge>
              </div>
            )}

            {/* Period selector */}
            <div className="bg-muted/60 border border-border/50 p-1 rounded-xl inline-flex flex-wrap gap-1 w-full sm:w-auto">
              {PERIODS.map((p) => (
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

            {/* Plans grid */}
            {plansLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader size={48} />
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                {plans.map((plan, i) => {
                  const monthsNum =
                    period === "3months"
                      ? 3
                      : period === "6months"
                        ? 6
                        : period === "yearly"
                          ? 12
                          : 1;

                  const monthly = plan.prices[period] ?? plan.prices["monthly"] ?? 0;
                  const totalCost = monthly * monthsNum;
                  const canAfford = profile.balance >= totalCost;
                  const hasPromo =
                    plan.promoActive &&
                    plan.promoPrice != null &&
                    period === "monthly";
                  const promoDurationLabel = formatPromoDuration(
                    plan.promoDurationCount,
                    plan.promoDurationUnit,
                  );
                  const monthlyRenewalPrice = plan.prices["monthly"] ?? monthly;

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
                        {/* Popular badge */}
                        {plan.isPopular && (
                          <div className="absolute top-0 inset-x-0 flex justify-center">
                            <div className="bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-b-xl">
                              Хит продаж
                            </div>
                          </div>
                        )}

                        {/* Promo badge */}
                        {hasPromo && plan.promoLabel && (
                          <div className="absolute top-3 right-3">
                            <Badge className="text-[10px] font-black bg-orange-500 hover:bg-orange-500 text-white border-0 px-2 py-0.5 flex items-center gap-1">
                              <Tag className="w-2.5 h-2.5" />
                              {plan.promoLabel}
                            </Badge>
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
                              {hasPromo ? plan.promoPrice : monthly}
                            </span>
                            <span className="text-lg text-muted-foreground font-medium mb-1">
                              ₽/мес
                            </span>
                          </div>
                          {period !== "monthly" && (
                            <div className="text-sm text-muted-foreground line-through mt-1">
                              {plan.prices["monthly"]} ₽/мес
                            </div>
                          )}
                          {hasPromo && plan.promoPrice != null && (
                            <div className="text-sm text-muted-foreground line-through mt-1">
                              {monthly} ₽/мес
                            </div>
                          )}
                          {hasPromo && plan.promoPrice != null && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              На {promoDurationLabel}, далее {monthlyRenewalPrice} ₽/мес
                            </div>
                          )}
                        </CardHeader>

                        <CardContent className="flex-1 pt-5 pb-4 px-5">
                          <div className="bg-muted/50 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground border border-border/40 text-center">
                            Итого:{" "}
                            <span className="text-foreground font-black text-base">
                              {hasPromo && plan.promoPrice != null
                                ? plan.promoPrice
                                : totalCost}{" "}
                              ₽
                            </span>{" "}
                            /{" "}
                            {period === "yearly"
                              ? "год"
                              : monthsNum === 1
                                ? "мес."
                                : `${monthsNum} мес.`}
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

                        <CardFooter className="px-5 pb-5 pt-2 flex flex-col gap-2">
                          <Button
                            className="w-full h-11 rounded-xl font-bold shadow-none cursor-pointer"
                            variant={plan.isPopular ? "default" : "secondary"}
                            onClick={() =>
                              handleSubscribe(
                                plan.id,
                                totalCost,
                              )
                            }
                          >
                            {canAfford
                              ? "Купить тариф"
                              : `Пополнить на ${totalCost - profile.balance} ₽`}
                          </Button>

                          {/* Promo subscribe button */}
                          {hasPromo && (
                            <Button
                              variant="outline"
                              className="w-full h-10 rounded-xl font-semibold shadow-none cursor-pointer border-orange-500/40 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20 text-sm"
                              onClick={() => handlePromoSubscribe(plan.id)}
                            >
                              <Tag className="w-3.5 h-3.5 mr-1.5" />
                              Оформить за {plan.promoPrice} ₽
                            </Button>
                          )}
                        </CardFooter>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Cards tab ── */}
        {activeTab === "cards" && (
          <motion.div
            key="tab-cards"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <SavedCardsSection
              methods={savedCards}
              isLoading={cardsLoading}
              onRemove={removeCard}
              onSetDefault={setDefault}
              onSetAutoCharge={setAutoCharge}
              onLinkCard={handleLinkCard}
            />
          </motion.div>
        )}

        {/* ── History tab ── */}
        {activeTab === "history" && (
          <motion.div
            key="tab-history"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2.5">
              <Receipt className="w-5 h-5 text-muted-foreground" />
              <h2 className="text-xl font-bold tracking-tight">
                История операций
              </h2>
            </div>

            <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
              {transactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Операций пока нет
                </div>
              ) : (
                transactions.map((item, i) => {
                  const isIncome =
                    item.type === "topup" || item.type === "referral_earning";
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors ${
                        i < transactions.length - 1
                          ? "border-b border-border/40"
                          : ""
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                          isIncome
                            ? "bg-green-500/10 text-green-500"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {isIncome ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate flex items-center gap-2">
                          <span className="truncate">{item.title}</span>
                          {item.isTest && (
                            <Badge variant="secondary" className="text-[10px] font-bold shrink-0">
                              TEST
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {new Date(item.createdAt).toLocaleDateString(
                            "ru-RU",
                            {
                              day: "numeric",
                              month: "long",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </div>
                      </div>
                      <div
                        className={`font-bold text-sm tabular-nums shrink-0 ${
                          isIncome ? "text-green-500" : "text-foreground"
                        }`}
                      >
                        {item.amount > 0 ? "+" : ""}
                        {item.amount} ₽
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
