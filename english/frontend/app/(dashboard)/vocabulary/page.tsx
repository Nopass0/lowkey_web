"use client";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Trash2, Edit2, Wand2, Grid, List,
  X, Check,
  Sparkles, Volume2, BookOpen, Loader2,
  FolderOpen, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCardsStore } from "@/store/cards";
import { aiApi, cardsApi } from "@/api/client";
import { getCardStatusLabel, getNextReviewText, cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Card, Deck } from "@/store/cards";

// ——— Context Menu ———
function ContextMenu({ x, y, onClose, items }: {
  x: number; y: number; onClose: () => void;
  items: Array<{ label: string; icon: any; action: () => void; danger?: boolean }>
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.1 }}
      className="context-menu fixed"
      style={{ top: y, left: x }}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <div
            key={i}
            onClick={() => { item.action(); onClose(); }}
            className={cn("context-menu-item", item.danger && "danger")}
          >
            <Icon size={13} />
            {item.label}
          </div>
        );
      })}
    </motion.div>
  );
}

// ——— Card component ———
function VocabCard({ card, onEdit, onDelete, onCopy, view }: {
  card: Card; onEdit: (c: Card) => void; onDelete: (id: string) => void;
  onCopy: (c: Card) => void; view: "grid" | "list";
}) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "en-US";
    utt.rate = 0.9;
    const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
    if (voices.length > 0) utt.voice = voices.find(v => v.name.includes("Google")) || voices[0];
    setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  };

  const ctxItems = [
    { label: "Редактировать", icon: Edit2, action: () => onEdit(card) },
    { label: "Произнести", icon: Volume2, action: () => speak(card.front) },
    { label: "Копировать текст", icon: Copy, action: () => { onCopy(card); } },
    { label: "Удалить", icon: Trash2, action: () => onDelete(card.id), danger: true },
  ];

  const statusColors: Record<string, string> = {
    new: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    learning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    review: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    mastered: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  };

  if (view === "list") {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          onContextMenu={handleContextMenu}
          className="glass-card rounded-xl px-4 py-3 flex items-center gap-4 group card-hover"
        >
          {card.imageUrl && (
            <img src={card.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-sm">{card.front}</span>
              {card.pronunciation && (
                <span className="text-xs text-muted-foreground font-mono">{card.pronunciation}</span>
              )}
            </div>
            <span className="text-sm text-muted-foreground truncate">{card.back}</span>
          </div>
          <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", statusColors[card.status] || statusColors.new)}>
            {getCardStatusLabel(card.status)}
          </span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => speak(card.front)} className={cn("p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors", speaking && "text-primary")}>
              <Volume2 size={13} />
            </button>
            <button onClick={() => onEdit(card)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
              <Edit2 size={13} />
            </button>
            <button onClick={() => onDelete(card.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </motion.div>
        <AnimatePresence>
          {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} items={ctxItems} />}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onContextMenu={handleContextMenu}
        className="flip-card h-40 cursor-pointer group"
        onClick={() => setFlipped(!flipped)}
      >
        <div className={cn("flip-card-inner", flipped && "flipped")}>
          {/* Front */}
          <div className="flip-card-front glass-card rounded-2xl p-4 flex flex-col justify-between">
            {card.imageUrl && (
              <div className="absolute inset-0 rounded-2xl overflow-hidden opacity-15">
                <img src={card.imageUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-base leading-tight">{card.front}</div>
                  {card.pronunciation && (
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{card.pronunciation}</div>
                  )}
                </div>
                {card.aiGenerated && (
                  <Sparkles size={12} className="text-violet-400 flex-shrink-0 mt-0.5" />
                )}
              </div>
            </div>
            <div className="relative flex items-center justify-between">
              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", statusColors[card.status] || statusColors.new)}>
                {getCardStatusLabel(card.status)}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); speak(card.front); }}
                  className={cn("p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors", speaking && "text-primary")}
                >
                  <Volume2 size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(card); }}
                  className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Edit2 size={12} />
                </button>
              </div>
            </div>
          </div>
          {/* Back */}
          <div className="flip-card-back glass-card rounded-2xl p-4 flex flex-col justify-between bg-primary/5">
            <div className="font-semibold text-sm text-foreground leading-relaxed">{card.back}</div>
            {card.examples && (card.examples as string[]).length > 0 && (
              <div className="text-[11px] text-muted-foreground italic border-l-2 border-primary/30 pl-2 line-clamp-2">
                {(card.examples as string[])[0]}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{getNextReviewText(card.nextReview)}</span>
            </div>
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} items={ctxItems} />}
      </AnimatePresence>
    </>
  );
}

// ——— Main Page ———
export default function VocabularyPage() {
  const { decks, cards, fetchDecks, fetchCards, createCard, updateCard, deleteCard, createDeck } = useCardsStore();
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddDeck, setShowAddDeck] = useState(false);
  const [showAIGen, setShowAIGen] = useState(false);
  const [aiWord, setAiWord] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [newCard, setNewCard] = useState({ front: "", back: "", pronunciation: "", examples: [""], deckId: "" });
  const [newDeck, setNewDeck] = useState({ name: "", emoji: "📚", color: "#6366f1" });

  // AI bulk gen state
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(10);
  const [aiLevel, setAiLevel] = useState("intermediate");
  const [aiDeckId, setAiDeckId] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCardId, setUploadingCardId] = useState<string | null>(null);

  useEffect(() => {
    fetchDecks();
  }, []);
  useEffect(() => {
    fetchCards(selectedDeck ? { deckId: selectedDeck } : {});
  }, [selectedDeck]);

  const filteredCards = cards.filter((c) =>
    !search || c.front.toLowerCase().includes(search.toLowerCase()) || c.back.toLowerCase().includes(search.toLowerCase())
  );

  const handleAIGenerate = async () => {
    if (!aiWord.trim()) return;
    setAiLoading(true);
    try {
      const data = await aiApi.generateCard({ word: aiWord.trim() });
      setNewCard({
        front: data.front,
        back: data.back,
        pronunciation: data.pronunciation || "",
        examples: data.examples || [""],
        deckId: selectedDeck || (decks[0]?.id || ""),
      });
      setAiWord("");
      setShowAddCard(true);
      toast.success("Карточка сгенерирована");
    } catch { toast.error("Ошибка генерации"); }
    finally { setAiLoading(false); }
  };

  const handleBulkGenerate = async () => {
    if (!aiTopic.trim()) return;
    setBulkLoading(true);
    try {
      const result = await cardsApi.generateByTopic({ topic: aiTopic, count: aiCount, level: aiLevel, deckId: aiDeckId || undefined });
      toast.success(`Создано ${result.count} карточек по теме "${aiTopic}"`);
      setShowAIGen(false);
      setAiTopic("");
      fetchDecks();
      fetchCards(selectedDeck ? { deckId: selectedDeck } : {});
    } catch { toast.error("Ошибка генерации"); }
    finally { setBulkLoading(false); }
  };

  const handleSaveCard = async () => {
    if (!newCard.front || !newCard.back) { toast.error("Заполни слово и перевод"); return; }
    try {
      if (editCard) {
        await updateCard(editCard.id, { ...newCard, examples: newCard.examples.filter(Boolean) });
        toast.success("Карточка обновлена");
      } else {
        await createCard({ ...newCard, examples: newCard.examples.filter(Boolean), deckId: newCard.deckId || undefined });
        toast.success("Карточка добавлена");
      }
      setShowAddCard(false);
      setEditCard(null);
      setNewCard({ front: "", back: "", pronunciation: "", examples: [""], deckId: selectedDeck || "" });
    } catch { toast.error("Ошибка сохранения"); }
  };

  const handleEditCard = (card: Card) => {
    setEditCard(card);
    setNewCard({
      front: card.front,
      back: card.back,
      pronunciation: card.pronunciation || "",
      examples: (card.examples as string[]) || [""],
      deckId: card.deckId || "",
    });
    setShowAddCard(true);
  };

  const handleDeleteCard = async (id: string) => {
    try { await deleteCard(id); toast.success("Удалено"); } catch { toast.error("Ошибка"); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingCardId) return;
    try {
      await cardsApi.uploadImage(uploadingCardId, file);
      toast.success("Изображение загружено");
      fetchCards(selectedDeck ? { deckId: selectedDeck } : {});
    } catch { toast.error("Ошибка загрузки"); }
    finally { setUploadingCardId(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleCreateDeck = async () => {
    if (!newDeck.name) return;
    try {
      await createDeck(newDeck);
      toast.success("Набор создан");
      setShowAddDeck(false);
      setNewDeck({ name: "", emoji: "📚", color: "#6366f1" });
    } catch { toast.error("Ошибка"); }
  };

  const EMOJIS = ["📚", "⭐", "🎯", "💡", "🔥", "🌍", "💼", "🏠", "🎵", "🍕", "✈️", "💪", "🧠", "🌟", "🎨"];

  return (
    <div className="max-w-6xl mx-auto space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Словарь</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{cards.length} карточек</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAddDeck(true)}>
            <FolderOpen size={13} /> Набор
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAIGen(true)}>
            <Sparkles size={13} className="text-violet-500" /> AI по теме
          </Button>
          <Button size="sm" className="btn-gradient gap-1.5" onClick={() => { setEditCard(null); setShowAddCard(true); }}>
            <Plus size={13} /> Карточка
          </Button>
        </div>
      </div>

      {/* AI Quick Add */}
      <div className="glass-card rounded-2xl p-3 flex gap-2 items-center">
        <div className="w-7 h-7 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
          <Wand2 size={14} className="text-violet-500" />
        </div>
        <Input
          placeholder="Введи слово — AI создаст карточку..."
          value={aiWord}
          onChange={(e) => setAiWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAIGenerate()}
          className="flex-1 bg-transparent border-0 focus-visible:ring-0 px-1 h-8"
        />
        <Button
          size="sm"
          className="btn-gradient h-8 px-3 gap-1.5 flex-shrink-0"
          onClick={handleAIGenerate}
          disabled={aiLoading || !aiWord.trim()}
        >
          {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Создать
        </Button>
      </div>

      {/* Deck tabs + search + view toggle */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 flex-1">
          <button
            onClick={() => setSelectedDeck(null)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all",
              !selectedDeck ? "bg-primary text-white shadow-sm" : "bg-accent text-muted-foreground hover:text-foreground"
            )}
          >
            Все ({cards.length})
          </button>
          {decks.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDeck(d.id)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5",
                selectedDeck === d.id ? "bg-primary text-white shadow-sm" : "bg-accent text-muted-foreground hover:text-foreground"
              )}
            >
              {d.emoji} {d.name}
              <span className="opacity-60">({d.cardCount})</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 items-center">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-7 w-36 h-8 text-xs" />
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setView(view === "grid" ? "list" : "grid")}>
            {view === "grid" ? <List size={14} /> : <Grid size={14} />}
          </Button>
        </div>
      </div>

      {/* Cards grid/list */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      <AnimatePresence mode="popLayout">
        {filteredCards.length > 0 ? (
          <div className={cn(
            "grid gap-2.5",
            view === "grid" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1"
          )}>
            {filteredCards.map((card) => (
              <VocabCard
                key={card.id}
                card={card}
                view={view}
                onEdit={handleEditCard}
                onDelete={handleDeleteCard}
                onCopy={(c) => { navigator.clipboard.writeText(`${c.front} — ${c.back}`); toast.success("Скопировано"); }}
              />
            ))}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4">
              <BookOpen size={24} className="text-muted-foreground/50" />
            </div>
            <p className="font-medium">Карточек пока нет</p>
            <p className="text-sm mt-1 text-muted-foreground/70">Добавь первую карточку или создай набор по теме с AI</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === Add/Edit Card Modal === */}
      <AnimatePresence>
        {showAddCard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowAddCard(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card-strong bg-card border rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-semibold text-lg">{editCard ? "Редактировать" : "Новая карточка"}</h3>
                <button onClick={() => { setShowAddCard(false); setEditCard(null); }}
                  className="w-8 h-8 rounded-xl hover:bg-accent flex items-center justify-center text-muted-foreground transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block font-medium">Слово (English)</label>
                    <Input value={newCard.front} onChange={(e) => setNewCard({ ...newCard, front: e.target.value })} placeholder="apple" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block font-medium">Перевод</label>
                    <Input value={newCard.back} onChange={(e) => setNewCard({ ...newCard, back: e.target.value })} placeholder="яблоко" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block font-medium">Произношение (IPA)</label>
                  <Input value={newCard.pronunciation} onChange={(e) => setNewCard({ ...newCard, pronunciation: e.target.value })} placeholder="/ˈæpl/" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block font-medium">Пример предложения</label>
                  <Input value={newCard.examples[0]} onChange={(e) => setNewCard({ ...newCard, examples: [e.target.value] })} placeholder="I ate an apple." />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block font-medium">Набор</label>
                  <select value={newCard.deckId} onChange={(e) => setNewCard({ ...newCard, deckId: e.target.value })}
                    className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
                    <option value="">Без набора</option>
                    {decks.map((d) => <option key={d.id} value={d.id}>{d.emoji} {d.name}</option>)}
                  </select>
                </div>
                <Button className="w-full btn-gradient" onClick={handleSaveCard}>
                  <Check size={15} className="mr-2" />
                  {editCard ? "Сохранить изменения" : "Создать карточку"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === AI Bulk Gen Modal === */}
      <AnimatePresence>
        {showAIGen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowAIGen(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card-strong bg-card border rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
                    <Sparkles size={17} className="text-violet-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">AI по теме</h3>
                    <p className="text-xs text-muted-foreground">Сгенерирует набор карточек</p>
                  </div>
                </div>
                <button onClick={() => setShowAIGen(false)}
                  className="w-8 h-8 rounded-xl hover:bg-accent flex items-center justify-center text-muted-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block font-medium">Тема (на русском или английском)</label>
                  <Input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="Например: путешествия, технологии, еда..." />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block font-medium">Количество</label>
                    <select value={aiCount} onChange={(e) => setAiCount(parseInt(e.target.value))}
                      className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
                      {[5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n} карточек</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block font-medium">Уровень</label>
                    <select value={aiLevel} onChange={(e) => setAiLevel(e.target.value)}
                      className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
                      <option value="beginner">Начинающий</option>
                      <option value="intermediate">Средний</option>
                      <option value="advanced">Продвинутый</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block font-medium">Добавить в набор</label>
                  <select value={aiDeckId} onChange={(e) => setAiDeckId(e.target.value)}
                    className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
                    <option value="">Без набора</option>
                    {decks.map((d) => <option key={d.id} value={d.id}>{d.emoji} {d.name}</option>)}
                  </select>
                </div>
                <Button className="w-full btn-gradient" onClick={handleBulkGenerate} disabled={bulkLoading || !aiTopic.trim()}>
                  {bulkLoading ? (
                    <><Loader2 size={14} className="animate-spin mr-2" /> Генерирую...</>
                  ) : (
                    <><Sparkles size={14} className="mr-2" /> Сгенерировать {aiCount} карточек</>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === Add Deck Modal === */}
      <AnimatePresence>
        {showAddDeck && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowAddDeck(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card-strong bg-card border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-semibold">Новый набор</h3>
                <button onClick={() => setShowAddDeck(false)}
                  className="w-8 h-8 rounded-xl hover:bg-accent flex items-center justify-center text-muted-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block font-medium">Иконка</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {EMOJIS.map((e) => (
                      <button key={e} onClick={() => setNewDeck({ ...newDeck, emoji: e })}
                        className={cn("text-xl p-2 rounded-xl transition-all", newDeck.emoji === e ? "bg-primary/15 ring-2 ring-primary/40" : "hover:bg-accent")}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
                <Input placeholder="Название набора" value={newDeck.name} onChange={(e) => setNewDeck({ ...newDeck, name: e.target.value })} />
                <Button className="w-full btn-gradient" onClick={handleCreateDeck}>Создать набор</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
