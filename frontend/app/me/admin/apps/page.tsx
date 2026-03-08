"use client";

import { useState, useEffect, useRef } from "react";
import {
  Package,
  Upload,
  Trash2,
  Star,
  Smartphone,
  Monitor,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "motion/react";
import { useAdminApps } from "@/hooks/useAdminApps";

type Platform = "android" | "windows";

const platformMeta: Record<
  Platform,
  { icon: React.ElementType; name: string; ext: string; color: string }
> = {
  android: {
    icon: Smartphone,
    name: "Android",
    ext: ".apk",
    color: "text-green-500",
  },
  windows: {
    icon: Monitor,
    name: "Windows",
    ext: ".exe",
    color: "text-blue-400",
  },
};

export default function AdminAppsPage() {
  const {
    releases,
    isLoading,
    uploadProgress,
    fetchReleases,
    uploadRelease,
    setLatest,
    deleteRelease,
    getByPlatform,
  } = useAdminApps();
  const [activePlatform, setActivePlatform] = useState<Platform>("android");
  const [showUpload, setShowUpload] = useState(false);
  const [version, setVersion] = useState("");
  const [changelog, setChangelog] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<"success" | "error" | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  const platformReleases = getByPlatform(activePlatform);
  const latestRelease = platformReleases.find((r) => r.isLatest);
  const meta = platformMeta[activePlatform];

  const handleUpload = async () => {
    if (!file || !version.trim()) return;
    const result = await uploadRelease(
      activePlatform,
      version.trim(),
      changelog.trim(),
      file,
    );
    if (result) {
      setUploadResult("success");
      setShowUpload(false);
      setVersion("");
      setChangelog("");
      setFile(null);
    } else setUploadResult("error");
    setTimeout(() => setUploadResult(null), 3000);
  };

  const handleDelete = async (id: string) => {
    await deleteRelease(id);
    setDeleteId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Package className="w-7 h-7 text-primary" />
            Управление приложениями
          </h1>
          <p className="text-muted-foreground mt-1">
            Загрузка и управление релизами для пользователей
          </p>
        </div>
        <Button
          className="rounded-xl shadow-none cursor-pointer font-bold shrink-0"
          onClick={() => setShowUpload(!showUpload)}
        >
          <Upload className="w-4 h-4 mr-2" />
          Загрузить релиз
        </Button>
      </div>

      {/* Upload result */}
      <AnimatePresence>
        {uploadResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold ${uploadResult === "success" ? "bg-green-500/10 border-green-500/25 text-green-600" : "bg-destructive/10 border-destructive/25 text-destructive"}`}
            >
              {uploadResult === "success" ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {uploadResult === "success"
                ? "Релиз успешно загружен!"
                : "Ошибка загрузки. Попробуйте ещё раз."}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload form */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-card border border-border/60 rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Новый релиз</h2>
                <button
                  onClick={() => setShowUpload(false)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Platform selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Платформа
                  </Label>
                  <div className="flex gap-2">
                    {(["android", "windows"] as Platform[]).map((p) => {
                      const m = platformMeta[p];
                      return (
                        <button
                          key={p}
                          onClick={() => setActivePlatform(p)}
                          className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${activePlatform === p ? "bg-primary/10 border-primary/40 text-primary" : "border-border/60 text-muted-foreground hover:border-border"}`}
                        >
                          <m.icon className="w-4 h-4" />
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Version */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Версия
                  </Label>
                  <Input
                    placeholder="1.4.3"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="h-10 font-mono rounded-xl shadow-none border-border/60"
                  />
                </div>
              </div>
              {/* Changelog */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Список изменений
                </Label>
                <textarea
                  value={changelog}
                  onChange={(e) => setChangelog(e.target.value)}
                  placeholder={
                    "• Исправлен баг с подключением\n• Улучшен Kill Switch"
                  }
                  rows={4}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {/* File picker */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Файл ({platformMeta[activePlatform].ext})
                </Label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${file ? "border-primary/40 bg-primary/5" : "border-border/60 hover:border-border"}`}
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-sm font-semibold text-primary">
                      <Package className="w-4 h-4" />
                      {file.name}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({(file.size / 1024 / 1024).toFixed(1)} МБ)
                      </span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      Нажмите или перетащите файл{" "}
                      {platformMeta[activePlatform].ext}
                    </div>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept={platformMeta[activePlatform].ext}
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              {/* Upload progress */}
              {uploadProgress !== null && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Загрузка...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ ease: "linear" }}
                    />
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  className="rounded-xl shadow-none cursor-pointer font-bold"
                  onClick={handleUpload}
                  disabled={!file || !version.trim() || uploadProgress !== null}
                >
                  {uploadProgress !== null ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Загрузка
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Загрузить
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-xl cursor-pointer"
                  onClick={() => setShowUpload(false)}
                >
                  Отмена
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Platform tabs */}
      <div className="flex gap-2">
        {(["android", "windows"] as Platform[]).map((p) => {
          const m = platformMeta[p];
          const rels = getByPlatform(p);
          const latest = rels.find((r) => r.isLatest);
          return (
            <button
              key={p}
              onClick={() => setActivePlatform(p)}
              className={`flex-1 sm:flex-none flex items-center gap-3 px-5 py-3.5 rounded-xl border transition-all cursor-pointer ${activePlatform === p ? "bg-card border-primary/40" : "border-border/60 text-muted-foreground hover:bg-card/50"}`}
            >
              <m.icon
                className={`w-5 h-5 ${activePlatform === p ? m.color : ""}`}
              />
              <div className="text-left">
                <div className="text-sm font-bold">{m.name}</div>
                {latest && (
                  <div className="text-xs text-muted-foreground">
                    v{latest.version}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Release list */}
      <div>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2">
          <meta.icon className={`w-4 h-4 ${meta.color}`} />
          {meta.name} — история релизов
        </h2>
        {isLoading ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Загрузка...
          </div>
        ) : (
          <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
            {platformReleases.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Релизов нет
              </div>
            )}
            {platformReleases.map((rel, i) => (
              <motion.div
                key={rel.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`flex items-center gap-4 px-5 py-4 ${i < platformReleases.length - 1 ? "border-b border-border/40" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm">
                      v{rel.version}
                    </span>
                    {rel.isLatest && (
                      <span className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1">
                        <Star className="w-2.5 h-2.5" />
                        Текущая
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                    <span>
                      {new Date(rel.createdAt).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    <span>{rel.fileSizeMb} МБ</span>
                    <span>
                      {rel.downloadCount.toLocaleString("ru-RU")} скачиваний
                    </span>
                  </div>
                  {rel.changelog && (
                    <pre className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap font-sans leading-relaxed line-clamp-2">
                      {rel.changelog}
                    </pre>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!rel.isLatest && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl shadow-none cursor-pointer h-8 px-3 border-border/60 text-xs font-semibold"
                      onClick={() => setLatest(rel.id)}
                    >
                      <Star className="w-3.5 h-3.5 mr-1" />
                      Сделать текущей
                    </Button>
                  )}
                  {deleteId === rel.id ? (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="rounded-xl shadow-none cursor-pointer h-8 px-3 text-xs"
                        onClick={() => handleDelete(rel.id)}
                      >
                        Удалить
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-xl cursor-pointer h-8 px-2"
                        onClick={() => setDeleteId(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-xl cursor-pointer h-8 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteId(rel.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
