import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatRelative(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Сегодня";
  if (days === 1) return "Вчера";
  if (days < 7) return `${days} дней назад`;
  return formatDate(date);
}

export function getNextReviewText(nextReview: string | null): string {
  if (!nextReview) return "Сейчас";
  const d = new Date(nextReview);
  const now = new Date();
  if (d <= now) return "Сейчас";
  const diff = d.getTime() - now.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (hours < 1) return "Менее часа";
  if (hours < 24) return `Через ${hours} ч`;
  if (days === 1) return "Завтра";
  return `Через ${days} дней`;
}

export function getLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    beginner: "Начинающий",
    elementary: "Элементарный",
    intermediate: "Средний",
    "upper-intermediate": "Выше среднего",
    advanced: "Продвинутый",
    proficient: "Свободный",
  };
  return labels[level] || level;
}

export function getXpForLevel(xp: number): { level: string; current: number; next: number; label: string } {
  const thresholds = [
    { xp: 0, level: "beginner", label: "Начинающий" },
    { xp: 500, level: "elementary", label: "Элементарный" },
    { xp: 1500, level: "intermediate", label: "Средний" },
    { xp: 3000, level: "upper-intermediate", label: "Выше среднего" },
    { xp: 6000, level: "advanced", label: "Продвинутый" },
    { xp: 12000, level: "proficient", label: "Свободный" },
  ];
  let current = thresholds[0];
  let next = thresholds[1];
  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= thresholds[i].xp) {
      current = thresholds[i];
      next = thresholds[i + 1] || thresholds[i];
    }
  }
  return { level: current.level, current: xp - current.xp, next: next.xp - current.xp, label: current.label };
}

export function getCardStatusColor(status: string): string {
  switch (status) {
    case "new": return "text-blue-500";
    case "learning": return "text-yellow-500";
    case "review": return "text-purple-500";
    case "mastered": return "text-green-500";
    default: return "text-muted-foreground";
  }
}

export function getCardStatusLabel(status: string): string {
  switch (status) {
    case "new": return "Новая";
    case "learning": return "Изучается";
    case "review": return "Повторение";
    case "mastered": return "Освоена";
    default: return status;
  }
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}с`;
  return `${m}м ${s}с`;
}

export const DIFFICULTY_LABELS: Record<number, string> = {
  0: "Не знаю",
  1: "Плохо",
  2: "С трудом",
  3: "Нормально",
  4: "Хорошо",
  5: "Отлично",
};

export const DIFFICULTY_COLORS: Record<number, string> = {
  0: "bg-red-500 hover:bg-red-600",
  1: "bg-orange-500 hover:bg-orange-600",
  2: "bg-yellow-500 hover:bg-yellow-600",
  3: "bg-lime-500 hover:bg-lime-600",
  4: "bg-green-500 hover:bg-green-600",
  5: "bg-emerald-500 hover:bg-emerald-600",
};
