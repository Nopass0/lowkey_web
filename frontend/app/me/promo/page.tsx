"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Copy,
  Check,
  Gift,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { usePromo } from "@/hooks/usePromo";
import { TablePagination } from "@/components/ui/table-pagination";

const PAGE_SIZE = 10;

export default function PromoPage() {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const {
    activatePromo,
    isActivating,
    activationResult,
    history,
    historyTotal,
    isHistoryLoading,
    fetchHistory,
  } = usePromo();

  useEffect(() => {
    fetchHistory(page, PAGE_SIZE);
  }, [page, fetchHistory]);

  const handleActivate = async () => {
    const ok = await activatePromo(code);
    if (ok) {
      setCode("");
      fetchHistory(1, PAGE_SIZE);
      setPage(1);
    }
  };

  const handleCopy = (c: string) => {
    navigator.clipboard.writeText(c);
    setCopied(c);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Промокоды</h1>
        <p className="text-muted-foreground mt-1">
          Активируйте купон для получения бонусов или скидок
        </p>
      </div>

      {/* Activation block */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="bg-card border border-border/60 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-xl">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold">Активация промокода</h2>
              <p className="text-sm text-muted-foreground">
                Получите баланс или премиум статус
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Input
              placeholder="FRIDAY2026"
              className="uppercase font-mono text-lg tracking-widest bg-muted/40 focus-visible:bg-transparent border-border/60 shadow-none h-14"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) =>
                e.key === "Enter" && code.length >= 3 && handleActivate()
              }
            />
            <Button
              size="lg"
              disabled={code.length < 3 || isActivating}
              className="px-6 cursor-pointer shadow-none h-14 rounded-xl font-bold shrink-0"
              onClick={handleActivate}
            >
              {isActivating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Активировать
            </Button>
          </div>

          {/* Activation result */}
          <AnimatePresence>
            {activationResult && (
              <motion.div
                key="result"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold ${
                    activationResult.success
                      ? "bg-green-500/10 border-green-500/25 text-green-600"
                      : "bg-destructive/10 border-destructive/25 text-destructive"
                  }`}
                >
                  {activationResult.success ? (
                    <CheckCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  {activationResult.message}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* History */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">История активаций</h2>
        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
          {isHistoryLoading ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Загрузка...
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Активаций пока нет
            </div>
          ) : (
            <>
              {history.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className={`flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors ${i < history.length - 1 ? "border-b border-border/40" : ""}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Gift className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">
                          {p.code}
                        </span>
                        <button
                          onClick={() => handleCopy(p.code)}
                          className="text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                        >
                          {copied === p.code ? (
                            <Check className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-sm text-muted-foreground font-medium mt-0.5">
                        {p.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground font-semibold bg-muted/50 px-3 py-1.5 rounded-xl border border-border/50 shrink-0">
                    {new Date(p.activatedAt).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </motion.div>
              ))}
              <div className="px-5 pb-4">
                <TablePagination
                  page={page}
                  totalPages={Math.ceil(historyTotal / PAGE_SIZE)}
                  totalItems={historyTotal}
                  pageSize={PAGE_SIZE}
                  onPage={(p) => setPage(p)}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
