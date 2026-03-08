"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { AnimatePresence, motion } from "motion/react";
import { useLanding } from "@/hooks/useLanding";

const periods = [
  { value: "1", label: "1 месяц" },
  { value: "3", label: "3 месяца" },
  { value: "6", label: "6 месяцев" },
  { value: "12", label: "1 год" },
];

const plans = [
  {
    id: "starter",
    name: "Начальный",
    description: "Для базовых задач",
    basePrice: 349,
    features: [
      "Высокая скорость",
      "Защищенное соединение",
      "Без логов",
      "До 3 устройств",
    ],
  },
  {
    id: "pro",
    name: "Рабочий",
    description: "Для стабильной работы",
    basePrice: 499,
    features: [
      "Максимальная скорость",
      "Защищенное соединение",
      "Без логов",
      "До 5 устройств",
      "Приоритетная поддержка",
    ],
    popular: true,
  },
  {
    id: "advanced",
    name: "Продвинутый",
    description: "Максимум возможностей",
    basePrice: 699,
    features: [
      "Максимальная скорость",
      "Индивидуальный IP",
      "Без логов",
      "До 10 устройств",
      "Поддержка 24/7",
    ],
  },
];

const getDiscount = (period: string) => {
  if (period === "3") return 0.05;
  if (period === "6") return 0.15;
  if (period === "12") return 0.2;
  return 0;
};

// Animated rolling numbers for individual digits
function RollingNumber({ value }: { value: number }) {
  const digits = Math.round(value).toString().split("");

  return (
    <span className="inline-flex overflow-hidden relative">
      <AnimatePresence mode="popLayout" initial={false}>
        {digits.map((digit, i) => (
          <motion.span
            key={`${i}-${digit}`}
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

export function LandingPricing() {
  const [period, setPeriod] = useState("1");
  const { setPlan, setAuthModalOpen } = useLanding();

  const handleSelectPlan = (planId: string) => {
    setPlan(planId, period);
    setAuthModalOpen(true);
  };

  const discount = getDiscount(period);

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
            Выберите план, подходящий именно вам
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="flex justify-center mb-12"
        >
          <div className="bg-background border border-border/50 p-1.5 rounded-full inline-flex flex-wrap items-center gap-1 shadow-sm">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-2 sm:px-6 sm:py-2.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                  period === p.value
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* pt-8 to give room for absolute top tags */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto pt-8">
          {plans.map((plan, i) => {
            const currentMonthlyPrice = plan.basePrice * (1 - discount);
            const isDiscounted = discount > 0;

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.1 + 0.3,
                  type: "spring",
                  stiffness: 100,
                }}
                className="flex relative"
              >
                <Card
                  className={`relative w-full flex flex-col group transition-transform duration-300 hover:-translate-y-2 ${
                    plan.popular
                      ? "border-primary shadow-xl shadow-primary/20 scale-105 z-10 overflow-visible"
                      : "border-border/50"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 text-sm font-semibold rounded-full shadow-md z-30 whitespace-nowrap">
                      Самый выгодный
                    </div>
                  )}

                  <CardHeader className="text-center pb-2 pt-8">
                    <CardTitle className="text-2xl mt-2">{plan.name}</CardTitle>
                    <CardDescription className="h-4">
                      {plan.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 px-6">
                    <div className="flex flex-col items-center justify-center my-6 min-h-[96px]">
                      <AnimatePresence mode="wait">
                        {isDiscounted ? (
                          <motion.div
                            key="discount-badge"
                            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                            animate={{
                              opacity: 1,
                              height: "auto",
                              marginBottom: 16,
                            }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            className="flex items-center gap-2 overflow-hidden"
                          >
                            <span className="text-xl text-muted-foreground line-through decoration-destructive/60 font-semibold">
                              {plan.basePrice} ₽
                            </span>
                            <span className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full">
                              Скидка {Math.round(discount * 100)}%
                            </span>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="no-discount"
                            className="h-[28px]" // Placeholder height to prevent layout jumps
                          />
                        )}
                      </AnimatePresence>

                      <div className="text-4xl font-extrabold text-primary flex items-end gap-1">
                        <RollingNumber value={currentMonthlyPrice} />
                        <span className="ml-1">₽</span>
                        <span className="text-lg text-muted-foreground font-medium relative top-[-4px] ml-1">
                          / мес
                        </span>
                      </div>
                    </div>

                    <ul className="space-y-4 mb-6">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-3">
                          <div className="bg-primary/10 p-1 rounded-full shrink-0">
                            <Check className="w-4 h-4 text-primary" />
                          </div>
                          <span className="text-sm font-medium">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full cursor-pointer h-12 text-base font-semibold group-hover:shadow-lg transition-all"
                      variant={plan.popular ? "default" : "secondary"}
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
