"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, BookOpen, Bot, CreditCard, KeyRound, Save, Send, Shield, TrendingUp, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { adminApi } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

type TabId = "overview" | "users" | "plans" | "ai" | "broadcast";

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [aiSettings, setAiSettings] = useState<any>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [search, setSearch] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [aiForm, setAiForm] = useState({
    model: "",
    baseUrl: "",
    siteName: "",
    siteUrl: "",
    temperature: "0.7",
    maxTokens: "2048",
    apiKey: "",
  });

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/dashboard");
      return;
    }

    loadData();
  }, [router, user]);

  useEffect(() => {
    if (!aiSettings) {
      return;
    }

    setAiForm({
      model: aiSettings.model || "",
      baseUrl: aiSettings.baseUrl || "",
      siteName: aiSettings.siteName || "",
      siteUrl: aiSettings.siteUrl || "",
      temperature: String(aiSettings.temperature ?? 0.7),
      maxTokens: String(aiSettings.maxTokens ?? 2048),
      apiKey: "",
    });
  }, [aiSettings]);

  async function loadData() {
    const [nextStats, nextUsers, nextPlans, nextAiSettings] = await Promise.all([
      adminApi.getStats(),
      adminApi.getUsers({ limit: 50 }),
      adminApi.getPlans(),
      adminApi.getAiSettings(),
    ]).catch(() => [null, [], [], null]);

    setStats(nextStats);
    setUsers(nextUsers);
    setPlans(nextPlans);
    setAiSettings(nextAiSettings);
  }

  async function handleGivePremium(userId: string, days: number) {
    const until = new Date(Date.now() + days * 86400000).toISOString();
    await adminApi.updateUser(userId, { isPremium: true, premiumUntil: until });
    toast.success(`Premium granted for ${days} days`);
    loadData();
  }

  async function handleBroadcast() {
    if (!broadcastMsg.trim()) {
      return;
    }

    setSending(true);
    try {
      const { sent } = await adminApi.broadcast({ message: broadcastMsg, premiumOnly });
      toast.success(`Sent to ${sent} users`);
      setBroadcastMsg("");
    } catch {
      toast.error("Broadcast failed");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveAiSettings() {
    setSavingAi(true);
    try {
      const payload: any = {
        model: aiForm.model.trim(),
        baseUrl: aiForm.baseUrl.trim(),
        siteName: aiForm.siteName.trim(),
        siteUrl: aiForm.siteUrl.trim(),
        temperature: Number.parseFloat(aiForm.temperature) || 0.7,
        maxTokens: Number.parseInt(aiForm.maxTokens, 10) || 2048,
      };

      if (aiForm.apiKey.trim()) {
        payload.apiKey = aiForm.apiKey.trim();
      }

      const saved = await adminApi.updateAiSettings(payload);
      setAiSettings(saved);
      setAiForm((current) => ({ ...current, apiKey: "" }));
      toast.success("AI settings saved");
    } catch {
      toast.error("Failed to save AI settings");
    } finally {
      setSavingAi(false);
    }
  }

  const filteredUsers = users.filter((entry) =>
    !search ||
    entry.name?.toLowerCase().includes(search.toLowerCase()) ||
    entry.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (!user || user.role !== "admin") {
    return null;
  }

  const statCards = stats ? [
    { label: "Users", value: stats.totalUsers, icon: Users, color: "text-blue-400" },
    { label: "Premium", value: stats.premiumUsers, icon: Shield, color: "text-amber-400" },
    { label: "Cards", value: stats.totalCards, icon: BookOpen, color: "text-purple-400" },
    { label: "Active today", value: stats.activeToday, icon: Activity, color: "text-green-400" },
    { label: "Payments", value: stats.totalPayments, icon: CreditCard, color: "text-red-400" },
    { label: "Revenue", value: `${(stats.totalRevenue || 0).toLocaleString("ru")} ₽`, icon: TrendingUp, color: "text-emerald-400" },
  ] : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield size={24} className="text-purple-400" />
        <h1 className="text-2xl font-bold">Admin Panel</h1>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: "overview", label: "Overview" },
          { id: "users", label: `Users (${users.length})` },
          { id: "plans", label: "Plans" },
          { id: "ai", label: "AI / OpenRouter" },
          { id: "broadcast", label: "Broadcast" },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id as TabId)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === item.id
                ? "bg-gradient-to-r from-red-500 to-blue-500 text-white"
                : "bg-accent text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {statCards.map((item) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-2xl p-5 flex items-center gap-4"
            >
              <div className={`p-3 rounded-xl bg-current/10 ${item.color}`}>
                <item.icon size={22} className={item.color} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                <div className="text-xs text-muted-foreground">{item.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="space-y-2">
            {filteredUsers.map((entry) => (
              <div key={entry.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-400 to-blue-400 flex items-center justify-center text-white font-bold flex-shrink-0">
                  {entry.name?.charAt(0) || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{entry.name}</div>
                  <div className="text-sm text-muted-foreground truncate">{entry.email}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{entry.xp || 0} XP</span>
                    <span>{entry.studyStreak || 0} day streak</span>
                    <span>Joined {formatDate(entry.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {entry.isPremium ? (
                    <Badge variant="premium">PRO</Badge>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => handleGivePremium(entry.id, 30)} className="text-xs">
                      + 30 days PRO
                    </Button>
                  )}
                  {entry.role === "admin" && <Badge variant="secondary">Admin</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "plans" && (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="glass-card rounded-xl p-5 flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">{plan.name}</span>
                  <Badge variant={plan.isActive ? "default" : "secondary"}>{plan.isActive ? "Active" : "Disabled"}</Badge>
                </div>
                <div className="text-2xl font-bold gradient-text">{plan.price.toLocaleString("ru")} ₽</div>
                <div className="text-sm text-muted-foreground">{plan.intervalDays} days</div>
                <div className="flex gap-2 flex-wrap mt-2">
                  {plan.features?.map((feature: string) => (
                    <Badge key={feature} variant="outline" className="text-xs">
                      {feature}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await adminApi.updatePlan(plan.id, { isActive: !plan.isActive });
                  loadData();
                  toast.success("Plan updated");
                }}
              >
                {plan.isActive ? "Disable" : "Enable"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {tab === "ai" && (
        <div className="grid lg:grid-cols-[1.25fr_0.75fr] gap-6">
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-blue-400" />
              <h3 className="font-semibold">OpenRouter Runtime</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Model</label>
                <Input value={aiForm.model} onChange={(event) => setAiForm((current) => ({ ...current, model: event.target.value }))} placeholder="openai/gpt-4o-mini" />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Base URL</label>
                <Input value={aiForm.baseUrl} onChange={(event) => setAiForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://openrouter.ai/api/v1" />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Site Name</label>
                <Input value={aiForm.siteName} onChange={(event) => setAiForm((current) => ({ ...current, siteName: event.target.value }))} placeholder="LowKey English" />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Site URL</label>
                <Input value={aiForm.siteUrl} onChange={(event) => setAiForm((current) => ({ ...current, siteUrl: event.target.value }))} placeholder="https://english.lowkey.su" />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Temperature</label>
                <Input value={aiForm.temperature} onChange={(event) => setAiForm((current) => ({ ...current, temperature: event.target.value }))} placeholder="0.7" />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Max tokens</label>
                <Input value={aiForm.maxTokens} onChange={(event) => setAiForm((current) => ({ ...current, maxTokens: event.target.value }))} placeholder="2048" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">OpenRouter API key</label>
              <Input
                type="password"
                value={aiForm.apiKey}
                onChange={(event) => setAiForm((current) => ({ ...current, apiKey: event.target.value }))}
                placeholder={aiSettings?.hasApiKey ? "Leave empty to keep current key" : "sk-or-v1-..."}
              />
              <p className="text-xs text-muted-foreground">
                The key is stored in the English admin settings. Leave this field empty to keep the saved key unchanged.
              </p>
            </div>

            <Button variant="gradient" onClick={handleSaveAiSettings} disabled={savingAi} className="gap-2">
              <Save size={16} />
              {savingAi ? "Saving..." : "Save AI settings"}
            </Button>
          </div>

          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound size={18} className="text-amber-400" />
              <h3 className="font-semibold">Current state</h3>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Provider</span>
                <Badge variant="outline">{aiSettings?.provider || "openrouter"}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">API key</span>
                <Badge variant={aiSettings?.hasApiKey ? "default" : "secondary"}>
                  {aiSettings?.hasApiKey ? (aiSettings?.maskedApiKey || "Configured") : "Missing"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Model</span>
                <span className="text-right break-all">{aiSettings?.model || "Not set"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Source</span>
                <Badge variant="secondary">{aiSettings?.source || "default"}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Updated</span>
                <span>{aiSettings?.updatedAt ? formatDate(aiSettings.updatedAt) : "Not yet saved"}</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/10 p-4 text-sm text-muted-foreground space-y-2">
              <p>All AI endpoints in English now use OpenRouter.</p>
              <p>Bulk generation, flashcard generation, association game, and pronunciation analysis share this configuration.</p>
            </div>
          </div>
        </div>
      )}

      {tab === "broadcast" && (
        <div className="glass-card rounded-2xl p-6 space-y-4 max-w-lg">
          <h3 className="font-semibold flex items-center gap-2">
            <Send size={18} />
            Telegram broadcast
          </h3>
          <textarea
            value={broadcastMsg}
            onChange={(event) => setBroadcastMsg(event.target.value)}
            placeholder="Message text. Markdown is supported."
            rows={5}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="premiumOnly" checked={premiumOnly} onChange={(event) => setPremiumOnly(event.target.checked)} />
            <label htmlFor="premiumOnly" className="text-sm">Only premium users</label>
          </div>
          <Button variant="gradient" onClick={handleBroadcast} disabled={sending || !broadcastMsg.trim()} className="w-full gap-2">
            <Send size={16} />
            {sending ? "Sending..." : "Send broadcast"}
          </Button>
        </div>
      )}
    </div>
  );
}
