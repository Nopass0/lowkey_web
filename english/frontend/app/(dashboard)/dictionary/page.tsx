"use client";
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Volume2, BookOpen, Plus, Star, ArrowRight,
  Loader2, Copy, X, Trophy, ChevronRight, Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCardsStore } from "@/store/cards";
import { dictionaryApi } from "@/api/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type DictEntry = {
  word: string; pronunciation: string; phonetic: string; audioUrl: string;
  partOfSpeech: string; origin: string | null;
  definitions: Array<{ partOfSpeech: string; definition: string; example?: string }>;
  examples: Array<{ en: string; ru?: string; partOfSpeech?: string }>;
  synonyms: string[]; antonyms: string[];
  russianTranslations: string[];
  collocations: string[];
  register: string; usageNote: string | null;
};

export default function DictionaryPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const [wordOfDay, setWordOfDay] = useState<DictEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const { decks, fetchDecks } = useCardsStore();
  const [selectedDeck, setSelectedDeck] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestTimer = useRef<any>(null);

  useEffect(() => {
    fetchDecks();
    dictionaryApi.wordOfDay().then(setWordOfDay).catch(() => {});
    if (searchParams.get("q")) lookup(searchParams.get("q")!);
  }, []);

  const lookup = async (word: string) => {
    if (!word.trim()) return;
    setLoading(true);
    setSuggestOpen(false);
    try {
      const data = await dictionaryApi.lookup(word.trim());
      setEntry(data);
      setQuery(data.word);
    } catch { toast.error("Слово не найдено"); }
    finally { setLoading(false); }
  };

  const handleInput = (val: string) => {
    setQuery(val);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (val.length < 2) { setSuggestions([]); setSuggestOpen(false); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const data = await dictionaryApi.search(val);
        setSuggestions(data.words || []);
        setSuggestOpen((data.words || []).length > 0);
      } catch {}
    }, 300);
  };

  const speakWord = (text: string, lang = "en-US") => {
    window.speechSynthesis.cancel();
    if (entry?.audioUrl) {
      const audio = new Audio(entry.audioUrl);
      audio.play().catch(() => speakTTS(text, lang));
      return;
    }
    speakTTS(text, lang);
  };

  const speakTTS = (text: string, lang = "en-US") => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    utt.rate = 0.85;
    const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
    if (voices.length > 0) utt.voice = voices.find(v => v.name.includes("Google") || v.name.includes("Natural")) || voices[0];
    setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  };

  const saveCard = async () => {
    if (!entry) return;
    setSavingCard(true);
    try {
      await dictionaryApi.saveCard({ word: entry.word, deckId: selectedDeck || undefined });
      toast.success(`"${entry.word}" добавлено в карточки`);
    } catch { toast.error("Ошибка сохранения"); }
    finally { setSavingCard(false); }
  };

  const getRegisterBadge = (reg: string) => {
    const map: Record<string, string> = {
      formal: "bg-blue-500/15 text-blue-500 border-blue-500/20",
      informal: "bg-orange-500/15 text-orange-500 border-orange-500/20",
      neutral: "bg-muted text-muted-foreground border-border",
    };
    return map[reg] || map.neutral;
  };

  return (
    <div className="max-w-3xl mx-auto page-enter space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Переводчик</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Поиск слов с переводами, примерами и произношением</p>
      </div>

      {/* Search */}
      <div className="relative">
        <div className="glass-card rounded-2xl p-1 flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup(query)}
              onFocus={() => suggestions.length > 0 && setSuggestOpen(true)}
              placeholder="Поиск слова на английском..."
              className="w-full pl-9 pr-3 py-2.5 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <Button className="btn-gradient h-9 px-5 flex-shrink-0 gap-1.5" onClick={() => lookup(query)} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Найти
          </Button>
        </div>

        {/* Suggestions dropdown */}
        <AnimatePresence>
          {suggestOpen && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-50"
            >
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => { lookup(s); setSuggestOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2">
                  <Search size={12} className="text-muted-foreground/50" />
                  {s}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Entry */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </motion.div>
        ) : entry ? (
          <motion.div key={entry.word} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Word header */}
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h2 className="text-3xl font-bold">{entry.word}</h2>
                    {entry.phonetic && (
                      <span className="text-base font-mono text-muted-foreground">{entry.phonetic}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {entry.partOfSpeech && (
                      <span className="text-xs px-2.5 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                        {entry.partOfSpeech}
                      </span>
                    )}
                    {entry.register && (
                      <span className={cn("text-xs px-2.5 py-0.5 rounded-full font-medium border", getRegisterBadge(entry.register))}>
                        {entry.register}
                      </span>
                    )}
                  </div>
                  {entry.russianTranslations?.length > 0 && (
                    <div className="mt-3 text-xl font-semibold text-foreground/90">
                      {entry.russianTranslations.slice(0, 3).join(", ")}
                    </div>
                  )}
                  {entry.usageNote && (
                    <p className="mt-2 text-sm text-muted-foreground">{entry.usageNote}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-end flex-shrink-0">
                  <button
                    onClick={() => speakWord(entry.word)}
                    className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center transition-all",
                      speaking
                        ? "bg-primary text-white shadow-md shadow-primary/30"
                        : "bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Volume2 size={18} />
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(entry.word); toast.success("Скопировано"); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-all"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>

              {/* Save to cards */}
              <div className="border-t border-border/40 mt-4 pt-4 flex gap-2 items-center">
                <select value={selectedDeck} onChange={(e) => setSelectedDeck(e.target.value)}
                  className="flex-1 h-9 rounded-xl border border-input bg-background px-3 text-sm">
                  <option value="">Без набора</option>
                  {decks.map(d => <option key={d.id} value={d.id}>{d.emoji} {d.name}</option>)}
                </select>
                <Button className="btn-gradient gap-1.5 h-9 flex-shrink-0" onClick={saveCard} disabled={savingCard}>
                  {savingCard ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  В карточки
                </Button>
              </div>
            </div>

            {/* Definitions */}
            {entry.definitions?.length > 0 && (
              <div className="glass-card rounded-2xl p-5">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <BookOpen size={14} className="text-primary" /> Значения
                </h3>
                <div className="space-y-3">
                  {entry.definitions.slice(0, 5).map((def, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{def.partOfSpeech} · </span>
                        <span className="text-sm text-foreground/85">{def.definition}</span>
                        {def.example && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-xs italic text-muted-foreground border-l-2 border-primary/20 pl-2">{def.example}</span>
                            <button onClick={() => speakTTS(def.example!)} className="text-muted-foreground/40 hover:text-primary transition-colors flex-shrink-0">
                              <Volume2 size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Examples with Russian */}
            {entry.examples?.filter(e => e.ru).length > 0 && (
              <div className="glass-card rounded-2xl p-5">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Star size={14} className="text-amber-500" /> Примеры с переводом
                </h3>
                <div className="space-y-3">
                  {entry.examples.filter(e => e.ru).slice(0, 5).map((ex, i) => (
                    <div key={i} className="p-3 bg-accent/30 rounded-xl">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm">{ex.en}</div>
                        <button onClick={() => speakTTS(ex.en)} className="text-muted-foreground/50 hover:text-primary transition-colors flex-shrink-0">
                          <Volume2 size={13} />
                        </button>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{ex.ru}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Synonyms / Antonyms / Collocations */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {entry.synonyms?.length > 0 && (
                <div className="glass-card rounded-xl p-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Синонимы</div>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.synonyms.map((s, i) => (
                      <button key={i} onClick={() => lookup(s)}
                        className="text-xs px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full hover:bg-emerald-500/20 transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {entry.antonyms?.length > 0 && (
                <div className="glass-card rounded-xl p-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Антонимы</div>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.antonyms.map((a, i) => (
                      <button key={i} onClick={() => lookup(a)}
                        className="text-xs px-2.5 py-1 bg-red-500/10 text-red-500 dark:text-red-400 rounded-full hover:bg-red-500/20 transition-colors">
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {entry.collocations?.length > 0 && (
                <div className="glass-card rounded-xl p-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Словосочетания</div>
                  <div className="space-y-1">
                    {entry.collocations.map((c, i) => (
                      <div key={i} className="text-xs text-foreground/75 flex items-center gap-1.5">
                        <Tag size={9} className="text-muted-foreground/50" /> {c}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {entry.origin && (
              <div className="glass-card rounded-xl p-4 border border-violet-500/15">
                <div className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-1">Этимология</div>
                <p className="text-sm text-foreground/75">{entry.origin}</p>
              </div>
            )}
          </motion.div>
        ) : (
          /* Word of day as default */
          wordOfDay && (
            <motion.div key="wod" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Trophy size={14} className="text-amber-500" />
                <span className="text-sm font-medium text-muted-foreground">Слово дня</span>
              </div>
              <div className="glass-card rounded-2xl p-5 cursor-pointer card-hover" onClick={() => lookup(wordOfDay.word)}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">{wordOfDay.word}</h2>
                    {wordOfDay.phonetic && <div className="text-sm font-mono text-muted-foreground mb-2">{wordOfDay.phonetic}</div>}
                    {wordOfDay.russianTranslations?.length > 0 && (
                      <div className="text-lg font-semibold text-foreground/90">
                        {wordOfDay.russianTranslations.slice(0, 2).join(", ")}
                      </div>
                    )}
                    {wordOfDay.definitions?.[0] && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{wordOfDay.definitions[0].definition}</p>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); speakWord(wordOfDay.word); }}
                    className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-accent/80 transition-all flex-shrink-0"
                  >
                    <Volume2 size={16} />
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs text-primary font-medium">
                  Нажми для полного словаря <ArrowRight size={12} />
                </div>
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}
