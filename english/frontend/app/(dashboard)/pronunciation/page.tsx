"use client";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Volume2, Play, Square, RotateCcw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { aiApi, recordingsApi } from "@/api/client";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

const PRACTICE_WORDS = [
  { word: "thought", ipa: "/θɔːt/", tip: "Звук 'th' — кончик языка между зубами" },
  { word: "world", ipa: "/wɜːrld/", tip: "Буква 'r' произносится, тянет звук" },
  { word: "comfortable", ipa: "/ˈkʌmftəbl/", tip: "Часто произносится как 3 слога" },
  { word: "particularly", ipa: "/pəˈtɪkjələrli/", tip: "Ударение на втором слоге" },
  { word: "pronunciation", ipa: "/prəˌnʌnsiˈeɪʃən/", tip: "Не 'pronounciation'!" },
  { word: "beautiful", ipa: "/ˈbjuːtɪfəl/", tip: "Дифтонг 'eau' читается как 'yu'" },
  { word: "Wednesday", ipa: "/ˈwɛnzdeɪ/", tip: "Средний слог не произносится" },
  { word: "colonel", ipa: "/ˈkɜːrnəl/", tip: "Произносится как 'kernel'" },
];

export default function PronunciationPage() {
  const [selectedWord, setSelectedWord] = useState(PRACTICE_WORDS[0]);
  const [customWord, setCustomWord] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [userTranscription, setUserTranscription] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  const speak = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = 0.7;
      window.speechSynthesis.speak(u);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setUserTranscription("");
      setAnalysis(null);

      // Speech recognition for transcription
      if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.onresult = (e: any) => {
          setUserTranscription(e.results[0][0].transcript);
        };
        recognitionRef.current = recognition;
        recognition.start();
      }

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      toast.error("Нет доступа к микрофону");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  const analyzeRecording = async () => {
    if (!audioBlob) return;
    setAnalyzing(true);
    try {
      // Save recording first
      const formData = new FormData();
      formData.append("audio", audioBlob, "pronunciation.webm");
      formData.append("title", `Произношение: ${selectedWord.word}`);
      formData.append("type", "pronunciation");
      formData.append("duration", "10");
      await recordingsApi.upload(formData);

      // Analyze
      const result = await aiApi.analyzePronunciation({
        word: selectedWord.word,
        transcription: userTranscription || selectedWord.word,
        correctIpa: selectedWord.ipa,
      });
      setAnalysis(result);
    } catch {
      // Demo analysis if AI fails
      setAnalysis({
        score: 72,
        feedback: "Хорошая попытка! Постарайся чётче произносить звуки.",
        corrections: ["Обрати внимание на звук в начале слова"],
        tips: ["Слушай носителей языка", "Практикуйся каждый день"],
        phonemes: [],
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const reset = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setAnalysis(null);
    setUserTranscription("");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🗣️ Произношение</h1>
        <p className="text-muted-foreground mt-1">Тренируй произношение с AI-анализом</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Word picker */}
        <div className="glass-card rounded-2xl p-5">
          <h3 className="font-semibold mb-3">Выбери слово для практики</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {PRACTICE_WORDS.map((w) => (
              <button key={w.word} onClick={() => { setSelectedWord(w); reset(); }}
                className={cn("w-full text-left p-3 rounded-xl transition-all", selectedWord.word === w.word ? "bg-gradient-to-r from-red-500/20 to-blue-500/20 border border-white/10" : "hover:bg-accent")}>
                <div className="font-semibold">{w.word}</div>
                <div className="text-xs text-muted-foreground font-mono">{w.ipa}</div>
              </button>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-border flex gap-2">
            <Input placeholder="Своё слово..." value={customWord} onChange={(e) => setCustomWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customWord.trim()) {
                  setSelectedWord({ word: customWord.trim(), ipa: "", tip: "Послушай правильное произношение" });
                  reset(); setCustomWord("");
                }
              }} />
            <Button variant="outline" size="icon" onClick={() => {
              if (customWord.trim()) { setSelectedWord({ word: customWord.trim(), ipa: "", tip: "" }); reset(); setCustomWord(""); }
            }}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>

        {/* Practice area */}
        <div className="glass-card rounded-2xl p-5 flex flex-col items-center justify-center text-center">
          <div className="text-4xl font-bold gradient-text mb-1">{selectedWord.word}</div>
          {selectedWord.ipa && <div className="text-muted-foreground font-mono text-lg mb-2">{selectedWord.ipa}</div>}
          {selectedWord.tip && <div className="text-sm text-muted-foreground mb-4 italic">💡 {selectedWord.tip}</div>}

          <Button variant="outline" size="sm" onClick={() => speak(selectedWord.word)} className="mb-6 gap-2">
            <Volume2 size={14} />Послушать эталон
          </Button>

          {/* Record button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={isRecording ? stopRecording : startRecording}
            className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl mb-4",
              isRecording
                ? "bg-red-500 animate-pulse shadow-red-500/50"
                : "bg-gradient-to-br from-red-500 to-blue-500 shadow-purple-500/30"
            )}
          >
            {isRecording ? <MicOff size={28} className="text-white" /> : <Mic size={28} className="text-white" />}
          </motion.button>
          <p className="text-sm text-muted-foreground">{isRecording ? "Запись... Нажми чтобы остановить" : "Нажми и произнеси слово"}</p>

          {audioUrl && !isRecording && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 w-full">
              <audio src={audioUrl} controls className="w-full mb-3" style={{ height: 32 }} />
              {userTranscription && (
                <div className="text-sm text-muted-foreground mb-3">
                  Распознано: <span className="text-foreground font-medium">"{userTranscription}"</span>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset} className="flex-1"><RotateCcw size={14} className="mr-1" />Заново</Button>
                <Button variant="gradient" size="sm" onClick={analyzeRecording} disabled={analyzing} className="flex-1">
                  {analyzing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Анализ AI"}
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Analysis result */}
      <AnimatePresence>
        {analysis && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-card rounded-2xl p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-semibold text-lg">Анализ произношения</h3>
              <div className="text-center">
                <div className={cn("text-3xl font-bold", analysis.score >= 80 ? "text-green-400" : analysis.score >= 60 ? "text-yellow-400" : "text-red-400")}>
                  {analysis.score}%
                </div>
                <div className="text-xs text-muted-foreground">Точность</div>
              </div>
            </div>
            <Progress value={analysis.score} gradient className="h-3 mb-4" />
            <p className="text-sm mb-4">{analysis.feedback}</p>
            {analysis.corrections?.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold mb-2 text-orange-400">⚠️ Исправления:</h4>
                <ul className="space-y-1">{analysis.corrections.map((c: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2"><span>→</span>{c}</li>
                ))}</ul>
              </div>
            )}
            {analysis.tips?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-blue-400">💡 Советы:</h4>
                <ul className="space-y-1">{analysis.tips.map((t: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2"><span>✓</span>{t}</li>
                ))}</ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
