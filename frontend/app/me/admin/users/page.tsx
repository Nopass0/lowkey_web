"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Users,
  Search,
  Shield,
  ShieldBan,
  Calendar,
  Check,
  X,
  Pencil,
  Loader2,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TablePagination } from "@/components/ui/table-pagination";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";

const PAGE_SIZE = 8;
const planOptions = ["Начальный", "Рабочий", "Продвинутый"];

export default function AdminUsersPage() {
  const {
    users,
    total,
    isLoading,
    fetchUsers,
    toggleBan,
    updateSubscription,
    updateBalance,
  } = useAdminUsers();
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editBalance, setEditBalance] = useState<number>(0);
  const [editRefBalance, setEditRefBalance] = useState<number>(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchUsers(page, PAGE_SIZE, search);
  }, [page, search, fetchUsers]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };
  const startEdit = (u: {
    id: string;
    plan: string | null;
    activeUntil: string | null;
    balance: number;
    referralBalance: number;
  }) => {
    setEditId(u.id);
    setEditPlan(u.plan ?? "");
    setEditDate(u.activeUntil?.slice(0, 10) ?? "");
    setEditBalance(u.balance);
    setEditRefBalance(u.referralBalance);
  };
  const saveEdit = (id: string) => {
    updateSubscription(
      id,
      editPlan || null,
      editDate ? new Date(editDate).toISOString() : null,
    );
    updateBalance(id, editBalance, editRefBalance);
    setEditId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Users className="w-7 h-7 text-primary" />
            Пользователи
          </h1>
          <p className="text-muted-foreground mt-1">Всего: {total}</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по логину"
            className="pl-10 h-10 rounded-xl shadow-none border-border/60 bg-card"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-5 py-3 bg-muted/30 border-b border-border/40 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <div>Логин</div>
          <div>Подписка</div>
          <div>Баланс</div>
          <div>Действия</div>
        </div>

        {isLoading ? (
          <div className="py-16 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Загрузка...
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {users.map((u, i) => (
              <motion.div
                key={u.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`border-b border-border/40 last:border-b-0 ${u.isBanned ? "bg-destructive/5" : ""}`}
              >
                <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-5 py-4 items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">
                        {u.login}
                      </span>
                      {u.isBanned && (
                        <span className="bg-destructive/10 text-destructive text-[10px] font-black px-2 py-0.5 rounded-full">
                          БАН
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      с{" "}
                      {new Date(u.joinedAt).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <div>
                    {u.plan ? (
                      <div>
                        <span className="text-xs font-bold bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                          {u.plan}
                        </span>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          до{" "}
                          {new Date(u.activeUntil!).toLocaleDateString(
                            "ru-RU",
                            { day: "numeric", month: "short", year: "numeric" },
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Нет подписки
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold tabular-nums">
                    <div className="text-foreground">{u.balance} ₽</div>
                    <div className="text-[10px] text-muted-foreground uppercase opacity-80 mt-0.5 tracking-wider">
                      Реф: {u.referralBalance}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/me/admin/users/${u.id}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg shadow-none cursor-pointer h-8 px-3 border-border/60"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg shadow-none cursor-pointer h-8 px-3 border-border/60"
                      onClick={() => startEdit(u)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant={u.isBanned ? "outline" : "destructive"}
                      className="rounded-lg shadow-none cursor-pointer h-8 px-3"
                      onClick={() => toggleBan(u.id)}
                    >
                      {u.isBanned ? (
                        <Shield className="w-3.5 h-3.5" />
                      ) : (
                        <ShieldBan className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
                <AnimatePresence>
                  {editId === u.id && (
                    <motion.div
                      key="edit"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-4 pt-0 bg-muted/20 border-t border-border/40 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <div className="flex-1 flex flex-col sm:flex-row gap-3 w-full">
                          <div className="space-y-1 flex-1">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                              Тариф
                            </label>
                            <select
                              value={editPlan}
                              onChange={(e) => setEditPlan(e.target.value)}
                              className="w-full h-10 rounded-xl bg-background border border-border/60 px-3 text-sm font-medium cursor-pointer outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="">— Без подписки —</option>
                              {planOptions.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1 flex-1">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                              Активна до
                            </label>
                            <Input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="h-10 rounded-xl shadow-none border-border/60 bg-background"
                            />
                          </div>
                          <div className="space-y-1 w-24">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                              Баланс (₽)
                            </label>
                            <Input
                              type="number"
                              value={editBalance}
                              onChange={(e) =>
                                setEditBalance(parseFloat(e.target.value) || 0)
                              }
                              className="h-10 rounded-xl shadow-none border-border/60 bg-background px-2 font-mono text-sm"
                            />
                          </div>
                          <div className="space-y-1 w-24">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                              Реф (₽)
                            </label>
                            <Input
                              type="number"
                              value={editRefBalance}
                              onChange={(e) =>
                                setEditRefBalance(
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-10 rounded-xl shadow-none border-border/60 bg-background px-2 font-mono text-sm text-violet-500"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-4 sm:pt-5">
                          <Button
                            size="sm"
                            onClick={() => saveEdit(u.id)}
                            className="rounded-xl shadow-none cursor-pointer"
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Сохранить
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditId(null)}
                            className="rounded-xl cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        {users.length === 0 && !isLoading && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Пользователи не найдены
          </div>
        )}
        <div className="px-5 pb-4">
          <TablePagination
            page={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onPage={setPage}
          />
        </div>
      </div>
    </div>
  );
}
