"use client";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth";

export default function PaymentSuccessPage() {
  const router = useRouter();
  const { fetchMe } = useAuthStore();

  useEffect(() => {
    fetchMe();
    const t = setTimeout(() => router.push("/dashboard"), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="text-center max-w-md mx-4">
        <motion.div initial={{ rotate: -180, scale: 0 }} animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }} className="text-8xl mb-6">
          🎉
        </motion.div>
        <h1 className="text-3xl font-bold gradient-text mb-3">Premium активирован!</h1>
        <p className="text-muted-foreground mb-8">
          Добро пожаловать в Premium! Теперь у тебя есть доступ ко всем функциям LowKey English, включая быстрый AI и анализ произношения.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="gradient" size="lg" onClick={() => router.push("/dashboard")}>
            Начать учиться
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-6">Автоматический переход через 5 секунд...</p>
      </motion.div>
    </div>
  );
}
