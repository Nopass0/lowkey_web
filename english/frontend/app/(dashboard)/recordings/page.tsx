"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Play, Pause, Trash2, Clock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordingsApi } from "@/api/client";
import { formatDate, formatDuration, cn } from "@/lib/utils";
import toast from "react-hot-toast";

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTitle, setRecordingTitle] = useState("");
  const [audioTime, setAudioTime] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showNewRecording, setShowNewRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [recs, st] = await Promise.all([
      recordingsApi.getAll({ limit: 30 }),
      recordingsApi.getStats(),
    ]).catch(() => [[], null]);
    setRecordings(recs);
    setStats(st);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setAudioTime(0);

      timerRef.current = setInterval(() => setAudioTime((t) => t + 1), 1000);

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        clearInterval(timerRef.current);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await saveRecording(blob);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch {
      toast.error("Нет доступа к микрофону");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const saveRecording = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      formData.append("title", recordingTitle || `Запись ${new Date().toLocaleDateString("ru")}`);
      formData.append("type", "diary");
      formData.append("duration", String(audioTime));
      await recordingsApi.upload(formData);
      toast.success("Запись сохранена! 🎙️");
      setRecordingTitle("");
      setAudioTime(0);
      setShowNewRecording(false);
      loadData();
    } catch {
      toast.error("Ошибка сохранения");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить запись?")) return;
    await recordingsApi.delete(id).catch(() => {});
    setRecordings((r) => r.filter((rec) => rec.id !== id));
    toast.success("Удалено");
  };

  const togglePlay = (id: string, url: string) => {
    const fullUrl = url.startsWith("http")
      ? url
      : url.startsWith("/")
        ? url
        : `/${url}`;

    if (playingId === id) {
      audioRefs.current[id]?.pause();
      setPlayingId(null);
    } else {
      Object.values(audioRefs.current).forEach((a) => a.pause());
      if (!audioRefs.current[id]) {
        audioRefs.current[id] = new Audio(fullUrl);
        audioRefs.current[id].onended = () => setPlayingId(null);
      }
      audioRefs.current[id].play();
      setPlayingId(id);
    }
  };

  const groupByDate = (recs: any[]) => {
    const groups: Record<string, any[]> = {};
    for (const r of recs) {
      const date = new Date(r.createdAt).toISOString().split("T")[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(r);
    }
    return groups;
  };

  const grouped = groupByDate(recordings);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🎙️ Записи речи</h1>
          <p className="text-muted-foreground mt-1">Голосовой дневник для отслеживания прогресса</p>
        </div>
        <Button variant="gradient" onClick={() => setShowNewRecording(true)}>
          <Plus size={16} className="mr-2" />Новая запись
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Всего записей", value: stats.total, emoji: "🎙️" },
            { label: "Минут", value: stats.totalMinutes, emoji: "⏱️" },
            { label: "За неделю", value: stats.thisWeek, emoji: "📅" },
            { label: "Средний балл", value: `${stats.avgScore}%`, emoji: "⭐" },
          ].map((s) => (
            <div key={s.label} className="glass-card rounded-2xl p-3 text-center">
              <div className="text-2xl mb-1">{s.emoji}</div>
              <div className="font-bold text-lg gradient-text">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* New Recording Modal */}
      <AnimatePresence>
        {showNewRecording && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget && !isRecording) setShowNewRecording(false); }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">Новая запись</h3>
                {!isRecording && <Button variant="ghost" size="icon" onClick={() => setShowNewRecording(false)}><X size={18} /></Button>}
              </div>

              <Input placeholder="Название записи (необязательно)" value={recordingTitle}
                onChange={(e) => setRecordingTitle(e.target.value)} className="mb-4" disabled={isRecording} />

              <div className={cn("text-3xl font-mono font-bold mb-4 transition-colors", isRecording ? "text-red-400" : "text-muted-foreground")}>
                {formatDuration(audioTime)}
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={isRecording ? stopRecording : startRecording}
                className={cn("w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl transition-all",
                  isRecording ? "bg-red-500 animate-pulse shadow-red-500/40" : "bg-gradient-to-br from-red-500 to-blue-500"
                )}>
                {isRecording ? <MicOff size={28} className="text-white" /> : <Mic size={28} className="text-white" />}
              </motion.button>
              <p className="text-sm text-muted-foreground">
                {isRecording ? "Идёт запись... Нажми для остановки" : "Нажми для начала записи"}
              </p>
              {isRecording && (
                <div className="flex justify-center gap-1 mt-3">
                  {[...Array(5)].map((_, i) => (
                    <motion.div key={i} animate={{ scaleY: [0.3, 1, 0.3] }} transition={{ duration: 0.8, delay: i * 0.15, repeat: Infinity }}
                      className="w-1.5 h-5 bg-red-400 rounded-full" />
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recordings list grouped by date */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-4">🎙️</div>
          <p>Записей пока нет. Создай свою первую!</p>
        </div>
      ) : (
        Object.entries(grouped).map(([date, recs]) => (
          <div key={date}>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{formatDate(date)}</h3>
            <div className="space-y-2">
              {recs.map((rec) => (
                <motion.div key={rec.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="glass-card rounded-xl p-4 flex items-center gap-3 group">
                  <button onClick={() => togglePlay(rec.id, rec.audioUrl)}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-blue-500 flex items-center justify-center flex-shrink-0 hover:scale-110 transition-transform">
                    {playingId === rec.id ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white ml-0.5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{rec.title}</div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1"><Clock size={10} />{formatDuration(rec.durationSeconds || 0)}</span>
                      {rec.score && <span className="text-green-400">⭐ {rec.score}%</span>}
                    </div>
                    {rec.feedback && <div className="text-xs text-muted-foreground mt-1 italic truncate">{rec.feedback}</div>}
                  </div>
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-8 w-8 text-red-400"
                    onClick={() => handleDelete(rec.id)}>
                    <Trash2 size={14} />
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
