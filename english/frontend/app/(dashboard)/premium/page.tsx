"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Check, Zap, Brain, Mic, Gamepad2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { paymentsApi } from "@/api/client";
import { useAuthStore } from "@/store/auth";
import toast from "react-hot-toast";

export default function PremiumPage() {
  const { user } = useAuthStore();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    paymentsApi.getPlans().then(setPlans).catch(() => {});
    paymentsApi.getSubscription().then(setSubscription).catch(() => {});
  }, []);

  const handleSubscribe = async (planId: string) => {
    setLoading(true);
    try {
      const { confirmationUrl } = await paymentsApi.subscribe(planId);
      if (confirmationUrl) {
        window.location.href = confirmationUrl;
      } else {
        toast.error("Ошибка создания платежа");
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Ошибка оплаты");
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Brain, text: "AI-генерация карточек из любого текста", premium: true },
    { icon: Zap, text: "Настраиваемый OpenRouter AI для мгновенных ответов", premium: true },
    { icon: Mic, text: "Анализ произношения с детальным разбором", premium: true },
    { icon: Gamepad2, text: "Расширенные игровые режимы", premium: true },
    { icon: Star, text: "Неограниченные карточки и наборы", premium: false },
    { icon: Check, text: "Умное повторение (SM-2)", premium: false },
    { icon: Check, text: "Telegram-напоминания", premium: false },
    { icon: Check, text: "Запись и отслеживание произношения", premium: false },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="text-6xl mb-4">👑</motion.div>
        <h1 className="text-3xl font-bold gradient-text mb-2">LowKey English Premium</h1>
        <p className="text-muted-foreground">Разблокируй всю мощь AI для изучения английского</p>
      </div>

      {user?.isPremium ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-6 text-center border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/10">
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="text-xl font-bold text-amber-400 mb-2">У тебя активен Premium!</h2>
          {user.premiumUntil && (
            <p className="text-muted-foreground">
              Активен до {new Date(user.premiumUntil).toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}
        </motion.div>
      ) : (
        <>
          {/* Plans */}
          <div className="grid md:grid-cols-2 gap-4">
            {plans.map((plan, i) => {
              const isPopular = plan.intervalDays >= 365;
              return (
                <motion.div key={plan.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                  className={`glass-card rounded-2xl p-6 relative ${isPopular ? "border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-orange-500/5 neon-glow" : ""}`}>
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge variant="premium" className="px-4 py-1">🔥 Популярный</Badge>
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-lg">{plan.name}</h3>
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                    </div>
                    <Crown className={isPopular ? "text-amber-400" : "text-muted-foreground"} size={24} />
                  </div>
                  <div className="mb-4">
                    <span className="text-4xl font-bold gradient-text">{plan.price.toLocaleString("ru")} ₽</span>
                    <span className="text-muted-foreground text-sm ml-1">/ {plan.intervalDays >= 365 ? "год" : "месяц"}</span>
                    {isPopular && <div className="text-xs text-green-400 mt-1">Экономия 40%</div>}
                  </div>
                  <ul className="space-y-2 mb-6">
                    {plan.features?.map((f: string) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="text-green-400 mt-0.5 flex-shrink-0" size={14} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button variant={isPopular ? "gradient" : "outline"} size="lg" className="w-full"
                    onClick={() => handleSubscribe(plan.id)} disabled={loading}>
                    {loading ? "Загрузка..." : "Подключить"}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* Feature comparison */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="glass-card rounded-2xl p-6">
        <h3 className="font-semibold mb-4">Что входит</h3>
        <div className="space-y-3">
          {features.map((f) => (
            <div key={f.text} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${f.premium ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"}`}>
                <Check size={10} />
              </div>
              <span className="text-sm flex-1">{f.text}</span>
              {f.premium && <Badge variant="premium" className="text-xs">PRO</Badge>}
            </div>
          ))}
        </div>
      </motion.div>

      <p className="text-center text-xs text-muted-foreground">
        Безопасная оплата через ЮKassa. Отмена подписки в любое время.
      </p>
    </div>
  );
}
