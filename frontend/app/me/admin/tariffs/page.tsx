"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  Plus,
  Settings2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Save,
  X,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiClient } from "@/api/client";
import { SubscriptionPlan } from "@/api/types";
import { Loader } from "@/components/ui/loader";
import { toast } from "sonner";

interface AdminPlan extends SubscriptionPlan {
  slug: string;
  isActive: boolean;
  sortOrder: number;
  prices: Record<string, number>;
}

export default function TariffsAdminPage() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Partial<AdminPlan> | null>(
    null,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      // We use the admin endpoint to get full details including sortOrder and isActive
      const res = await apiClient.get<any[]>("/admin/tariffs");

      const transformed = res.map((plan) => ({
        ...plan,
        prices: (plan.prices || []).reduce(
          (acc: Record<string, number>, p: any) => {
            acc[p.period] = p.price;
            return acc;
          },
          {},
        ),
      })) as AdminPlan[];

      setPlans(transformed);
    } catch (err) {
      console.error(err);
      toast.error("Ошибка при загрузке тарифов");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleEdit = (plan: AdminPlan) => {
    setEditingPlan({ ...plan });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingPlan({
      slug: "",
      name: "",
      features: [],
      isPopular: false,
      isActive: true,
      sortOrder: plans.length + 1,
      prices: {
        monthly: 0,
        "3months": 0,
        "6months": 0,
        yearly: 0,
      },
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
      const pricesArray = Object.entries(editingPlan.prices || {}).map(
        ([period, price]) => ({
          period,
          price,
        }),
      );

      await apiClient.post("/admin/tariffs", {
        ...editingPlan,
        prices: pricesArray,
      });

      toast.success("Тариф сохранен");
      setIsDialogOpen(false);
      fetchPlans();
    } catch (err) {
      console.error(err);
      toast.error("Ошибка при сохранении");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!confirm(`Вы уверены, что хотите удалить тариф ${slug}?`)) return;

    try {
      await apiClient.delete(`/admin/tariffs/${slug}`);
      toast.success("Тариф удален");
      fetchPlans();
    } catch (err) {
      console.error(err);
      toast.error("Ошибка при удалении");
    }
  };

  const updatePrice = (period: string, value: string) => {
    const price = parseFloat(value) || 0;
    setEditingPlan((prev) => ({
      ...prev,
      prices: { ...(prev?.prices || {}), [period]: price },
    }));
  };

  const updateFeature = (index: number, value: string) => {
    const newFeatures = [...(editingPlan?.features || [])];
    newFeatures[index] = value;
    setEditingPlan((prev) => ({ ...prev, features: newFeatures }));
  };

  const addFeature = () => {
    setEditingPlan((prev) => ({
      ...prev,
      features: [...(prev?.features || []), ""],
    }));
  };

  const removeFeature = (index: number) => {
    setEditingPlan((prev) => ({
      ...prev,
      features: (prev?.features || []).filter((_, i) => i !== index),
    }));
  };

  if (isLoading)
    return (
      <div className="flex justify-center p-20">
        <Loader size={48} />
      </div>
    );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <CreditCard className="w-8 h-8 text-primary" />
            Управление тарифами
          </h1>
          <p className="text-muted-foreground">
            Создание и редактирование тарифных планов Lowkey VPN
          </p>
        </div>
        <Button onClick={handleAddNew} className="w-full md:w-auto gap-2">
          <PlusCircle className="w-4 h-4" />
          Добавить тариф
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className="relative overflow-hidden group border-border/50 bg-card/50 backdrop-blur-sm"
          >
            {!plan.isActive && (
              <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                <Badge
                  variant="outline"
                  className="text-lg px-4 py-1 border-destructive text-destructive bg-destructive/5 font-bold uppercase tracking-widest shadow-lg"
                >
                  Неактивен
                </Badge>
              </div>
            )}
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl font-bold">
                      {plan.name}
                    </CardTitle>
                    {plan.isPopular && (
                      <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] py-0 px-2">
                        POPULAR
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="font-mono text-xs uppercase tracking-tighter opacity-70">
                    ID: {plan.slug}
                  </CardDescription>
                </div>
                <div className="flex gap-2 z-20">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleEdit(plan)}
                    className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <Settings2 className="h-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDelete(plan.slug)}
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {["monthly", "3months", "6months", "yearly"].map((period) => (
                    <div
                      key={period}
                      className="p-3 rounded-xl bg-muted/30 border border-border/50 flex flex-col gap-1"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {period === "monthly"
                          ? "1 мес"
                          : period === "3months"
                            ? "3 мес"
                            : period === "6months"
                              ? "6 мес"
                              : "1 год"}
                      </span>
                      <span className="text-lg font-black tracking-tighter">
                        {plan.prices[period] || 0} ₽
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 border-b border-border/50 pb-2">
                    Особенности (Features)
                  </h4>
                  <ul className="grid grid-cols-1 gap-2">
                    {plan.features.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-muted-foreground group/feature"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="truncate">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && (
          <div className="col-span-full py-20 bg-muted/20 border-2 border-dashed border-border/50 rounded-3xl flex flex-col items-center justify-center text-muted-foreground animate-pulse">
            <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-medium">Тарифные планы не найдены</p>
            <Button variant="link" onClick={handleAddNew}>
              Создать первый тариф
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[1100px] w-[95vw] max-h-[95vh] overflow-y-auto p-0 border-none bg-transparent shadow-none">
          <div className="bg-card border border-border/50 rounded-[2rem] shadow-2xl overflow-hidden">
            <div className="p-8 md:p-12">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black tracking-tight">
                  {editingPlan?.slug ? "Редактировать тариф" : "Новый тариф"}
                </DialogTitle>
                <DialogDescription>
                  Настройте параметры тарифного плана и его стоимость для разных
                  периодов.
                </DialogDescription>
              </DialogHeader>

              {editingPlan && (
                <div className="grid gap-8 py-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label
                          htmlFor="slug"
                          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                        >
                          Slug (идентификатор)
                        </Label>
                        <Input
                          id="slug"
                          value={editingPlan.slug}
                          onChange={(e) =>
                            setEditingPlan((prev) => ({
                              ...prev,
                              slug: e.target.value,
                            }))
                          }
                          placeholder="pro"
                          disabled={
                            !!plans.find(
                              (p) => p.id === (editingPlan as any).id,
                            )
                          }
                          className="h-12 bg-muted/20 border-border/50 rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label
                          htmlFor="name"
                          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                        >
                          Название
                        </Label>
                        <Input
                          id="name"
                          value={editingPlan.name}
                          onChange={(e) =>
                            setEditingPlan((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          placeholder="Продвинутый"
                          className="h-12 bg-muted/20 border-border/50 rounded-xl"
                        />
                      </div>
                      <div className="flex items-center gap-8 pt-2">
                        <div className="flex items-center space-x-3">
                          <Label
                            htmlFor="isPopular"
                            className="text-xs font-bold uppercase tracking-widest text-muted-foreground cursor-pointer"
                          >
                            Популярный
                          </Label>
                          <Switch
                            id="isPopular"
                            checked={editingPlan.isPopular}
                            onCheckedChange={(val) =>
                              setEditingPlan((prev) => ({
                                ...prev,
                                isPopular: val,
                              }))
                            }
                          />
                        </div>
                        <div className="flex items-center space-x-3">
                          <Label
                            htmlFor="isActive"
                            className="text-xs font-bold uppercase tracking-widest text-muted-foreground cursor-pointer"
                          >
                            Активен
                          </Label>
                          <Switch
                            id="isActive"
                            checked={editingPlan.isActive}
                            onCheckedChange={(val) =>
                              setEditingPlan((prev) => ({
                                ...prev,
                                isActive: val,
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 p-8 rounded-[2rem] bg-muted/30 border border-border/50 shadow-inner">
                      <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground/50 border-b border-border/50 pb-4 mb-4">
                        Цены в месяц (₽)
                      </h4>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-muted-foreground/70">
                            Ежемесячно
                          </Label>
                          <Input
                            type="number"
                            value={editingPlan.prices?.monthly}
                            onChange={(e) =>
                              updatePrice("monthly", e.target.value)
                            }
                            className="h-10 border-border shadow-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-muted-foreground/70">
                            за 3 мес
                          </Label>
                          <Input
                            type="number"
                            value={editingPlan.prices?.["3months"]}
                            onChange={(e) =>
                              updatePrice("3months", e.target.value)
                            }
                            className="h-10 border-border shadow-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-muted-foreground/70">
                            за 6 мес
                          </Label>
                          <Input
                            type="number"
                            value={editingPlan.prices?.["6months"]}
                            onChange={(e) =>
                              updatePrice("6months", e.target.value)
                            }
                            className="h-10 border-border shadow-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-muted-foreground/70">
                            за 1 год
                          </Label>
                          <Input
                            type="number"
                            value={editingPlan.prices?.yearly}
                            onChange={(e) =>
                              updatePrice("yearly", e.target.value)
                            }
                            className="h-10 border-border shadow-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Особенности тарифа
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={addFeature}
                        className="h-8 text-[10px] font-bold uppercase tracking-wider gap-2"
                      >
                        <Plus className="w-3 h-3" /> Добавить
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(editingPlan.features || []).map((f, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            value={f}
                            onChange={(e) => updateFeature(i, e.target.value)}
                            placeholder="Напр: 3 устройства"
                            className="h-10 bg-muted/20 border-border"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFeature(i)}
                            className="shrink-0 h-10 w-10 hover:text-destructive"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-0 pt-6">
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="rounded-xl px-8 h-12"
                >
                  Отмена
                </Button>
                <Button
                  disabled={isSaving}
                  onClick={handleSave}
                  className="rounded-xl px-10 h-12 bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20"
                >
                  {isSaving ? "Сохранение..." : "Сохранить"}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
