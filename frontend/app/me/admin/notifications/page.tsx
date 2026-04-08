"use client";

import { useState } from "react";
import { Bell, Send, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; sent?: number; error?: string } | null>(null);

  async function send(toAll: boolean) {
    if (!title.trim() || !message.trim()) return;
    if (!toAll && !userId.trim()) return;

    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          userIds: toAll ? undefined : [userId.trim()],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, sent: data.sent });
        setTitle("");
        setMessage("");
        setUserId("");
      } else {
        setResult({ ok: false, error: data.message ?? "Ошибка" });
      }
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10 text-primary">
          <Bell className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black">Push-уведомления</h1>
          <p className="text-muted-foreground text-sm">
            Отправка уведомлений пользователям Android-приложения
          </p>
        </div>
      </div>

      <div className="bg-card border border-border/60 rounded-[2rem] p-8 space-y-6">
        <div className="space-y-3">
          <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Заголовок
          </label>
          <Input
            placeholder="Заголовок уведомления"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Текст
          </label>
          <Textarea
            placeholder="Текст уведомления..."
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Конкретный пользователь (ID или пусто = всем)
          </label>
          <Input
            placeholder="UUID пользователя (оставьте пустым для всех)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>

        {result && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-semibold ${
              result.ok
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-destructive/10 text-destructive border border-destructive/20"
            }`}
          >
            {result.ok
              ? `✓ Отправлено ${result.sent} пользователям`
              : `✗ ${result.error}`}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            className="flex-1 gap-2"
            disabled={isLoading || !title.trim() || !message.trim() || !userId.trim()}
            onClick={() => send(false)}
          >
            <User className="w-4 h-4" />
            Отправить пользователю
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-2"
            disabled={isLoading || !title.trim() || !message.trim()}
            onClick={() => send(true)}
          >
            <Users className="w-4 h-4" />
            Отправить всем
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border/60 rounded-[2rem] p-6">
        <p className="text-sm text-muted-foreground">
          <strong>Как работает:</strong> Уведомления доставляются через polling — приложение
          проверяет сервер каждые 15 минут (пока есть интернет). Пользователь увидит
          уведомление в статусной строке Android в течение 15 минут.
        </p>
      </div>
    </div>
  );
}
