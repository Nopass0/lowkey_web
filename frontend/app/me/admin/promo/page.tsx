"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Tag,
  Plus,
  Trash2,
  X,
  Check,
  BarChart2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TablePagination } from "@/components/ui/table-pagination";
import { motion, AnimatePresence } from "motion/react";

// ─── Types ────────────────────────────────────────────────────
type ConditionKey =
  | "new_users_only"
  | "min_topup"
  | "date_range"
  | "max_activations"
  | "no_active_sub"
  | "specific_plan";

type EffectKey =
  | "add_balance"
  | "add_ref_balance"
  | "plan_discount_pct"
  | "plan_discount_fixed"
  | "free_days"
  | "upgrade_plan"
  | "double_next_topup"
  | "extra_devices"
  | "generate_gift_code";

interface Condition {
  key: ConditionKey;
  value?: string;
  value2?: string;
}
interface Effect {
  key: EffectKey;
  value?: string;
}

import { useAdminPromo } from "@/hooks/useAdminPromo";

// ─── Meta ─────────────────────────────────────────────────────
const conditionMeta: Record<
  ConditionKey,
  {
    label: string;
    hasValue?: boolean;
    valuePlaceholder?: string;
    hasValue2?: boolean;
    value2Placeholder?: string;
  }
> = {
  new_users_only: { label: "Только новые пользователи" },
  min_topup: {
    label: "Мин. сумма пополнения",
    hasValue: true,
    valuePlaceholder: "500",
  },
  date_range: {
    label: "Активен с / по дату",
    hasValue: true,
    valuePlaceholder: "2026-03-01",
    hasValue2: true,
    value2Placeholder: "2026-04-30",
  },
  max_activations: {
    label: "Макс. активаций",
    hasValue: true,
    valuePlaceholder: "100",
  },
  no_active_sub: { label: "Только без активной подписки" },
  specific_plan: {
    label: "Только для тарифа",
    hasValue: true,
    valuePlaceholder: "Рабочий",
  },
};

const effectMeta: Record<
  EffectKey,
  { label: string; hasValue?: boolean; valuePlaceholder?: string }
> = {
  add_balance: {
    label: "Начислить баланс (₽)",
    hasValue: true,
    valuePlaceholder: "200",
  },
  add_ref_balance: {
    label: "Начислить реф. баланс (₽)",
    hasValue: true,
    valuePlaceholder: "100",
  },
  plan_discount_pct: {
    label: "Скидка на подписку (%)",
    hasValue: true,
    valuePlaceholder: "20",
  },
  plan_discount_fixed: {
    label: "Скидка на подписку (₽)",
    hasValue: true,
    valuePlaceholder: "150",
  },
  free_days: {
    label: "Бесплатных дней подписки",
    hasValue: true,
    valuePlaceholder: "7",
  },
  upgrade_plan: {
    label: "Сменить тариф на",
    hasValue: true,
    valuePlaceholder: "Продвинутый",
  },
  double_next_topup: { label: "Удвоить следующее пополнение (x2)" },
  extra_devices: {
    label: "Доп. устройств (+N)",
    hasValue: true,
    valuePlaceholder: "2",
  },
  generate_gift_code: { label: "Подарить промокод другу (авто-генерация)" },
};

// Removed mock data

// ─── Helpers ───────────────────────────────────────────────────
function conditionDescription(c: Condition): string {
  const m = conditionMeta[c.key];
  if (c.key === "date_range") return `${m.label}: ${c.value} → ${c.value2}`;
  if (c.value) return `${m.label}: ${c.value}`;
  return m.label;
}
function effectDescription(e: Effect): string {
  const m = effectMeta[e.key];
  if (e.value) return `${m.label.replace(/\(.*?\)/g, "").trim()} — ${e.value}`;
  return m.label;
}

// ─── Main Component ────────────────────────────────────────────
export default function AdminPromoPage() {
  const { promos, total, fetchPromos, createPromo, deletePromo } =
    useAdminPromo();
  const [showForm, setShowForm] = useState(false);
  const [statsId, setStatsId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  useEffect(() => {
    fetchPromos(page, PAGE_SIZE);
  }, [page, fetchPromos]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Form state
  const [code, setCode] = useState("");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [effects, setEffects] = useState<Effect[]>([]);

  const addCondition = (key: ConditionKey) => {
    if (conditions.find((c) => c.key === key)) return;
    setConditions((prev) => [...prev, { key }]);
  };
  const removeCondition = (key: ConditionKey) =>
    setConditions((prev) => prev.filter((c) => c.key !== key));
  const updateCondition = (
    key: ConditionKey,
    field: "value" | "value2",
    val: string,
  ) =>
    setConditions((prev) =>
      prev.map((c) => (c.key === key ? { ...c, [field]: val } : c)),
    );

  const addEffect = (key: EffectKey) => {
    if (effects.find((e) => e.key === key)) return;
    setEffects((prev) => [...prev, { key }]);
  };
  const removeEffect = (key: EffectKey) =>
    setEffects((prev) => prev.filter((e) => e.key !== key));
  const updateEffect = (key: EffectKey, val: string) =>
    setEffects((prev) =>
      prev.map((e) => (e.key === key ? { ...e, value: val } : e)),
    );

  const handleCreate = async () => {
    if (!code.trim() || effects.length === 0) return;
    const maxAct = conditions.find((c) => c.key === "max_activations")?.value;
    const res = await createPromo({
      code: code.trim().toUpperCase(),
      conditions: conditions.map((c) => ({
        key: c.key,
        value: c.value,
        value2: c.value2,
      })),
      effects: effects.map((e) => ({ key: e.key, value: e.value })),
    });
    if (res) {
      setCode("");
      setConditions([]);
      setEffects([]);
      setShowForm(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deletePromo(id);
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Tag className="w-7 h-7 text-primary" />
            Промокоды
          </h1>
          <p className="text-muted-foreground mt-1">
            Создание, статистика и управление промокодами
          </p>
        </div>
        <Button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl shadow-none cursor-pointer font-semibold shrink-0"
        >
          {showForm ? (
            <>
              <X className="w-4 h-4 mr-2" />
              Отмена
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Создать промокод
            </>
          )}
        </Button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-card border border-border/60 rounded-2xl p-6 space-y-6">
              <h2 className="text-base font-bold">Новый промокод</h2>

              {/* Code input */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Код промокода
                </Label>
                <Input
                  placeholder="FRIDAY2026"
                  className="font-mono uppercase tracking-widest text-lg h-12 shadow-none border-border/60 bg-muted/30 rounded-xl"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </div>

              {/* Conditions */}
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Условия активации (комбинируйте)
                </Label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(conditionMeta) as ConditionKey[]).map((key) => {
                    const active = conditions.some((c) => c.key === key);
                    return (
                      <button
                        key={key}
                        onClick={() =>
                          active ? removeCondition(key) : addCondition(key)
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 text-muted-foreground border-border/50 hover:border-primary/50"
                        }`}
                      >
                        {active && <Check className="w-3 h-3 inline mr-1" />}
                        {conditionMeta[key].label}
                      </button>
                    );
                  })}
                </div>
                {/* Condition value inputs */}
                {conditions
                  .filter((c) => conditionMeta[c.key].hasValue)
                  .map((c) => {
                    const m = conditionMeta[c.key];
                    return (
                      <div
                        key={c.key}
                        className="flex gap-3 items-center bg-muted/30 rounded-xl px-4 py-3 border border-border/50"
                      >
                        <span className="text-xs font-semibold text-muted-foreground min-w-[160px]">
                          {m.label}:
                        </span>
                        <Input
                          className="h-8 shadow-none bg-background border-border/60 rounded-lg text-sm"
                          placeholder={m.valuePlaceholder}
                          value={c.value ?? ""}
                          onChange={(e) =>
                            updateCondition(c.key, "value", e.target.value)
                          }
                        />
                        {m.hasValue2 && (
                          <>
                            <span className="text-muted-foreground text-xs">
                              →
                            </span>
                            <Input
                              className="h-8 shadow-none bg-background border-border/60 rounded-lg text-sm"
                              placeholder={m.value2Placeholder}
                              value={c.value2 ?? ""}
                              onChange={(e) =>
                                updateCondition(c.key, "value2", e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Effects */}
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Эффекты (что даёт промокод)
                </Label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(effectMeta) as EffectKey[]).map((key) => {
                    const active = effects.some((e) => e.key === key);
                    return (
                      <button
                        key={key}
                        onClick={() =>
                          active ? removeEffect(key) : addEffect(key)
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          active
                            ? "bg-green-500 text-white border-green-500"
                            : "bg-muted/50 text-muted-foreground border-border/50 hover:border-green-500/50"
                        }`}
                      >
                        {active && <Check className="w-3 h-3 inline mr-1" />}
                        {effectMeta[key].label}
                      </button>
                    );
                  })}
                </div>
                {effects
                  .filter((e) => effectMeta[e.key].hasValue)
                  .map((e) => {
                    const m = effectMeta[e.key];
                    return (
                      <div
                        key={e.key}
                        className="flex gap-3 items-center bg-muted/30 rounded-xl px-4 py-3 border border-border/50"
                      >
                        <span className="text-xs font-semibold text-muted-foreground min-w-[200px]">
                          {m.label}:
                        </span>
                        <Input
                          className="h-8 shadow-none bg-background border-border/60 rounded-lg text-sm"
                          placeholder={m.valuePlaceholder}
                          value={e.value ?? ""}
                          onChange={(ev) =>
                            updateEffect(e.key, ev.target.value)
                          }
                        />
                      </div>
                    );
                  })}
              </div>

              <Button
                onClick={handleCreate}
                disabled={!code.trim() || effects.length === 0}
                className="w-full h-12 rounded-xl shadow-none cursor-pointer font-bold"
              >
                <Plus className="w-4 h-4 mr-2" />
                Создать промокод
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Promo list */}
      <div className="space-y-4">
        {promos.map((promo, i) => (
          <motion.div
            key={promo.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
              {/* Main row */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-black text-xl tracking-wider text-foreground">
                      {promo.code}
                    </span>
                    <span className="text-xs font-semibold bg-muted/60 text-muted-foreground px-2.5 py-1 rounded-full border border-border/50">
                      {promo.activations}
                      {promo.maxActivations
                        ? `/${promo.maxActivations}`
                        : ""}{" "}
                      активаций
                    </span>
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    {promo.totalEffectSummary || "Без эффектов"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Создан: {new Date(promo.createdAt).toLocaleDateString()}
                    {promo.lastActivatedAt &&
                      ` · Последняя активация: ${new Date(promo.lastActivatedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl cursor-pointer h-9 px-3 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setStatsId(statsId === promo.id ? null : promo.id)
                    }
                  >
                    <BarChart2 className="w-4 h-4 mr-1.5" />
                    Подробнее
                    {statsId === promo.id ? (
                      <ChevronUp className="w-3.5 h-3.5 ml-1" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 ml-1" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl cursor-pointer h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteConfirm(promo.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Delete confirm */}
              <AnimatePresence>
                {deleteConfirm === promo.id && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border/40 px-5 py-4 bg-destructive/5 flex items-center justify-between gap-4">
                      <span className="text-sm font-semibold text-destructive">
                        Удалить промокод <strong>{promo.code}</strong>?
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(promo.id)}
                          className="rounded-xl shadow-none cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Удалить
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteConfirm(null)}
                          className="rounded-xl cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Stats expand */}
              <AnimatePresence>
                {statsId === promo.id && (
                  <motion.div
                    key="stats"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border/40 px-5 py-5 grid sm:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                          Условия
                        </h3>
                        {promo.conditions.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            Нет ограничений
                          </p>
                        )}
                        <ul className="space-y-1.5">
                          {promo.conditions.map((c, ci) => (
                            <li
                              key={ci}
                              className="flex items-center gap-2 text-sm"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                              {conditionDescription(c)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                          Эффекты
                        </h3>
                        <ul className="space-y-1.5">
                          {promo.effects.map((e, ei) => (
                            <li
                              key={ei}
                              className="flex items-center gap-2 text-sm"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                              {effectDescription(e)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {/* Progress bar for max activations */}
                      {promo.maxActivations && (
                        <div className="sm:col-span-2">
                          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1.5">
                            <span>Использовано</span>
                            <span>
                              {promo.activations} / {promo.maxActivations}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, (promo.activations / promo.maxActivations) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
        {promos.length === 0 && (
          <div className="py-16 text-center text-muted-foreground text-sm bg-card border border-border/60 rounded-2xl">
            Промокодов нет. Создайте первый!
          </div>
        )}
        {promos.length > 0 && (
          <TablePagination
            page={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onPage={setPage}
          />
        )}
      </div>
    </div>
  );
}
