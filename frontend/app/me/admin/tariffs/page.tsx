"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CreditCard, Plus, Settings2, Trash2, CheckCircle2, AlertCircle, Save,
  X, PlusCircle, Tag, TestTube2, Rocket, ToggleLeft, ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/api/client";
import { AdminYokassaSettings, SubscriptionPlan } from "@/api/types";
import { Loader } from "@/components/ui/loader";
import { toast } from "sonner";

interface AdminPlan extends SubscriptionPlan {
  slug: string;
  isActive: boolean;
  sortOrder: number;
  prices: Record<string, number>;
  promoActive: boolean;
  promoPrice: number | null;
  promoLabel: string | null;
  promoMaxUses: number | null;
  promoUsed: number;
}

export default function TariffsAdminPage() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Partial<AdminPlan> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [ykMode, setYkMode] = useState<"test" | "production">("test");
  const [testSubscriptionEnabled, setTestSubscriptionEnabled] = useState(false);
  const [sbpProvider, setSbpProvider] = useState<"tochka" | "yookassa">("tochka");
  const [hideAiMenuForAll, setHideAiMenuForAll] = useState(false);
  const [prodCredsReady, setProdCredsReady] = useState(false);
  const [testCredsReady, setTestCredsReady] = useState(false);
  const [ykLoading, setYkLoading] = useState(false);
  const [ykSaving, setYkSaving] = useState(false);

  const fetchPlans = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<any[]>("/admin/tariffs");
      const transformed = res.map((plan) => ({
        ...plan,
        prices: (plan.prices || []).reduce((acc: Record<string, number>, p: any) => {
          acc[p.period] = p.price;
          return acc;
        }, {}),
        promoActive: plan.promoActive ?? false,
        promoPrice: plan.promoPrice ?? null,
        promoLabel: plan.promoLabel ?? null,
        promoMaxUses: plan.promoMaxUses ?? null,
        promoUsed: plan.promoUsed ?? 0,
      })) as AdminPlan[];
      setPlans(transformed);
    } catch (err) {
      toast.error("Ошибка при загрузке тарифов");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchYKSettings = useCallback(async () => {
    setYkLoading(true);
    try {
      const res = await apiClient.get<AdminYokassaSettings>("/admin/yokassa/settings");
      setYkMode(res.mode);
      setTestSubscriptionEnabled(res.testSubscriptionEnabled);
      setSbpProvider(res.sbpProvider);
      setHideAiMenuForAll(res.hideAiMenuForAll);
      setProdCredsReady(res.productionCredentialsConfigured);
      setTestCredsReady(res.testCredentialsConfigured);
    } catch {
      // ignore
    } finally {
      setYkLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
    fetchYKSettings();
  }, [fetchPlans, fetchYKSettings]);

  const handleToggleYKMode = async () => {
    const newMode = ykMode === "test" ? "production" : "test";
    if (newMode === "production" && !prodCredsReady) {
      toast.error("Боевые ключи YooKassa не настроены на сервере");
      return;
    }
    setYkSaving(true);
    try {
      await apiClient.patch("/admin/yokassa/settings", { mode: newMode });
      setYkMode(newMode);
      toast.success(`ЮKassa переключена в режим: ${newMode === "test" ? "Тестовый" : "Боевой"}`);
    } catch {
      toast.error("Ошибка при смене режима ЮKassa");
    } finally {
      setYkSaving(false);
    }
  };

  const handleToggleTestSubscription = async () => {
    setYkSaving(true);
    try {
      const next = !testSubscriptionEnabled;
      await apiClient.patch("/admin/yokassa/settings", {
        testSubscriptionEnabled: next,
      });
      setTestSubscriptionEnabled(next);
      toast.success(next ? "Тестовая подписка включена" : "Тестовая подписка отключена");
    } catch {
      toast.error("Не удалось обновить тестовую подписку");
    } finally {
      setYkSaving(false);
    }
  };

  const handleToggleGlobalAiMenu = async () => {
    setYkSaving(true);
    try {
      const next = !hideAiMenuForAll;
      await apiClient.patch("/admin/yokassa/settings", {
        hideAiMenuForAll: next,
      });
      setHideAiMenuForAll(next);
      toast.success(next ? "AI скрыт у всех пользователей" : "AI снова показывается в меню");
    } catch {
      toast.error("Не удалось обновить глобальную настройку AI");
    } finally {
      setYkSaving(false);
    }
  };

  const handleChangeSbpProvider = async (next: "tochka" | "yookassa") => {
    setYkSaving(true);
    try {
      await apiClient.patch("/admin/yokassa/settings", { sbpProvider: next });
      setSbpProvider(next);
      toast.success(
        next === "yookassa"
          ? "СБП переведён на YooKassa"
          : "СБП переведён на Точка Банк",
      );
    } catch {
      toast.error("Не удалось обновить провайдера СБП");
    } finally {
      setYkSaving(false);
    }
  };

  const handleEdit = (plan: AdminPlan) => {
    setEditingPlan({ ...plan });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingPlan({
      slug: "", name: "", features: [], isPopular: false, isActive: true,
      sortOrder: plans.length + 1,
      prices: { monthly: 0, "3months": 0, "6months": 0, yearly: 0 },
      promoActive: false, promoPrice: null, promoLabel: null, promoMaxUses: null,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingPlan || !editingPlan.slug || !editingPlan.name) {
      toast.error("Заполните основные поля (slug и название)");
      return;
    }
    setIsSaving(true);
    try {
      const pricesArray = Object.entries(editingPlan.prices || {}).map(([period, price]) => ({ period, price }));
      await apiClient.post("/admin/tariffs", {
        ...editingPlan,
        prices: pricesArray,
        promoActive: editingPlan.promoActive ?? false,
        promoPrice: editingPlan.promoActive ? (editingPlan.promoPrice ?? null) : null,
        promoLabel: editingPlan.promoLabel ?? null,
        promoMaxUses: editingPlan.promoMaxUses ?? null,
      });
      toast.success("Тариф сохранён");
      setIsDialogOpen(false);
      fetchPlans();
    } catch {
      toast.error("Ошибка при сохранении");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!confirm(`Удалить тариф ${slug}?`)) return;
    try {
      await apiClient.delete(`/admin/tariffs/${slug}`);
      toast.success("Тариф удалён");
      fetchPlans();
    } catch {
      toast.error("Ошибка при удалении");
    }
  };

  const updatePrice = (period: string, value: string) => {
    setEditingPlan((prev) => ({ ...prev, prices: { ...(prev?.prices || {}), [period]: parseFloat(value) || 0 } }));
  };
  const updateFeature = (index: number, value: string) => {
    const f = [...(editingPlan?.features || [])];
    f[index] = value;
    setEditingPlan((prev) => ({ ...prev, features: f }));
  };
  const addFeature = () => setEditingPlan((prev) => ({ ...prev, features: [...(prev?.features || []), ""] }));
  const removeFeature = (index: number) => setEditingPlan((prev) => ({ ...prev, features: (prev?.features || []).filter((_, i) => i !== index) }));

  if (isLoading) return <div className="flex justify-center p-20"><Loader size={48} /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <CreditCard className="w-8 h-8 text-primary" />
            Управление тарифами
          </h1>
          <p className="text-muted-foreground">Тарифные планы и настройки платёжной системы</p>
        </div>
        <Button onClick={handleAddNew} className="w-full md:w-auto gap-2">
          <PlusCircle className="w-4 h-4" />Добавить тариф
        </Button>
      </div>

      {/* YooKassa mode */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            Режим ЮKassa
          </CardTitle>
          <CardDescription>Переключение между тестовым и боевым магазином</CardDescription>
        </CardHeader>
        <CardContent>
          {ykLoading ? (
            <Loader size={24} />
          ) : (
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-sm ${ykMode === "test" ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-600" : "border-green-500/50 bg-green-500/10 text-green-600"}`}>
                {ykMode === "test" ? <TestTube2 className="w-4 h-4" /> : <Rocket className="w-4 h-4" />}
                {ykMode === "test" ? "Тестовый режим" : "Боевой режим"}
              </div>
              <Button variant="outline" onClick={handleToggleYKMode} disabled={ykSaving} className="h-10 rounded-xl font-semibold">
                {ykSaving ? <Loader size={16} /> : ykMode === "test" ? <><ToggleRight className="w-4 h-4 mr-2" />Включить боевой</> : <><ToggleLeft className="w-4 h-4 mr-2" />Включить тестовый</>}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            {ykMode === "test" ? "Используются тестовые данные (YOKASSA_TEST_SHOP_ID / YOKASSA_TEST_SECRET). Реальных списаний нет." : "⚠️ Используется боевой магазин (YOKASSA_SHOP_ID / YOKASSA_SECRET). Реальные платежи!"}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Глобальные переключатели</CardTitle>
          <CardDescription>Настройки тестовых списаний и общего меню ЛК.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Тестовая подписка 10 ₽ / 2 мин</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Включает отдельный тестовый тариф для проверки автосписаний.
                </div>
              </div>
              <Switch
                checked={testSubscriptionEnabled}
                onCheckedChange={handleToggleTestSubscription}
                disabled={ykSaving}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Скрыть AI у всех</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Убирает AI-вкладку из меню ЛК для всех пользователей.
                </div>
              </div>
              <Switch
                checked={hideAiMenuForAll}
                onCheckedChange={handleToggleGlobalAiMenu}
                disabled={ykSaving}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/50 p-4">
            <div className="font-semibold mb-3">Провайдер СБП</div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={sbpProvider === "tochka" ? "default" : "outline"}
                onClick={() => handleChangeSbpProvider("tochka")}
                disabled={ykSaving}
                className="rounded-xl"
              >
                Точка Банк
              </Button>
              <Button
                type="button"
                variant={sbpProvider === "yookassa" ? "default" : "outline"}
                onClick={() => handleChangeSbpProvider("yookassa")}
                disabled={ykSaving}
                className="rounded-xl"
              >
                YooKassa
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Ключи YooKassa: test {testCredsReady ? "настроены" : "не настроены"}, production {prodCredsReady ? "настроены" : "не настроены"}.
          </p>
        </CardContent>
      </Card>

      {/* Plans grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {plans.map((plan) => (
          <Card key={plan.id} className="relative overflow-hidden group border-border/50 bg-card/50">
            {!plan.isActive && (
              <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                <Badge variant="outline" className="text-lg px-4 py-1 border-destructive text-destructive bg-destructive/5 font-bold uppercase">Неактивен</Badge>
              </div>
            )}
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                    {plan.isPopular && <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] py-0 px-2">POPULAR</Badge>}
                    {plan.promoActive && <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-[10px] py-0 px-2 gap-1"><Tag className="w-2.5 h-2.5" />АКЦИЯ</Badge>}
                  </div>
                  <CardDescription className="font-mono text-xs uppercase tracking-tighter opacity-70">ID: {plan.slug}</CardDescription>
                  {plan.promoActive && plan.promoPrice != null && (
                    <div className="text-xs text-orange-500 font-medium mt-1">
                      {plan.promoLabel ?? "Промо"}: {plan.promoPrice} ₽
                      {plan.promoMaxUses ? ` · ${plan.promoUsed}/${plan.promoMaxUses} использований` : ` · ${plan.promoUsed} использований`}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 z-20">
                  <Button variant="outline" size="icon" onClick={() => handleEdit(plan)} className="h-8 w-8 hover:bg-primary/10 hover:text-primary">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => handleDelete(plan.slug)} className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {["monthly", "3months", "6months", "yearly"].map((period) => (
                    <div key={period} className="p-3 rounded-xl bg-muted/30 border border-border/50 flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {period === "monthly" ? "1 мес" : period === "3months" ? "3 мес" : period === "6months" ? "6 мес" : "1 год"}
                      </span>
                      <span className="text-lg font-black tracking-tighter">{plan.prices[period] || 0} ₽</span>
                    </div>
                  ))}
                </div>
                <ul className="grid grid-cols-1 gap-1.5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && (
          <div className="col-span-full py-20 bg-muted/20 border-2 border-dashed border-border/50 rounded-3xl flex flex-col items-center justify-center text-muted-foreground">
            <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-medium">Тарифные планы не найдены</p>
            <Button variant="link" onClick={handleAddNew}>Создать первый тариф</Button>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">{editingPlan?.slug ? "Редактировать тариф" : "Новый тариф"}</DialogTitle>
            <DialogDescription>Настройте параметры тарифного плана, цены и промо-акцию.</DialogDescription>
          </DialogHeader>

          {editingPlan && (
            <div className="grid gap-6 py-4">
              {/* Basic info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Slug</Label>
                    <Input value={editingPlan.slug} onChange={(e) => setEditingPlan((p) => ({ ...p, slug: e.target.value }))}
                      placeholder="pro" disabled={!!plans.find((p) => p.id === (editingPlan as any).id)}
                      className="h-11 bg-muted/20 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Название</Label>
                    <Input value={editingPlan.name} onChange={(e) => setEditingPlan((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Продвинутый" className="h-11 bg-muted/20 rounded-xl" />
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch id="isPopular" checked={editingPlan.isPopular} onCheckedChange={(v) => setEditingPlan((p) => ({ ...p, isPopular: v }))} />
                      <Label htmlFor="isPopular" className="text-xs font-bold uppercase tracking-widest text-muted-foreground cursor-pointer">Популярный</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch id="isActive" checked={editingPlan.isActive} onCheckedChange={(v) => setEditingPlan((p) => ({ ...p, isActive: v }))} />
                      <Label htmlFor="isActive" className="text-xs font-bold uppercase tracking-widest text-muted-foreground cursor-pointer">Активен</Label>
                    </div>
                  </div>
                </div>

                {/* Prices */}
                <div className="p-5 rounded-2xl bg-muted/30 border border-border/50 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border/50 pb-3">Цены в месяц (₽)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {["monthly", "3months", "6months", "yearly"].map((period) => (
                      <div key={period} className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-muted-foreground/70">
                          {period === "monthly" ? "Ежемесячно" : period === "3months" ? "3 месяца" : period === "6months" ? "6 месяцев" : "1 год"}
                        </Label>
                        <Input type="number" value={editingPlan.prices?.[period] ?? 0} onChange={(e) => updatePrice(period, e.target.value)} className="h-10 shadow-none" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Promo section */}
              <div className="p-5 rounded-2xl border border-orange-500/20 bg-orange-500/5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold flex items-center gap-2"><Tag className="w-4 h-4 text-orange-500" />Промо-акция</h4>
                  <div className="flex items-center gap-2">
                    <Switch id="promoActive" checked={editingPlan.promoActive ?? false} onCheckedChange={(v) => setEditingPlan((p) => ({ ...p, promoActive: v }))} />
                    <Label htmlFor="promoActive" className="text-sm font-semibold cursor-pointer">{editingPlan.promoActive ? "Включена" : "Отключена"}</Label>
                  </div>
                </div>
                {editingPlan.promoActive && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">Промо-цена (₽)</Label>
                      <Input type="number" value={editingPlan.promoPrice ?? ""} onChange={(e) => setEditingPlan((p) => ({ ...p, promoPrice: parseFloat(e.target.value) || null }))}
                        placeholder="50" className="h-10 shadow-none" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">Метка акции</Label>
                      <Input value={editingPlan.promoLabel ?? ""} onChange={(e) => setEditingPlan((p) => ({ ...p, promoLabel: e.target.value || null }))}
                        placeholder="Первый месяц за 50 ₽" className="h-10 shadow-none" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground">Макс. использований</Label>
                      <Input type="number" value={editingPlan.promoMaxUses ?? ""} onChange={(e) => setEditingPlan((p) => ({ ...p, promoMaxUses: parseInt(e.target.value) || null }))}
                        placeholder="∞ неограничено" className="h-10 shadow-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* Features */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Особенности тарифа</Label>
                  <Button variant="ghost" size="sm" onClick={addFeature} className="h-8 text-xs gap-1.5"><Plus className="w-3 h-3" />Добавить</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(editingPlan.features || []).map((f, i) => (
                    <div key={i} className="flex gap-2">
                      <Input value={f} onChange={(e) => updateFeature(i, e.target.value)} placeholder="Напр: 3 устройства" className="h-10 bg-muted/20 border-border" />
                      <Button variant="ghost" size="icon" onClick={() => removeFeature(i)} className="shrink-0 h-10 w-10 hover:text-destructive"><X className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl px-8 h-11">Отмена</Button>
            <Button disabled={isSaving} onClick={handleSave} className="rounded-xl px-10 h-11 font-bold">
              {isSaving ? "Сохранение..." : <><Save className="w-4 h-4 mr-2" />Сохранить</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
