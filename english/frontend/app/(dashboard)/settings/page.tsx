"use client";
import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Bell, Moon, Sun, Globe, Target, Key, MessageCircle, Camera, User } from "lucide-react";
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
  const { user, updateUser, setUser, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
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
      toast.success("Настройки сохранены");
    } catch { toast.error("Ошибка сохранения"); }
    finally { setSaving(false); }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const updated = await authApi.uploadAvatar(file);
      setUser(updated);
      toast.success("Фото обновлено");
    } catch { toast.error("Ошибка загрузки фото"); }
    finally { setAvatarUploading(false); if (avatarInputRef.current) avatarInputRef.current.value = ""; }
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
  const initials = user?.name?.charAt(0).toUpperCase() || "?";

  return (
    <div className="max-w-2xl mx-auto space-y-5 page-enter">

      {/* Avatar + profile hero */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg overflow-hidden">
              {user?.avatarUrl
                ? <img src={user.avatarUrl} className="w-full h-full object-cover" alt="Avatar" />
                : initials
              }
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-primary flex items-center justify-center text-white shadow-md hover:brightness-110 transition-all disabled:opacity-50"
            >
              {avatarUploading
                ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Camera size={12} />
              }
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-lg truncate">{user?.name}</div>
            <div className="text-sm text-muted-foreground truncate">{user?.email}</div>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-accent">
              <User size={11} className="text-muted-foreground" />
              <span className="text-muted-foreground">{LEVELS.find(l => l.value === (user?.level || "beginner"))?.label || "Начинающий"}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Имя</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Уровень английского</label>
            <select
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            >
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>
      </motion.div>

      {/* Learning goal */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-sm"><Target size={16} className="text-primary" />Цель обучения</h3>
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Карточек в день</span>
            <span className="text-sm font-bold gradient-text">{form.dailyGoal}</span>
          </div>
          <input type="range" min="5" max="100" step="5" value={form.dailyGoal}
            onChange={(e) => setForm({ ...form, dailyGoal: parseInt(e.target.value) })}
            className="w-full accent-blue-500 h-1.5 rounded-full" />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>5</span><span>25</span><span>50</span><span>75</span><span>100</span>
          </div>
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-sm"><Bell size={16} className="text-primary" />Уведомления</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Ежедневные напоминания</div>
            <div className="text-xs text-muted-foreground">Telegram-бот пришлёт напоминание</div>
          </div>
          <button
            onClick={() => setForm({ ...form, notificationsEnabled: !form.notificationsEnabled })}
            className={`relative w-11 h-6 rounded-full transition-all duration-300 ${form.notificationsEnabled ? "bg-primary" : "bg-secondary"}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${form.notificationsEnabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
        {form.notificationsEnabled && (
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Время напоминания</label>
            <Input type="time" value={form.notificationTime}
              onChange={(e) => setForm({ ...form, notificationTime: e.target.value })} className="w-32" />
          </div>
        )}
      </motion.div>

      {/* Telegram */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
        className="glass-card rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2 text-sm"><MessageCircle size={16} className="text-primary" />Telegram</h3>
        {user?.telegramId ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
              <MessageCircle size={14} className="text-green-400" />
            </div>
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
                <MessageCircle size={15} />Открыть бот в Telegram
              </Button>
            </a>
          </div>
        )}
      </motion.div>

      {/* Theme */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl p-5">
        <h3 className="font-semibold mb-3 text-sm">Тема оформления</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "dark", label: "Тёмная", icon: Moon, desc: "Комфортна ночью" },
            { value: "light", label: "Светлая", icon: Sun, desc: "Комфортна днём" },
          ].map((t) => (
            <button key={t.value} onClick={() => setTheme(t.value)}
              className={`p-4 rounded-xl border transition-all text-left ${theme === t.value ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}>
              <t.icon size={18} className={`mb-2 ${theme === t.value ? "text-primary" : "text-muted-foreground"}`} />
              <div className="font-semibold text-sm">{t.label}</div>
              <div className="text-xs text-muted-foreground">{t.desc}</div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Password */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
        className="glass-card rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2 text-sm"><Key size={16} className="text-primary" />Сменить пароль</h3>
        <Input type="password" placeholder="Текущий пароль" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} />
        <Input type="password" placeholder="Новый пароль" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} />
        <Input type="password" placeholder="Подтвердить новый пароль" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} />
        <Button variant="outline" size="sm" onClick={handleChangePassword} disabled={!passwords.current || !passwords.next}>
          Сменить пароль
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
        className="flex gap-3 pb-6">
        <Button variant="gradient" size="lg" className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? "Сохранение..." : "Сохранить настройки"}
        </Button>
        <Button variant="outline" size="lg" onClick={() => logout()}>Выйти</Button>
      </motion.div>
    </div>
  );
}
