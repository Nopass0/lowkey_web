"use client";

import { useState, useEffect } from "react";
import {
  Copy,
  Check,
  Gift,
  Users,
  Wallet,
  TrendingUp,
  Link2,
  ArrowDownToLine,
  Clock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TablePagination } from "@/components/ui/table-pagination";
import { motion, AnimatePresence } from "motion/react";
import {
  useReferralInfo,
  useReferralList,
  useWithdrawals,
} from "@/hooks/useReferral";

const statusLabel: Record<string, string> = {
  pending: "Ожидает",
  approved: "Одобрена",
  rejected: "Отклонена",
};
const statusColor: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-500",
  approved: "bg-green-500/10 text-green-500",
  rejected: "bg-destructive/10 text-destructive",
};

const REFS_PAGE = 5;

export default function ReferralPage() {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const { info, isLoading: infoLoading, updateBalance } = useReferralInfo();
  const {
    referrals,
    fetchReferrals,
    total: refsTotal,
    isLoading: refsLoading,
  } = useReferralList();
  const { withdrawals, createWithdrawal } = useWithdrawals();

  const [showForm, setShowForm] = useState(false);
  const [wAmount, setWAmount] = useState("");
  const [wTarget, setWTarget] = useState("");
  const [wBank, setWBank] = useState("");
  const [refsPage, setRefsPage] = useState(1);

  useEffect(() => {
    fetchReferrals(refsPage, REFS_PAGE);
  }, [refsPage, fetchReferrals]);

  const referralLink = info?.link || "";
  const totalEarned = info?.totalEarned || 0;
  const refBalance = info?.balance || 0;
  const refsPages = Math.ceil(refsTotal / REFS_PAGE);

  const handleCopyCode = () => {
    if (!info?.code) return;
    navigator.clipboard.writeText(info.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };
  const handleCopyLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleWithdraw = async () => {
    const amt = parseInt(wAmount);
    if (!amt || amt < 100 || amt > refBalance || !wTarget || !wBank) return;
    const res = await createWithdrawal({
      amount: amt,
      target: wTarget,
      bank: wBank,
    });
    if (res) {
      updateBalance(amt);
      setWAmount("");
      setWTarget("");
      setWBank("");
      setShowForm(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Реферальная программа
        </h1>
        <p className="text-muted-foreground mt-1">
          Вы получаете{" "}
          <strong className="text-primary">
            {((info?.rate ?? 0.2) * 100).toFixed(0)}%
          </strong>{" "}
          от каждого пополнения реферала — навсегда
        </p>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          {
            label: "Реферальный баланс",
            value: `${refBalance} ₽`,
            icon: Wallet,
            color: "text-primary",
            bg: "bg-primary/10",
          },
          {
            label: "Рефералов",
            value: String(refsTotal),
            icon: Users,
            color: "text-violet-500",
            bg: "bg-violet-500/10",
          },
          {
            label: "Заработано всего",
            value: `${totalEarned} ₽`,
            icon: TrendingUp,
            color: "text-green-500",
            bg: "bg-green-500/10",
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
          >
            <div className="bg-card border border-border/60 rounded-2xl p-5">
              <div className={`p-2 rounded-xl ${stat.bg} w-fit mb-3`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                {stat.label}
              </div>
              <div
                className={`text-3xl font-black tracking-tight ${stat.color}`}
              >
                {stat.value}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Code & link */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <div className="bg-card border border-border/60 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold">Ваш реферальный код</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-muted/50 border border-border/60 rounded-xl px-5 py-3.5">
              <span className="font-mono text-2xl font-black tracking-[0.25em] text-foreground">
                {info?.code ?? "..."}
              </span>
            </div>
            <Button
              variant="outline"
              onClick={handleCopyCode}
              className="h-14 px-5 rounded-xl font-semibold shadow-none cursor-pointer border-border/60 shrink-0"
            >
              {copiedCode ? (
                <>
                  <Check className="w-4 h-4 mr-2 text-green-500" />
                  Скопировано
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Скопировать
                </>
              )}
            </Button>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              Реферальная ссылка
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-muted/50 border border-border/60 rounded-xl px-4 py-3 font-mono text-sm text-muted-foreground truncate">
                {referralLink}
              </div>
              <Button
                variant="outline"
                onClick={handleCopyLink}
                className="h-11 px-4 rounded-xl shadow-none cursor-pointer border-border/60 shrink-0"
              >
                {copiedLink ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="bg-primary/5 border border-primary/15 rounded-xl px-5 py-4 text-sm text-muted-foreground">
            <span className="font-bold text-foreground">Как это работает:</span>{" "}
            Поделитесь кодом. Когда реферал пополняет баланс —{" "}
            <span className="text-primary font-bold">
              вы получаете {((info?.rate ?? 0.2) * 100).toFixed(0)}%
            </span>{" "}
            от суммы навсегда.
          </div>
        </div>
      </motion.div>

      {/* Withdrawal */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
      >
        <div className="bg-card border border-border/60 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownToLine className="w-5 h-5 text-primary" />
              <h2 className="text-base font-bold">Вывод средств</h2>
            </div>
            <Button
              onClick={() => setShowForm((v) => !v)}
              size="sm"
              className="rounded-xl shadow-none cursor-pointer font-semibold"
              disabled={refBalance < 100}
            >
              {showForm ? (
                <>
                  <X className="w-4 h-4 mr-1.5" />
                  Отмена
                </>
              ) : (
                "Создать заявку"
              )}
            </Button>
          </div>

          <AnimatePresence>
            {showForm && (
              <motion.div
                key="wform"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-muted/40 border border-border/50 rounded-xl p-5 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Сумма (мин. 100 ₽)
                      </Label>
                      <div className="relative">
                        <Input
                          type="number"
                          placeholder="500"
                          min={100}
                          max={refBalance}
                          value={wAmount}
                          onChange={(e) => setWAmount(e.target.value)}
                          className="pr-8 shadow-none bg-background border-border/60 rounded-xl"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          ₽
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Доступно: <strong>{refBalance} ₽</strong>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Банк
                      </Label>
                      <Input
                        placeholder="Сбербанк"
                        value={wBank}
                        onChange={(e) => setWBank(e.target.value)}
                        className="shadow-none bg-background border-border/60 rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Номер карты или телефона
                    </Label>
                    <Input
                      placeholder="+7 999 000-00-00 или 4276 **** **** ****"
                      value={wTarget}
                      onChange={(e) => setWTarget(e.target.value)}
                      className="shadow-none bg-background border-border/60 rounded-xl"
                    />
                  </div>
                  <Button
                    onClick={handleWithdraw}
                    disabled={
                      parseInt(wAmount) < 100 ||
                      parseInt(wAmount) > refBalance ||
                      !wTarget ||
                      !wBank
                    }
                    className="w-full shadow-none rounded-xl cursor-pointer"
                  >
                    <ArrowDownToLine className="w-4 h-4 mr-2" />
                    Отправить заявку
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {withdrawals.length > 0 && (
            <div className="border border-border/60 rounded-xl overflow-hidden">
              {withdrawals.map((w, i) => (
                <div
                  key={w.id}
                  className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors ${i < withdrawals.length - 1 ? "border-b border-border/40" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">
                      {w.amount} ₽ → {w.target}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {w.bank} ·{" "}
                      {new Date(w.createdAt).toLocaleDateString("ru-RU")}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${statusColor[w.status]}`}
                  >
                    {statusLabel[w.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Referrals table with pagination */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <Users className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-xl font-bold tracking-tight">Мои рефералы</h2>
        </div>
        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-4 gap-4 px-5 py-3 bg-muted/30 border-b border-border/40 text-xs font-bold text-muted-foreground uppercase tracking-wider">
            <div>Пользователь</div>
            <div>Дата</div>
            <div>Тариф</div>
            <div className="text-right">Заработано</div>
          </div>
          {referrals.map((ref, i) => (
            <div
              key={ref.id}
              className={`grid grid-cols-4 gap-4 px-5 py-4 items-center hover:bg-muted/30 transition-colors ${i < referrals.length - 1 ? "border-b border-border/40" : ""}`}
            >
              <div className="font-mono font-semibold text-sm">
                {ref.maskedLogin}
              </div>
              <div className="text-sm text-muted-foreground">
                {new Date(ref.joinedAt).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "short",
                })}
              </div>
              <div>
                <span className="text-xs font-semibold bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                  {ref.planName || "Нет"}
                </span>
              </div>
              <div className="text-right font-bold text-green-500 text-sm">
                +{ref.earned} ₽
              </div>
            </div>
          ))}
          <div className="px-5 pb-4">
            <TablePagination
              page={refsPage}
              totalPages={refsPages}
              totalItems={refsTotal}
              pageSize={REFS_PAGE}
              onPage={setRefsPage}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
