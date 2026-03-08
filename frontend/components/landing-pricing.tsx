"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { apiClient } from "@/api/client";
import type { SubscriptionPlan } from "@/api/types";
import { useLanding } from "@/hooks/useLanding";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";

const periods = [
  { value: "monthly", label: "1 месяц", suffix: "/ мес" },
  { value: "3months", label: "3 месяца", suffix: "/ мес" },
  { value: "6months", label: "6 месяцев", suffix: "/ мес" },
  { value: "yearly", label: "1 год", suffix: "/ мес" },
] as const;

const fallbackPlans: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Начальный",
    prices: { monthly: 149, "3months": 129, "6months": 99, yearly: 79 },
    features: ["1 устройство", "Базовая скорость", "Доступ к 5 локациям"],
    isPopular: false,
  },
  {
    id: "pro",
    name: "Продвинутый",
    prices: { monthly: 299, "3months": 249, "6months": 199, yearly: 149 },
    features: [
      "3 устройства",
      "Высокая скорость",
      "Доступ ко всем локациям",
      "Kill Switch",
    ],
    isPopular: true,
  },
  {
    id: "advanced",
    name: "Максимальный",
    prices: { monthly: 499, "3months": 399, "6months": 349, yearly: 249 },
    features: [
      "5 устройств",
      "Максимальная скорость",
      "Доступ ко всем локациям",
      "Kill Switch",
      "Выделенный IP",
      "Приоритетная поддержка",
    ],
    isPopular: false,
  },
];

function RollingNumber({ value }: { value: number }) {
  const digits = Math.round(value).toString().split("");

  return (
    <span className="inline-flex overflow-hidden relative">
      <AnimatePresence mode="popLayout" initial={false}>
        {digits.map((digit, index) => (
          <motion.span
            key={`${index}-${digit}`}
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            exit={{ y: "-100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="inline-block tabular-nums"
          >
            {digit}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

function getPeriodMeta(period: string) {
  return (
    periods.find((item) => item.value === period) ?? {
      value: period,
      label: period,
      suffix: "/ мес",
    }
  );
}

export function LandingPricing() {
  const [period, setPeriod] = useState<(typeof periods)[number]["value"]>(
    "monthly",
  );
  const [plans, setPlans] = useState<SubscriptionPlan[]>(fallbackPlans);
  const [loadError, setLoadError] = useState(false);
  const { setPlan, setAuthModalOpen } = useLanding();

  useEffect(() => {
    let cancelled = false;

    const loadPlans = async () => {
      try {
        const data = await apiClient.get<SubscriptionPlan[]>("/subscriptions/plans");
        if (!cancelled && data.length > 0) {
          setPlans(data);
          setLoadError(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError(true);
        }
      }
    };

    loadPlans();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectPlan = (planId: string) => {
    setPlan(planId, period);
    setAuthModalOpen(true);
  };

  const periodMeta = getPeriodMeta(period);

  return (
    <section className="py-24 px-4 bg-muted/30 relative overflow-hidden">
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary/10 blur-[100px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-primary/10 blur-[100px] pointer-events-none rounded-full" />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-10">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-5xl font-bold tracking-tight mb-4"
          >
            Тарифные планы
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-xl text-muted-foreground"
          >
            Выберите план, который подходит именно вам
          </motion.p>
          {loadError ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Не удалось загрузить тарифы из базы, показан резервный набор.
            </p>
          ) : null}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="flex justify-center mb-12"
        >
          <div className="bg-background border border-border/50 p-1.5 rounded-full inline-flex flex-wrap items-center gap-1 shadow-sm">
            {periods.map((item) => (
              <button
                key={item.value}
                onClick={() => setPeriod(item.value)}
                className={`px-4 py-2 sm:px-6 sm:py-2.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                  period === item.value
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto pt-8">
          {plans.map((plan, index) => {
            const currentMonthlyPrice = plan.prices[period] ?? plan.prices.monthly;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: index * 0.1 + 0.3,
                  type: "spring",
                  stiffness: 100,
                }}
                className="flex relative"
              >
                <Card
                  className={`relative w-full flex flex-col group transition-transform duration-300 hover:-translate-y-2 ${
                    plan.isPopular
                      ? "border-primary shadow-xl shadow-primary/20 scale-105 z-10 overflow-visible"
                      : "border-border/50"
                  }`}
                >
                  {plan.isPopular ? (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 text-sm font-semibold rounded-full shadow-md z-30 whitespace-nowrap">
                      Самый выгодный
                    </div>
                  ) : null}

                  <CardHeader className="text-center pb-2 pt-8">
                    <CardTitle className="text-2xl mt-2">{plan.name}</CardTitle>
                    <CardDescription className="h-4">
                      {periodMeta.label}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 px-6">
                    <div className="flex flex-col items-center justify-center my-6 min-h-[96px]">
                      <div className="text-4xl font-extrabold text-primary flex items-end gap-1">
                        <RollingNumber value={currentMonthlyPrice} />
                        <span className="ml-1">₽</span>
                        <span className="text-lg text-muted-foreground font-medium relative top-[-4px] ml-1">
                          {periodMeta.suffix}
                        </span>
                      </div>
                    </div>

                    <ul className="space-y-4 mb-6">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-3">
                          <div className="bg-primary/10 p-1 rounded-full shrink-0">
                            <Check className="w-4 h-4 text-primary" />
                          </div>
                          <span className="text-sm font-medium">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full cursor-pointer h-12 text-base font-semibold group-hover:shadow-lg transition-all"
                      variant={plan.isPopular ? "default" : "secondary"}
                      onClick={() => handleSelectPlan(plan.id)}
                    >
                      Выбрать тариф
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
