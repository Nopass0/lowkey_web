"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const { token } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (token) router.push("/dashboard");
  }, [token]);

  const features = [
    { emoji: "🧠", title: "Умные карточки", desc: "Алгоритм SM-2 запоминает что и когда повторить" },
    { emoji: "🤖", title: "AI-помощник", desc: "BitLLM создаёт карточки из любого слова или текста" },
    { emoji: "🎮", title: "Игра ассоциаций", desc: "Угадывай слова по подсказкам AI и запоминай их" },
    { emoji: "🗣️", title: "Произношение", desc: "Запись и AI-анализ твоего произношения" },
    { emoji: "🎙️", title: "Голосовой дневник", desc: "Записывай себя каждый день и отслеживай прогресс" },
    { emoji: "📱", title: "Telegram-бот", desc: "Ежедневные напоминания прямо в мессенджер" },
  ];

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Hero */}
      <div className="relative min-h-screen flex items-center justify-center">
        <div className="absolute inset-0 animated-gradient opacity-10" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />

        <div className="relative z-10 text-center max-w-3xl mx-4">
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 150 }}
            className="inline-flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-blue-500 flex items-center justify-center text-3xl text-white font-bold shadow-2xl neon-glow">E</div>
            <div className="text-left">
              <div className="text-muted-foreground">LowKey</div>
              <div className="gradient-text text-4xl font-extrabold">English</div>
            </div>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
            Учи английский<br /><span className="gradient-text">умно и весело</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="text-xl text-muted-foreground mb-8">
            AI-карточки, игры, произношение и Telegram-напоминания — всё в одном месте
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="flex gap-4 justify-center">
            <Link href="/register">
              <Button variant="gradient" size="xl">Начать бесплатно 🚀</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="xl">Войти</Button>
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-4 pb-24">
        <h2 className="text-3xl font-bold text-center mb-12">Всё для изучения английского</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }} viewport={{ once: true }}
              className="glass-card rounded-2xl p-6 card-hover">
              <div className="text-4xl mb-4">{f.emoji}</div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
