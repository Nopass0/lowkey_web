"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Volume2, RotateCcw, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Star, Loader2,
  Play, Square, ArrowRight, Brain, Lightbulb, BarChart2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aiApi } from "@/api/client";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

const PRACTICE_WORDS = [
  { word: "thought",       ipa: "/θɔːt/",           tip: "Звук 'th' — кончик языка между зубами", category: "th-sounds" },
  { word: "world",         ipa: "/wɜːrld/",          tip: "Буква 'r' растягивает предыдущий звук", category: "r-sounds" },
  { word: "comfortable",   ipa: "/ˈkʌmftəbl/",       tip: "Обычно произносится как 3 слога", category: "stress" },
  { word: "particularly",  ipa: "/pəˈtɪkjələrli/",   tip: "Ударение на втором слоге", category: "stress" },
  { word: "pronunciation", ipa: "/prəˌnʌnsiˈeɪʃən/", tip: "Не 'pro-NOUNC-iation'!", category: "common-mistakes" },
  { word: "beautiful",     ipa: "/ˈbjuːtɪfəl/",      tip: "'eau' читается как 'yu'", category: "vowels" },
  { word: "Wednesday",     ipa: "/ˈwɛnzdeɪ/",        tip: "Средний слог не произносится", category: "silent-letters" },
  { word: "colonel",       ipa: "/ˈkɜːrnəl/",        tip: "Произносится как 'kernel'", category: "irregular" },
  { word: "schedule",      ipa: "/ˈʃɛdjuːl/",        tip: "Британское: 'shed-yool', американское: 'sked-yool'", category: "variations" },
  { word: "entrepreneur",  ipa: "/ˌɒntrəprəˈnɜːr/",  tip: "Ударение на последнем слоге", category: "stress" },
  { word: "specifically",  ipa: "/spəˈsɪfɪkli/",     tip: "5 слогов: spe-CI-fi-cal-ly", category: "stress" },
  { word: "throughout",    ipa: "/θruːˈaʊt/",         tip: "Два разных звука 'ou'", category: "vowels" },
];

const SENTENCES = [
  { en: "The weather is surprisingly beautiful today.", ru: "Сегодня удивительно красивая погода." },
  { en: "She particularly enjoys reading thought-provoking books.", ru: "Ей особенно нравится читать книги, заставляющие думать." },
  { en: "Could you schedule a meeting for next Wednesday?", ru: "Не могли бы вы назначить встречу на следующую среду?" },
  { en: "Throughout the world, entrepreneurs create new opportunities.", ru: "Во всём мире предприниматели создают новые возможности." },
];

type PhonemeFeedback = {
  phoneme: string;
  spoken: string;
  correct: boolean;
  tip?: string;
};

type Analysis = {
  score: number;
  accuracy: string;
  target: string;
  spoken: string;
  feedback: string;
  phonemeFeedback?: PhonemeFeedback[];
  suggestions: string[];
  grade: "A" | "B" | "C" | "D" | "F";
};

export default function PronunciationPage() {
  const [mode, setMode] = useState<"words" | "sentences">("words");
  const [selectedWord, setSelectedWord] = useState(PRACTICE_WORDS[0]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedSentenceIdx, setSelectedSentenceIdx] = useState(0);
  const [customText, setCustomText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [spokenText, setSpokenText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [history, setHistory] = useState<Array<{ target: string; score: number; date: string }>>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  const targetText = customText.trim() || (mode === "words" ? selectedWord.word : SENTENCES[0].en);

  const getVoice = (): SpeechSynthesisVoice | undefined => {
    const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
    return voices.find(v =>
      v.name.includes("Google US") ||
      v.name.includes("Google UK") ||
      v.name.includes("Natural") ||
      v.name.includes("Neural")
    ) || voices[0];
  };

  const speak = (text: string, slow = false) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "en-US";
    utt.rate = slow ? 0.6 : 0.85;
    utt.pitch = 1.0;
    const voice = getVoice();
    if (voice) utt.voice = voice;
    setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      setSpokenText("");
      setAnalysis(null);

      // Web Speech API for transcription
      if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.onresult = (e: any) => {
          const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join("");
          setSpokenText(transcript);
        };
        recognition.start();
        recognitionRef.current = recognition;
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(100);
      setIsRecording(true);
    } catch (e) {
      toast.error("Нет доступа к микрофону");
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    recognitionRef.current?.stop();
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());

    // Small delay for recognition to finalize
    await new Promise(r => setTimeout(r, 600));
    if (spokenText || customText) {
      analyzeResult(spokenText);
    }
  };

  const analyzeResult = async (spoken: string) => {
    setAnalyzing(true);
    const target = customText.trim() || targetText;
    try {
      const data = await aiApi.analyzePronunciation({
        targetText: target,
        spokenText: spoken || target,
        targetIPA: mode === "words" ? selectedWord.ipa : "",
      });

      // Map AI response to our Analysis type
      const score = data.score || 70;
      const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "F";
      const analysisResult: Analysis = {
        score,
        accuracy: `${score}%`,
        target,
        spoken: spoken,
        feedback: data.feedback || data.overallFeedback || "Хорошая попытка!",
        suggestions: data.improvements || data.suggestions || [],
        phonemeFeedback: data.phonemeErrors?.map((e: any) => ({
          phoneme: e.expected,
          spoken: e.actual,
          correct: false,
          tip: e.tip,
        })) || [],
        grade,
      };
      setAnalysis(analysisResult);
      setHistory(h => [{ target, score, date: new Date().toLocaleDateString("ru") }, ...h.slice(0, 9)]);
    } catch {
      // Fallback local analysis
      const spoken_lower = spoken.toLowerCase().trim();
      const target_lower = target.toLowerCase().trim();
      const words_target = target_lower.split(/\s+/);
      const words_spoken = spoken_lower.split(/\s+/);
      let correct = 0;
      words_target.forEach(w => { if (words_spoken.includes(w)) correct++; });
      const score = words_target.length > 0 ? Math.round((correct / words_target.length) * 100) : 60;
      const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "F";
      setAnalysis({
        score, accuracy: `${score}%`, target, spoken, grade,
        feedback: score >= 80 ? "Отличное произношение!" : score >= 60 ? "Хорошая попытка, есть небольшие ошибки." : "Нужно больше практики.",
        suggestions: score < 80 ? ["Произноси медленнее", "Слушай носителей языка", "Практикуй отдельные звуки"] : ["Отличная работа!"],
        phonemeFeedback: [],
      });
      setHistory(h => [{ target, score, date: new Date().toLocaleDateString("ru") }, ...h.slice(0, 9)]);
    }
    setAnalyzing(false);
  };

  const gradeColor = analysis ? {
    "A": "text-emerald-500", "B": "text-blue-500", "C": "text-amber-500",
    "D": "text-orange-500", "F": "text-red-500"
  }[analysis.grade] : "";

  const displayedWords = showAll ? PRACTICE_WORDS : PRACTICE_WORDS.slice(0, 6);

  return (
    <div className="max-w-4xl mx-auto page-enter space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Произношение</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Тренировка и сравнение с эталонным произношением</p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-accent/50 p-1 rounded-xl w-fit">
        {(["words", "sentences"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              mode === m ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {m === "words" ? "Слова" : "Предложения"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* Left: word selector */}
        <div className="md:col-span-2 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {mode === "words" ? "Выбери слово" : "Выбери фразу"}
          </div>

          {mode === "words" ? (
            <>
              <div className="space-y-1.5">
                {displayedWords.map((w) => (
                  <button
                    key={w.word}
                    onClick={() => { setSelectedWord(w); setAnalysis(null); setSpokenText(""); setCustomText(""); }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all",
                      selectedWord.word === w.word
                        ? "bg-primary/10 text-primary font-medium border border-primary/20"
                        : "hover:bg-accent text-foreground"
                    )}
                  >
                    <div className="font-medium">{w.word}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{w.ipa}</div>
                  </button>
                ))}
              </div>
              {!showAll && PRACTICE_WORDS.length > 6 && (
                <button onClick={() => setShowAll(true)} className="text-xs text-primary hover:text-primary/80 transition-colors w-full text-center">
                  Показать все ({PRACTICE_WORDS.length})
                </button>
              )}
            </>
          ) : (
            <div className="space-y-1.5">
              {SENTENCES.map((s, i) => (
                <button key={i} onClick={() => { setAnalysis(null); setSpokenText(""); setCustomText(s.en); }}
                  className={cn("w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all",
                    customText === s.en ? "bg-primary/10 text-primary font-medium border border-primary/20" : "hover:bg-accent")}>
                  <div className="text-xs text-muted-foreground mb-0.5">{s.ru}</div>
                  <div className="font-medium text-xs leading-relaxed line-clamp-2">{s.en}</div>
                </button>
              ))}
            </div>
          )}

          {/* Custom input */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Или введи своё</div>
            <Input
              value={customText}
              onChange={(e) => { setCustomText(e.target.value); setAnalysis(null); }}
              placeholder="Введи любое слово или фразу..."
              className="text-sm h-9"
            />
          </div>

          {/* History */}
          {history.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">История</div>
              <div className="space-y-1">
                {history.slice(0, 5).map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg hover:bg-accent">
                    <span className="text-muted-foreground truncate">{h.target}</span>
                    <span className={cn("font-semibold ml-2 flex-shrink-0",
                      h.score >= 80 ? "text-emerald-500" : h.score >= 60 ? "text-amber-500" : "text-red-500"
                    )}>{h.score}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: recorder + analysis */}
        <div className="md:col-span-3 space-y-4">
          {/* Target text card */}
          <div className="glass-card rounded-2xl p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3 font-semibold">Произнеси</div>
            <div className="text-2xl font-bold mb-1">{customText || (mode === "words" ? selectedWord.word : SENTENCES[0].en)}</div>
            {mode === "words" && !customText && (
              <>
                <div className="text-base font-mono text-muted-foreground mb-2">{selectedWord.ipa}</div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground bg-accent/40 rounded-xl p-3">
                  <Lightbulb size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  {selectedWord.tip}
                </div>
              </>
            )}
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => speak(customText || (mode === "words" ? selectedWord.word : SENTENCES[0].en))}
                disabled={speaking}
              >
                <Volume2 size={13} className={cn(speaking && "text-primary animate-pulse")} />
                {speaking ? "Слушай..." : "Прослушать"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => speak(customText || (mode === "words" ? selectedWord.word : SENTENCES[0].en), true)}
              >
                <Play size={13} />
                Медленно
              </Button>
            </div>
          </div>

          {/* Recorder */}
          <div className="glass-card rounded-2xl p-5 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-4 font-semibold">Твоё произношение</div>
            <div className="flex justify-center mb-4">
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  "relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200",
                  isRecording
                    ? "bg-red-500 shadow-[0_0_0_8px_rgba(239,68,68,0.15),0_0_0_20px_rgba(239,68,68,0.07)]"
                    : "bg-primary shadow-[0_4px_20px_rgba(99,102,241,0.35)] hover:shadow-[0_4px_28px_rgba(99,102,241,0.5)]"
                )}
              >
                {isRecording ? (
                  <Square size={24} className="text-white" />
                ) : (
                  <Mic size={24} className="text-white" />
                )}
                {isRecording && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-red-400"
                    animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </motion.button>
            </div>

            {/* Waveform visualization */}
            {isRecording && (
              <div className="flex items-center justify-center gap-1 mb-3 h-8">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="audio-bar w-1.5 bg-red-500"
                    style={{
                      height: `${20 + Math.random() * 40}%`,
                      animationDelay: `${i * 0.08}s`,
                      animationDuration: `${0.5 + Math.random() * 0.5}s`,
                    }}
                  />
                ))}
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {isRecording ? "Говори... нажми чтобы остановить" : "Нажми чтобы начать запись"}
            </p>

            {spokenText && (
              <div className="mt-3 p-3 bg-accent/40 rounded-xl text-sm text-left">
                <span className="text-xs text-muted-foreground block mb-1">Распознано:</span>
                <span className="font-medium">{spokenText}</span>
              </div>
            )}

            {analyzing && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin text-primary" />
                AI анализирует произношение...
              </div>
            )}
          </div>

          {/* Analysis results */}
          <AnimatePresence>
            {analysis && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                {/* Score */}
                <div className="glass-card rounded-2xl p-5">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className={cn("text-4xl font-bold", gradeColor)}>{analysis.grade}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">оценка</div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Точность</span>
                        <span className={cn("font-bold text-sm", gradeColor)}>{analysis.score}%</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${analysis.score}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className={cn("h-full rounded-full",
                            analysis.score >= 80 ? "bg-emerald-500" :
                            analysis.score >= 60 ? "bg-amber-500" : "bg-red-500"
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Comparison */}
                {analysis.spoken && (
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Сравнение</div>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="w-16 text-[10px] text-muted-foreground font-medium pt-0.5 shrink-0">Эталон:</div>
                        <div className="text-sm font-medium text-emerald-500">{analysis.target}</div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-16 text-[10px] text-muted-foreground font-medium pt-0.5 shrink-0">Твоё:</div>
                        <div className="text-sm">{analysis.spoken || "—"}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Feedback */}
                <div className="glass-card rounded-xl p-4 border-l-4 border-primary">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain size={13} className="text-primary" />
                    <span className="text-xs font-semibold text-primary">AI Обратная связь</span>
                  </div>
                  <p className="text-sm text-foreground/80">{analysis.feedback}</p>
                </div>

                {/* Suggestions */}
                {analysis.suggestions?.length > 0 && (
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Советы</div>
                    <ul className="space-y-1.5">
                      {analysis.suggestions.map((s: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                          <ChevronRight size={13} className="text-primary flex-shrink-0 mt-0.5" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Retry */}
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => { setAnalysis(null); setSpokenText(""); }}
                >
                  <RotateCcw size={14} /> Попробовать снова
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
