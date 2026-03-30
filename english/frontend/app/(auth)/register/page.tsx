"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Пароль минимум 6 символов"); return; }
    setLoading(true);
    try {
      await register(email, password, name);
      toast.success("Аккаунт создан! Начнём учиться 🎉");
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  const levels = ["beginner", "elementary", "intermediate", "upper-intermediate", "advanced"];

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      <div className="absolute inset-0 animated-gradient opacity-5" />
      <div className="absolute top-20 right-20 w-64 h-64 bg-red-500/20 rounded-full blur-3xl animate-pulse-slow" />
      <div className="absolute bottom-20 left-20 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: "1.5s" }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-blue-500 flex items-center justify-center text-2xl text-white font-bold shadow-lg">
              E
            </div>
            <div className="text-left">
              <div className="text-muted-foreground text-sm">LowKey</div>
              <div className="gradient-text text-2xl font-extrabold">English</div>
            </div>
          </Link>
          <p className="text-muted-foreground">Начни свой путь к свободному английскому 🚀</p>
        </div>

        <div className="glass-card rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold mb-6">Создать аккаунт</h2>

          {/* Benefits */}
          <div className="mb-6 grid grid-cols-3 gap-2 text-center">
            {[
              { emoji: "🧠", text: "Умные карточки" },
              { emoji: "🤖", text: "AI-помощник" },
              { emoji: "🎮", text: "Игры" },
            ].map((b) => (
              <div key={b.text} className="p-2 rounded-xl bg-accent/50 text-xs">
                <div className="text-lg mb-1">{b.emoji}</div>
                <div className="text-muted-foreground">{b.text}</div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} className="pl-10" required minLength={2} />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" required />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                type={showPass ? "text" : "password"}
                placeholder="Пароль (минимум 6 символов)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10"
                required
                minLength={6}
              />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Создаём...
                </span>
              ) : (
                <span className="flex items-center gap-2"><Sparkles size={16} />Начать бесплатно</span>
              )}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-6">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="gradient-text font-semibold hover:underline">Войти</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
