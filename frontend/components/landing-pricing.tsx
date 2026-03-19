"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { SubscriptionPlan } from "@/api/types";
import { fallbackPlans, fetchPublicPlans } from "@/lib/public-plans";
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

function RollingNumber({ value }: { value: number }) {
  const digits = Math.round(value).toString().split("");

  return (
    <span className="relative inline-flex overflow-hidden">
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

interface LandingPricingProps {
  initialPlans?: SubscriptionPlan[];
}

export function LandingPricing({
  initialPlans = fallbackPlans,
}: LandingPricingProps) {
  const [period, setPeriod] = useState<(typeof periods)[number]["value"]>(
    "monthly",
  );
  const [plans, setPlans] = useState<SubscriptionPlan[]>(initialPlans);
  const [loadError, setLoadError] = useState(false);
  const { setPlan, setAuthModalOpen } = useLanding();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const data = await fetchPublicPlans();
      if (!cancelled) {
        setPlans(data);
        setLoadError(data === fallbackPlans);
      }
    };

    void run();

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
    <section className="relative overflow-hidden bg-muted/30 px-4 py-24">
      <div className="pointer-events-none absolute top-0 right-1/4 h-96 w-96 rounded-full bg-primary/10 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-4 text-3xl font-bold tracking-tight md:text-5xl"
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
            Стоимость на сайте синхронизирована с базой данных
          </motion.p>
          {loadError ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Публичный API временно недоступен, поэтому показан резервный набор
              тарифов.
            </p>
          ) : null}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mb-12 flex justify-center"
        >
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border/50 bg-background p-1.5 shadow-sm">
            {periods.map((item) => (
              <button
                key={item.value}
                onClick={() => setPeriod(item.value)}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-all sm:px-6 sm:py-2.5 ${
                  period === item.value
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </motion.div>

        <div className="mx-auto grid max-w-5xl gap-8 pt-8 md:grid-cols-3">
          {plans.map((plan, index) => {
            const currentMonthlyPrice =
              plan.prices[period] ?? plan.prices.monthly;

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
                className="relative flex"
              >
                <Card
                  className={`group relative flex w-full flex-col transition-transform duration-300 hover:-translate-y-2 ${
                    plan.isPopular
                      ? "z-10 scale-105 overflow-visible border-primary shadow-xl shadow-primary/20"
                      : "border-border/50"
                  }`}
                >
                  {plan.isPopular ? (
                    <div className="absolute -top-4 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-4 py-1 text-sm font-semibold text-primary-foreground shadow-md">
                      Самый выгодный
                    </div>
                  ) : null}

                  <CardHeader className="pb-2 pt-8 text-center">
                    <CardTitle className="mt-2 text-2xl">{plan.name}</CardTitle>
                    <CardDescription className="h-4">
                      {periodMeta.label}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 px-6">
                    <div className="my-6 flex min-h-[96px] flex-col items-center justify-center">
                      <div className="flex items-end gap-1 text-4xl font-extrabold text-primary">
                        <RollingNumber value={currentMonthlyPrice} />
                        <span className="ml-1">₽</span>
                        <span className="relative top-[-4px] ml-1 text-lg font-medium text-muted-foreground">
                          {periodMeta.suffix}
                        </span>
                      </div>
                    </div>

                    <ul className="mb-6 space-y-4">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-3">
                          <div className="shrink-0 rounded-full bg-primary/10 p-1">
                            <Check className="h-4 w-4 text-primary" />
                          </div>
                          <span className="text-sm font-medium">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="h-12 w-full cursor-pointer text-base font-semibold transition-all group-hover:shadow-lg"
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
