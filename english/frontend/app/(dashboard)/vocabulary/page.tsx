"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Trash2, Edit2, Wand2, Grid, List, BookOpen, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCardsStore } from "@/store/cards";
import { aiApi } from "@/api/client";
import { getCardStatusLabel, getCardStatusColor, getNextReviewText, cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Card, Deck } from "@/store/cards";

export default function VocabularyPage() {
  const { decks, cards, fetchDecks, fetchCards, createCard, updateCard, deleteCard, createDeck } = useCardsStore();
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddDeck, setShowAddDeck] = useState(false);
  const [aiWord, setAiWord] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [newCard, setNewCard] = useState({ front: "", back: "", pronunciation: "", examples: [""], deckId: "" });
  const [newDeck, setNewDeck] = useState({ name: "", emoji: "📚", color: "#6366f1" });

  useEffect(() => {
    fetchDecks();
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
      toast.success("Карточка сгенерирована AI 🤖");
    } catch {
      toast.error("Ошибка генерации");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveCard = async () => {
    if (!newCard.front || !newCard.back) { toast.error("Заполни слово и перевод"); return; }
    try {
      await createCard({ ...newCard, examples: newCard.examples.filter(Boolean), deckId: newCard.deckId || undefined });
      toast.success("Карточка добавлена ✅");
      setShowAddCard(false);
      setNewCard({ front: "", back: "", pronunciation: "", examples: [""], deckId: selectedDeck || "" });
    } catch { toast.error("Ошибка сохранения"); }
  };

  const handleDeleteCard = async (id: string) => {
    if (!confirm("Удалить карточку?")) return;
    try { await deleteCard(id); toast.success("Удалено"); } catch { toast.error("Ошибка"); }
  };

  const handleCreateDeck = async () => {
    if (!newDeck.name) return;
    try {
      await createDeck(newDeck);
      toast.success("Набор создан!");
      setShowAddDeck(false);
      setNewDeck({ name: "", emoji: "📚", color: "#6366f1" });
    } catch { toast.error("Ошибка"); }
  };

  const EMOJIS = ["📚", "⭐", "🎯", "💡", "🔥", "🌍", "💼", "🏠", "🎵", "🍕", "✈️", "💪"];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📚 Словарь</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddDeck(true)}>
            <Plus size={14} className="mr-1" />Набор
          </Button>
          <Button variant="gradient" size="sm" onClick={() => setShowAddCard(true)}>
            <Plus size={14} className="mr-1" />Карточка
          </Button>
        </div>
      </div>

      {/* AI Quick Add */}
      <div className="glass-card rounded-2xl p-4 flex gap-3 items-center">
        <span className="text-xl">🤖</span>
        <Input
          placeholder="Введи слово для AI-генерации карточки..."
          value={aiWord}
          onChange={(e) => setAiWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAIGenerate()}
          className="flex-1"
        />
        <Button variant="gradient" onClick={handleAIGenerate} disabled={aiLoading || !aiWord.trim()}>
          {aiLoading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Wand2 size={16} />}
          <span className="ml-2 hidden sm:inline">Создать</span>
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        {/* Deck filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
          <button
            onClick={() => setSelectedDeck(null)}
            className={cn("px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all", !selectedDeck ? "bg-gradient-to-r from-red-500 to-blue-500 text-white" : "bg-accent text-muted-foreground hover:text-foreground")}
          >
            Все ({cards.length})
          </button>
          {decks.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDeck(d.id)}
              className={cn("px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5", selectedDeck === d.id ? "bg-gradient-to-r from-red-500 to-blue-500 text-white" : "bg-accent text-muted-foreground hover:text-foreground")}
            >
              {d.emoji} {d.name} <span className="opacity-70">({d.cardCount})</span>
            </button>
          ))}
        </div>
        {/* Search + view toggle */}
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-40" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => setView(view === "grid" ? "list" : "grid")}>
            {view === "grid" ? <List size={16} /> : <Grid size={16} />}
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className={cn("grid gap-3", view === "grid" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1")}>
        <AnimatePresence>
          {filteredCards.map((card, i) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: i * 0.03 }}
              className="glass-card rounded-2xl p-4 group card-hover relative"
            >
              {card.aiGenerated && (
                <span className="absolute top-2 right-2 text-xs text-purple-400">🤖</span>
              )}
              <div className="font-bold text-lg mb-1">{card.front}</div>
              {card.pronunciation && <div className="text-xs text-muted-foreground font-mono mb-2">{card.pronunciation}</div>}
              <div className="text-sm text-muted-foreground mb-2">{card.back}</div>
              <div className="flex items-center justify-between mt-3">
                <Badge variant={card.status as any} className="text-xs">{getCardStatusLabel(card.status)}</Badge>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditCard(card)}>
                    <Edit2 size={12} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => handleDeleteCard(card.id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{getNextReviewText(card.nextReview)}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filteredCards.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-4">📭</div>
          <p>Карточек пока нет. Добавь свою первую!</p>
        </div>
      )}

      {/* Add Card Modal */}
      <AnimatePresence>
        {showAddCard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowAddCard(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">Новая карточка</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowAddCard(false)}><X size={18} /></Button>
              </div>
              <div className="space-y-3">
                <Input placeholder="Слово (English)" value={newCard.front} onChange={(e) => setNewCard({ ...newCard, front: e.target.value })} />
                <Input placeholder="Перевод (Русский)" value={newCard.back} onChange={(e) => setNewCard({ ...newCard, back: e.target.value })} />
                <Input placeholder="Произношение (необязательно)" value={newCard.pronunciation} onChange={(e) => setNewCard({ ...newCard, pronunciation: e.target.value })} />
                <Input placeholder="Пример (необязательно)" value={newCard.examples[0]} onChange={(e) => setNewCard({ ...newCard, examples: [e.target.value] })} />
                <select
                  value={newCard.deckId}
                  onChange={(e) => setNewCard({ ...newCard, deckId: e.target.value })}
                  className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Без набора</option>
                  {decks.map((d) => <option key={d.id} value={d.id}>{d.emoji} {d.name}</option>)}
                </select>
                <Button variant="gradient" className="w-full" onClick={handleSaveCard}>
                  <Check size={16} className="mr-2" />Сохранить
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Deck Modal */}
      <AnimatePresence>
        {showAddDeck && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowAddDeck(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">Новый набор</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowAddDeck(false)}><X size={18} /></Button>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex gap-1 flex-wrap">
                    {EMOJIS.map((e) => (
                      <button key={e} onClick={() => setNewDeck({ ...newDeck, emoji: e })}
                        className={cn("text-xl p-1.5 rounded-lg transition-all", newDeck.emoji === e ? "bg-accent ring-2 ring-primary" : "hover:bg-accent")}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
                <Input placeholder="Название набора" value={newDeck.name} onChange={(e) => setNewDeck({ ...newDeck, name: e.target.value })} />
                <Button variant="gradient" className="w-full" onClick={handleCreateDeck}>Создать</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
