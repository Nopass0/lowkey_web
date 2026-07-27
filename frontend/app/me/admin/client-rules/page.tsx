"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Save, Shield, Globe, RefreshCw, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

interface JopaStatus {
  available?: boolean;
  rule_count?: number;
  last_refresh?: string;
  refresh_ttl_sec?: number;
  message?: string;
}

interface ClientRule {
  id: string;
  name: string;
  enabled: boolean;
  userId: string | null;
  domain: string | null;
  ipCidr: string | null;
  port: number | null;
  protocol: string | null;
  action: string;
  redirectTo: string | null;
  reason: string | null;
  priority: number;
  htmlContent: string | null;
  upstreamProxy: string | null;
  upstreamDevice: string | null;
  createdAt: string;
}

const emptyRule = (): Partial<ClientRule> => ({
  name: "",
  enabled: true,
  userId: null,
  domain: null,
  ipCidr: null,
  port: null,
  protocol: null,
  action: "block",
  redirectTo: null,
  reason: null,
  priority: 0,
  htmlContent: null,
  upstreamProxy: null,
  upstreamDevice: null,
});

export default function ClientRulesAdminPage() {
  const [rules, setRules] = useState<ClientRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<Partial<ClientRule> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [jopaStatus, setJopaStatus] = useState<JopaStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<{ rules: ClientRule[] }>("/admin/client-rules/");
      setRules(res.rules || []);
    } catch {
      toast.error("Не удалось загрузить правила");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchJopaStatus = useCallback(async () => {
    try {
      // Бэкенд всегда возвращает 200 (даже если JOPA недоступен), поэтому
      // apiClient не вызовет редирект на логин при недоступности JOPA-сервера.
      const res = await apiClient.get<JopaStatus>("/admin/client-rules/jopa-status");
      if (res.available !== false) {
        setJopaStatus(res);
      }
    } catch {
      // JOPA server недоступен — не критично, просто не показываем статус
    }
  }, []);

  const handleJopaRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await apiClient.post<JopaStatus>("/admin/client-rules/jopa-refresh", {});
      setJopaStatus(res);
      toast.success(`Кэш правил обновлён — ${res.rule_count} правил загружено`);
    } catch {
      toast.error("Не удалось обновить кэш на JOPA-сервере");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRules();
    fetchJopaStatus();
  }, [fetchRules, fetchJopaStatus]);

  const openCreate = () => {
    setEditingRule(emptyRule());
    setIsDialogOpen(true);
  };

  const openEdit = (rule: ClientRule) => {
    setEditingRule({ ...rule });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingRule?.name) {
      toast.error("Введите название правила");
      return;
    }
    setIsSaving(true);
    try {
      if ((editingRule as ClientRule).id) {
        await apiClient.patch(`/admin/client-rules/${(editingRule as ClientRule).id}`, editingRule);
        toast.success("Правило обновлено");
      } else {
        await apiClient.post("/admin/client-rules", editingRule);
        toast.success("Правило создано");
      }
      setIsDialogOpen(false);
      fetchRules();
    } catch {
      toast.error("Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить правило?")) return;
    try {
      await apiClient.delete(`/admin/client-rules/${id}`);
      toast.success("Правило удалено");
      fetchRules();
    } catch {
      toast.error("Ошибка удаления");
    }
  };

  const toggleEnabled = async (rule: ClientRule) => {
    try {
      await apiClient.patch(`/admin/client-rules/${rule.id}`, { enabled: !rule.enabled });
      fetchRules();
    } catch {
      toast.error("Ошибка");
    }
  };

  const actionColor = (action: string) => {
    if (action === "block") return "destructive";
    if (action === "redirect") return "secondary";
    if (action === "inject") return "outline";
    return "default";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" /> Правила клиентов
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Управление трафиком на всех VPN серверах (JOPA, SOCKS, PIMPAM, Hysteria2)
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* JOPA cache status */}
          {jopaStatus && jopaStatus.available !== false && jopaStatus.rule_count !== undefined && (
            <div className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2 border">
              <div className="font-medium text-foreground">JOPA-кэш</div>
              <div>
                {jopaStatus.rule_count} правил
                {jopaStatus.last_refresh && ` · обновлён ${new Date(jopaStatus.last_refresh).toLocaleTimeString("ru")}`}
              </div>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleJopaRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Обновление..." : "Применить на JOPA"}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Добавить правило
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            Правил нет. Создайте первое.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id} className={rule.enabled ? "" : "opacity-50"}>
              <CardContent className="flex items-center justify-between py-4 px-5">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => toggleEnabled(rule)}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{rule.name}</span>
                      <Badge variant={actionColor(rule.action) as any}>
                        {rule.action}
                      </Badge>
                      {rule.userId && (
                        <Badge variant="outline" className="text-xs">
                          User: {rule.userId.slice(0, 8)}...
                        </Badge>
                      )}
                      {!rule.userId && (
                        <Badge variant="outline" className="text-xs">
                          Глобальное
                        </Badge>
                      )}
                      {rule.domain && (
                        <Badge variant="outline" className="text-xs">
                          <Globe className="h-3 w-3 mr-1" />{rule.domain}
                        </Badge>
                      )}
                      {rule.port && (
                        <Badge variant="outline" className="text-xs">
                          :{rule.port}
                        </Badge>
                      )}
                    </div>
                    {rule.reason && (
                      <p className="text-xs text-muted-foreground mt-1">{rule.reason}</p>
                    )}
                    {rule.redirectTo && (
                      <p className="text-xs text-muted-foreground">→ {rule.redirectTo}</p>
                    )}
                    {rule.htmlContent && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Code2 className="h-3 w-3" /> HTML-инъекция
                      </p>
                    )}
                    {rule.upstreamProxy && (
                      <p className="text-xs text-muted-foreground">proxy: {rule.upstreamProxy}</p>
                    )}
                    {rule.upstreamDevice && (
                      <p className="text-xs text-muted-foreground">via dev: {rule.upstreamDevice}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <span className="text-xs text-muted-foreground">p={rule.priority}</span>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(rule)}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(rule.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {(editingRule as ClientRule)?.id ? "Редактировать правило" : "Новое правило"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Название</Label>
                <Input
                  value={editingRule?.name ?? ""}
                  onChange={(e) => setEditingRule((r) => ({ ...r, name: e.target.value }))}
                  placeholder="block-youtube"
                />
              </div>
              <div>
                <Label>Приоритет</Label>
                <Input
                  type="number"
                  value={editingRule?.priority ?? 0}
                  onChange={(e) => setEditingRule((r) => ({ ...r, priority: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Действие</Label>
                <Select
                  value={editingRule?.action ?? "block"}
                  onValueChange={(v) => setEditingRule((r) => ({ ...r, action: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Блокировать</SelectItem>
                    <SelectItem value="allow">Разрешить</SelectItem>
                    <SelectItem value="redirect">Перенаправить</SelectItem>
                    <SelectItem value="inject">HTML-инъекция</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Протокол (опционально)</Label>
                <Select
                  value={editingRule?.protocol ?? "any"}
                  onValueChange={(v) => setEditingRule((r) => ({ ...r, protocol: v === "any" ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Любой" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Любой</SelectItem>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Домен (поддерживает *.example.com)</Label>
              <Input
                value={editingRule?.domain ?? ""}
                onChange={(e) => setEditingRule((r) => ({ ...r, domain: e.target.value || null }))}
                placeholder="*.youtube.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>IP/CIDR (опционально)</Label>
                <Input
                  value={editingRule?.ipCidr ?? ""}
                  onChange={(e) => setEditingRule((r) => ({ ...r, ipCidr: e.target.value || null }))}
                  placeholder="10.0.0.0/8"
                />
              </div>
              <div>
                <Label>Порт (опционально)</Label>
                <Input
                  type="number"
                  value={editingRule?.port ?? ""}
                  onChange={(e) => setEditingRule((r) => ({ ...r, port: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="443"
                />
              </div>
            </div>

            {editingRule?.action === "redirect" && (
              <div>
                <Label>Перенаправить на</Label>
                <Input
                  value={editingRule?.redirectTo ?? ""}
                  onChange={(e) => setEditingRule((r) => ({ ...r, redirectTo: e.target.value || null }))}
                  placeholder="https://lowkey.su/blocked или host:port"
                />
              </div>
            )}

            <div>
              <Label>Причина (опционально)</Label>
              <Input
                value={editingRule?.reason ?? ""}
                onChange={(e) => setEditingRule((r) => ({ ...r, reason: e.target.value || null }))}
                placeholder="Заблокировано по требованию"
              />
            </div>

            <div>
              <Label>Конкретный пользователь (пусто = глобальное)</Label>
              <Input
                value={editingRule?.userId ?? ""}
                onChange={(e) => setEditingRule((r) => ({ ...r, userId: e.target.value || null }))}
                placeholder="userId (оставьте пустым для всех)"
              />
            </div>

            <div>
              <Label>
                HTML-инъекция{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  (вставляется перед &lt;/body&gt; в HTTP-ответах, action=allow/inject)
                </span>
              </Label>
              <Textarea
                value={editingRule?.htmlContent ?? ""}
                onChange={(e) => setEditingRule((r) => ({ ...r, htmlContent: e.target.value || null }))}
                placeholder={`<div style="position:fixed;bottom:16px;right:16px;z-index:9999;background:#0f172a;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px">🔒 Lowkey VPN</div>`}
                className="font-mono text-xs"
                rows={4}
              />
            </div>

            <div>
              <Label>
                Маршрут через TUN-интерфейс{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  (SO_BINDTODEVICE, Linux; для обхода ТСПУ через wg0/tun0)
                </span>
              </Label>
              <Input
                value={editingRule?.upstreamDevice ?? ""}
                onChange={(e) => setEditingRule((r) => ({ ...r, upstreamDevice: e.target.value || null }))}
                placeholder="wg0 или tun0 (имя сетевого интерфейса на сервере)"
              />
            </div>

            <div>
              <Label>
                Upstream SOCKS5 прокси{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  (альтернатива TUN; переопределяет глобальный прокси)
                </span>
              </Label>
              <Input
                value={editingRule?.upstreamProxy ?? ""}
                onChange={(e) => setEditingRule((r) => ({ ...r, upstreamProxy: e.target.value || null }))}
                placeholder="host:port (например 1.2.3.4:1080)"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={editingRule?.enabled ?? true}
                onCheckedChange={(v) => setEditingRule((r) => ({ ...r, enabled: v }))}
              />
              <Label>Активно</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
