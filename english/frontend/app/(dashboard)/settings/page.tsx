"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Moon, Sun, Globe, Target, Key, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "next-themes";
import toast from "react-hot-toast";
import { authApi } from "@/api/client";

const LEVELS = [
  { value: "beginner", label: "Начинающий (A1)" },
  { value: "elementary", label: "Элементарный (A2)" },
  { value: "intermediate", label: "Средний (B1)" },
  { value: "upper-intermediate", label: "Выше среднего (B2)" },
  { value: "advanced", label: "Продвинутый (C1)" },
  { value: "proficient", label: "Свободный (C2)" },
];

export default function SettingsPage() {
  const { user, updateUser, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: user?.name || "",
    dailyGoal: user?.dailyGoal || 20,
    notificationsEnabled: user?.notificationsEnabled ?? true,
    notificationTime: user?.notificationTime || "09:00",
    level: user?.level || "beginner",
    nativeLanguage: user?.nativeLanguage || "ru",
  });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUser(form);
      toast.success("Настройки сохранены ✅");
    } catch { toast.error("Ошибка сохранения"); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (passwords.next !== passwords.confirm) { toast.error("Пароли не совпадают"); return; }
    if (passwords.next.length < 6) { toast.error("Пароль минимум 6 символов"); return; }
    try {
      await authApi.changePassword({ currentPassword: passwords.current, newPassword: passwords.next });
      toast.success("Пароль изменён");
      setPasswords({ current: "", next: "", confirm: "" });
    } catch (e: any) { toast.error(e?.response?.data?.error || "Ошибка"); }
  };

  const telegramBotUrl = `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "lowkey_english_bot"}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">⚙️ Настройки</h1>

      {/* Profile */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Globe size={18} />Профиль</h3>
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Имя</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Email</label>
          <Input value={user?.email || ""} disabled className="opacity-50" />
        </div>
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Уровень английского</label>
          <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}
            className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm">
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      </motion.div>

      {/* Learning */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Target size={18} />Обучение</h3>
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Дневная цель (карточек)</label>
          <input type="range" min="5" max="100" step="5" value={form.dailyGoal}
            onChange={(e) => setForm({ ...form, dailyGoal: parseInt(e.target.value) })}
            className="w-full accent-blue-500" />
          <div className="text-center text-sm font-semibold mt-1 gradient-text">{form.dailyGoal} карточек в день</div>
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Bell size={18} />Уведомления</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Ежедневные напоминания</div>
            <div className="text-xs text-muted-foreground">Telegram-бот пришлёт напоминание</div>
          </div>
          <button
            onClick={() => setForm({ ...form, notificationsEnabled: !form.notificationsEnabled })}
            className={`w-12 h-6 rounded-full transition-all duration-300 ${form.notificationsEnabled ? "bg-gradient-to-r from-red-500 to-blue-500" : "bg-secondary"}`}>
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 mx-0.5 ${form.notificationsEnabled ? "translate-x-6" : "translate-x-0"}`} />
          </button>
        </div>
        {form.notificationsEnabled && (
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Время напоминания</label>
            <Input type="time" value={form.notificationTime}
              onChange={(e) => setForm({ ...form, notificationTime: e.target.value })} className="w-32" />
          </div>
        )}
      </motion.div>

      {/* Telegram */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><MessageCircle size={18} />Telegram</h3>
        {user?.telegramId ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <span className="text-green-400 text-xl">✅</span>
            <div>
              <div className="text-sm font-medium text-green-400">Telegram подключён</div>
              {user.telegramUsername && <div className="text-xs text-muted-foreground">@{user.telegramUsername}</div>}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Подключи Telegram для ежедневных напоминаний о повторении карточек</p>
            <a href={telegramBotUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="gap-2 w-full">
                <MessageCircle size={16} />Открыть бот в Telegram
              </Button>
            </a>
          </div>
        )}
      </motion.div>

      {/* Theme */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="glass-card rounded-2xl p-5">
        <h3 className="font-semibold mb-3">Тема оформления</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "dark", label: "Тёмная", icon: Moon, desc: "Удобна ночью" },
            { value: "light", label: "Светлая", icon: Sun, desc: "Удобна днём" },
          ].map((t) => (
            <button key={t.value} onClick={() => setTheme(t.value)}
              className={`p-4 rounded-xl border transition-all text-left ${theme === t.value ? "border-primary bg-accent" : "border-border hover:bg-accent/50"}`}>
              <t.icon size={20} className="mb-2" />
              <div className="font-semibold text-sm">{t.label}</div>
              <div className="text-xs text-muted-foreground">{t.desc}</div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Password */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="glass-card rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Key size={18} />Сменить пароль</h3>
        <Input type="password" placeholder="Текущий пароль" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} />
        <Input type="password" placeholder="Новый пароль" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} />
        <Input type="password" placeholder="Подтвердить новый пароль" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} />
        <Button variant="outline" onClick={handleChangePassword} disabled={!passwords.current || !passwords.next}>Сменить пароль</Button>
      </motion.div>

      <div className="flex gap-3">
        <Button variant="gradient" size="lg" className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? "Сохранение..." : "Сохранить настройки"}
        </Button>
        <Button variant="outline" size="lg" onClick={() => { logout(); }}>Выйти</Button>
      </div>
    </div>
  );
}
