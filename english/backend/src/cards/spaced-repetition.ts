// SM-2 Spaced Repetition Algorithm
export interface SM2Card {
  easeFactor: number;  // EF: 1.3 - 2.5
  interval: number;   // days
  repetitions: number;
}

export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: Date;
}

/**
 * quality: 0-5 (0=complete blackout, 5=perfect recall)
 */
export function sm2(card: SM2Card, quality: number): SM2Result {
  let { easeFactor, interval, repetitions } = card;

  if (quality >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    repetitions = 0;
    interval = 1;
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);
  nextReview.setHours(0, 0, 0, 0);

  return { easeFactor, interval, repetitions, nextReview };
}

export function getDueCards(cards: any[]): any[] {
  const now = new Date();
  return cards.filter(card => {
    if (card.status === "new") return true;
    if (!card.nextReview) return true;
    return new Date(card.nextReview) <= now;
  });
}

export function getCardStatus(card: any): "new" | "learning" | "review" | "mastered" {
  if (card.repetitions === 0) return "new";
  if (card.interval < 7) return "learning";
  if (card.interval < 21) return "review";
  return "mastered";
}

export function calculateXp(quality: number, isStreak: boolean): number {
  const base = quality >= 4 ? 10 : quality >= 3 ? 5 : 1;
  return isStreak ? base * 2 : base;
}
