import { create } from "zustand";
import { cardsApi } from "@/api/client";

export interface Deck {
  id: string;
  userId: string;
  name: string;
  description?: string;
  emoji: string;
  color: string;
  cardCount: number;
  category: string;
  isPublic: boolean;
  createdAt: string;
}

export interface Card {
  id: string;
  userId: string;
  deckId?: string;
  front: string;
  back: string;
  pronunciation?: string;
  audioUrl?: string;
  imageUrl?: string;
  examples: string[];
  tags: string[];
  difficulty: number;
  nextReview: string;
  lastReview?: string;
  reviewCount: number;
  correctCount: number;
  easeFactor: number;
  interval: number;
  repetitions: number;
  status: "new" | "learning" | "review" | "mastered";
  aiGenerated: boolean;
  createdAt: string;
}

interface CardsStore {
  decks: Deck[];
  cards: Card[];
  dueCards: Card[];
  currentSession: any | null;
  isLoading: boolean;
  fetchDecks: () => Promise<void>;
  fetchCards: (params?: any) => Promise<void>;
  fetchDueCards: (params?: any) => Promise<void>;
  createDeck: (data: any) => Promise<Deck>;
  updateDeck: (id: string, data: any) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;
  createCard: (data: any) => Promise<Card>;
  updateCard: (id: string, data: any) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  reviewCard: (cardId: string, quality: number, sessionId?: string) => Promise<any>;
  startSession: (data?: any) => Promise<any>;
  finishSession: (id: string, data: any) => Promise<void>;
}

export const useCardsStore = create<CardsStore>((set, get) => ({
  decks: [],
  cards: [],
  dueCards: [],
  currentSession: null,
  isLoading: false,

  fetchDecks: async () => {
    const decks = await cardsApi.getDecks();
    set({ decks });
  },

  fetchCards: async (params) => {
    set({ isLoading: true });
    const cards = await cardsApi.getCards(params);
    set({ cards, isLoading: false });
  },

  fetchDueCards: async (params) => {
    const { cards } = await cardsApi.getDueCards(params);
    set({ dueCards: cards });
  },

  createDeck: async (data) => {
    const deck = await cardsApi.createDeck(data);
    set((s) => ({ decks: [...s.decks, deck] }));
    return deck;
  },

  updateDeck: async (id, data) => {
    const updated = await cardsApi.updateDeck(id, data);
    set((s) => ({ decks: s.decks.map((d) => (d.id === id ? updated : d)) }));
  },

  deleteDeck: async (id) => {
    await cardsApi.deleteDeck(id);
    set((s) => ({ decks: s.decks.filter((d) => d.id !== id) }));
  },

  createCard: async (data) => {
    const card = await cardsApi.createCard(data);
    set((s) => ({ cards: [card, ...s.cards] }));
    // Update deck count in store
    if (card.deckId) {
      set((s) => ({
        decks: s.decks.map((d) => d.id === card.deckId ? { ...d, cardCount: d.cardCount + 1 } : d),
      }));
    }
    return card;
  },

  updateCard: async (id, data) => {
    const updated = await cardsApi.updateCard(id, data);
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? updated : c)) }));
  },

  deleteCard: async (id) => {
    const card = get().cards.find((c) => c.id === id);
    await cardsApi.deleteCard(id);
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
    if (card?.deckId) {
      set((s) => ({
        decks: s.decks.map((d) => d.id === card.deckId ? { ...d, cardCount: Math.max(0, d.cardCount - 1) } : d),
      }));
    }
  },

  reviewCard: async (cardId, quality, sessionId) => {
    const result = await cardsApi.review({ cardId, quality, sessionId });
    set((s) => ({
      dueCards: s.dueCards.filter((c) => c.id !== cardId),
      cards: s.cards.map((c) => c.id === cardId ? { ...c, status: result.newStatus } : c),
    }));
    return result;
  },

  startSession: async (data) => {
    const session = await cardsApi.createSession(data || {});
    set({ currentSession: session });
    return session;
  },

  finishSession: async (id, data) => {
    await cardsApi.updateSession(id, { ...data, completed: true });
    set({ currentSession: null });
  },
}));
