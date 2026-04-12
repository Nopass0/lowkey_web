"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Save, Shield, Globe, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

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
});

export default function ClientRulesAdminPage() {
  const [rules, setRules] = useState<ClientRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<Partial<ClientRule> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<{ rules: ClientRule[] }>("/admin/client-rules");
      setRules(res.rules || []);
    } catch {
      toast.error("Не удалось загрузить правила");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

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
    return "default";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" /> Правила клиентов
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Управление трафиком на всех VPN серверах (JOPA, SOCKS, PIMPAM, Hysteria2)
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Добавить правило
        </Button>
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
