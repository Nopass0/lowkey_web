"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, Send, Trash2, Users, User, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface ClientNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  action: string;
  actionData: string | null;
  targetType: string;
  targetValue: string | null;
  deliveredTo: string[];
  readBy: string[];
  sentAt: string;
}

const emptyNotif = () => ({
  title: "",
  message: "",
  type: "info",
  action: "none",
  actionData: "",
  targetType: "all",
  targetValue: "",
});

export default function PushNotificationsAdminPage() {
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState(emptyNotif());
  const [isSending, setIsSending] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<{ notifications: ClientNotification[]; total: number }>(
        "/admin/client-notifications"
      );
      setNotifications(res.notifications || []);
      setTotal(res.total || 0);
    } catch {
      toast.error("Не удалось загрузить уведомления");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleSend = async () => {
    if (!form.title || !form.message) {
      toast.error("Введите заголовок и сообщение");
      return;
    }
    setIsSending(true);
    try {
      await apiClient.post("/admin/client-notifications", {
        ...form,
        actionData: form.actionData || null,
        targetValue: form.targetValue || null,
      });
      toast.success("Уведомление отправлено");
      setForm(emptyNotif());
      fetchNotifications();
    } catch {
      toast.error("Ошибка отправки");
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/admin/client-notifications/${id}`);
      fetchNotifications();
    } catch {
      toast.error("Ошибка удаления");
    }
  };

  const typeColor = (type: string) => {
    if (type === "error") return "destructive";
    if (type === "warning") return "secondary";
    if (type === "success") return "default";
    return "outline";
  };

  const targetIcon = (targetType: string) => {
    if (targetType === "user") return <User className="h-3 w-3" />;
    if (targetType === "subscription") return <Package className="h-3 w-3" />;
    return <Users className="h-3 w-3" />;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Bell className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Push-уведомления клиентам</h1>
      </div>
      <p className="text-muted-foreground text-sm -mt-4">
        Отправляйте уведомления в приложение Lowkey VPN пользователям
      </p>

      {/* Send form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Новое уведомление</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Заголовок</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Важное обновление"
              />
            </div>
            <div>
              <Label>Тип</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Информация</SelectItem>
                  <SelectItem value="success">Успех</SelectItem>
                  <SelectItem value="warning">Предупреждение</SelectItem>
                  <SelectItem value="error">Ошибка</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Сообщение</Label>
            <Textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Текст уведомления..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Аудитория</Label>
              <Select
                value={form.targetType}
                onValueChange={(v) => setForm((f) => ({ ...f, targetType: v, targetValue: "" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все пользователи</SelectItem>
                  <SelectItem value="subscription">По подписке</SelectItem>
                  <SelectItem value="user">Конкретный пользователь</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.targetType !== "all" && (
              <div>
                <Label>
                  {form.targetType === "subscription" ? "Slug тарифа" : "ID пользователя"}
                </Label>
                <Input
                  value={form.targetValue}
                  onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))}
                  placeholder={form.targetType === "subscription" ? "pro" : "userId..."}
                />
              </div>
            )}

            <div>
              <Label>Действие по нажатию</Label>
              <Select
                value={form.action}
                onValueChange={(v) => setForm((f) => ({ ...f, action: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без действия</SelectItem>
                  <SelectItem value="open_url">Открыть URL</SelectItem>
                  <SelectItem value="switch_tab">Открыть вкладку</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.action !== "none" && (
            <div>
              <Label>
                {form.action === "open_url" ? "URL" : "Название вкладки"}
              </Label>
              <Input
                value={form.actionData}
                onChange={(e) => setForm((f) => ({ ...f, actionData: e.target.value }))}
                placeholder={form.action === "open_url" ? "https://lowkey.su/..." : "billing"}
              />
            </div>
          )}

          <Button onClick={handleSend} disabled={isSending}>
            <Send className="h-4 w-4 mr-2" />
            {isSending ? "Отправка..." : "Отправить"}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <div>
        <h2 className="text-lg font-semibold mb-3">
          История уведомлений ({total})
        </h2>
        {isLoading ? (
          <div className="text-muted-foreground text-sm py-4">Загрузка...</div>
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8 text-muted-foreground">
              Уведомлений ещё не отправлялось
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <Card key={n.id}>
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{n.title}</span>
                      <Badge variant={typeColor(n.type) as any}>{n.type}</Badge>
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        {targetIcon(n.targetType)}
                        {n.targetType === "all"
                          ? "Все"
                          : n.targetType === "subscription"
                          ? `Тариф: ${n.targetValue}`
                          : `User: ${(n.targetValue || "").slice(0, 8)}...`}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Доставлено: {n.deliveredTo?.length ?? 0} | Прочитано: {n.readBy?.length ?? 0}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 truncate">{n.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(n.sentAt), { addSuffix: true, locale: ru })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(n.id)}
                    className="text-destructive ml-4 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
