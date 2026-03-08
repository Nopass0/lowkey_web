"use client";

import { useState, useEffect } from "react";
import { Receipt, Check, X, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TablePagination } from "@/components/ui/table-pagination";
import { useAdminWithdrawals } from "@/hooks/useAdminWithdrawals";
import { motion } from "motion/react";

const PAGE_SIZE = 6;

type WStatus = "pending" | "approved" | "rejected";
const statusLabel: Record<WStatus, string> = {
  pending: "Ожидает",
  approved: "Одобрена",
  rejected: "Отклонена",
};
const statusColor: Record<WStatus, string> = {
  pending: "bg-amber-500/10 text-amber-500",
  approved: "bg-green-500/10 text-green-500",
  rejected: "bg-destructive/10 text-destructive",
};

export default function AdminWithdrawalsPage() {
  const { withdrawals, total, isLoading, fetchWithdrawals, approve, reject } =
    useAdminWithdrawals();
  const [pendingPage, setPendingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [currentFilter, setCurrentFilter] = useState<"pending" | "done">(
    "pending",
  );

  useEffect(() => {
    if (currentFilter === "pending")
      fetchWithdrawals("pending", pendingPage, PAGE_SIZE);
    else fetchWithdrawals(undefined, historyPage, PAGE_SIZE);
  }, [pendingPage, historyPage, currentFilter, fetchWithdrawals]);

  const allPending = withdrawals.filter((w) => w.status === "pending");
  const allDone = withdrawals.filter((w) => w.status !== "pending");
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleApprove = async (id: string) => {
    await approve(id);
    fetchWithdrawals("pending", pendingPage, PAGE_SIZE);
  };
  const handleReject = async (id: string) => {
    await reject(id);
    fetchWithdrawals("pending", pendingPage, PAGE_SIZE);
  };

  // Counts from API (rough estimates from the current page data)
  const pendingCount = withdrawals.filter((w) => w.status === "pending").length;
  const approvedCount = withdrawals.filter(
    (w) => w.status === "approved",
  ).length;
  const rejectedCount = withdrawals.filter(
    (w) => w.status === "rejected",
  ).length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Receipt className="w-7 h-7 text-primary" />
          Заявки на вывод
        </h1>
        <p className="text-muted-foreground mt-1">
          Управление реферальными выплатами
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Ожидают", value: pendingCount, color: "text-amber-500" },
          { label: "Одобрено", value: approvedCount, color: "text-green-500" },
          {
            label: "Отклонено",
            value: rejectedCount,
            color: "text-destructive",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-card border border-border/60 rounded-2xl p-5 text-center"
          >
            <div className={`text-4xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Pending */}
      <div className="space-y-3">
        <h2 className="text-base font-bold flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-500" />
          Ожидают рассмотрения
        </h2>
        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Загрузка...
            </div>
          ) : (
            <>
              {allPending.map((r, i) => (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4 ${i < allPending.length - 1 ? "border-b border-border/40" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono font-bold">{r.userLogin}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-bold">{r.amount} ₽</span>
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-3">
                      <span>{r.target}</span>
                      <span className="text-border">·</span>
                      <span>{r.bank}</span>
                      <span className="text-border">·</span>
                      <span>{r.createdAt.slice(0, 10)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(r.id)}
                      className="rounded-xl shadow-none cursor-pointer bg-green-500 hover:bg-green-500/90 text-white font-semibold"
                    >
                      <Check className="w-4 h-4 mr-1.5" />
                      Одобрить
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(r.id)}
                      className="rounded-xl shadow-none cursor-pointer font-semibold"
                    >
                      <X className="w-4 h-4 mr-1.5" />
                      Отклонить
                    </Button>
                  </div>
                </motion.div>
              ))}
              {allPending.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Нет ожидающих заявок
                </div>
              )}
              <div className="px-5 pb-4">
                <TablePagination
                  page={pendingPage}
                  totalPages={totalPages}
                  totalItems={total}
                  pageSize={PAGE_SIZE}
                  onPage={setPendingPage}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* History */}
      {allDone.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-muted-foreground">История</h2>
          <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
            {allDone.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center gap-4 px-5 py-4 ${i < allDone.length - 1 ? "border-b border-border/40" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono font-bold text-sm">
                      {r.userLogin}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-bold text-sm">{r.amount} ₽</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.target} · {r.bank} · {r.createdAt.slice(0, 10)}
                  </div>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColor[r.status as WStatus]}`}
                >
                  {statusLabel[r.status as WStatus]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
