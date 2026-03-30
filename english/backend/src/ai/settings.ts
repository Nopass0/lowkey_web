import { config } from "../config";
import { db } from "../db";

const AI_SETTINGS_KEY = "ai";
const SETTINGS_COLLECTION = "EnglishSiteSettings";

type StoredAiSettings = {
  id: string;
  key: string;
  provider?: string;
  openRouterApiKey?: string;
  openRouterModel?: string;
  openRouterBaseUrl?: string;
  siteUrl?: string;
  siteName?: string;
  temperature?: number;
  maxTokens?: number;
  updatedAt?: string;
};

export type OpenRouterSettings = {
  provider: "openrouter";
  apiKey: string;
  model: string;
  baseUrl: string;
  siteUrl: string;
  siteName: string;
  temperature: number;
  maxTokens: number;
  updatedAt: string | null;
  source: "database" | "environment" | "default";
};

function normalizedString(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizedNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function maskApiKey(apiKey: string) {
  if (!apiKey) {
    return null;
  }

  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}***`;
  }

  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

async function getStoredAiSettings() {
  return db.findOne(SETTINGS_COLLECTION, [db.filter.eq("key", AI_SETTINGS_KEY)]) as Promise<StoredAiSettings | null>;
}

function resolveSource(stored: StoredAiSettings | null) {
  if (stored?.openRouterApiKey || stored?.openRouterModel || stored?.openRouterBaseUrl) {
    return "database";
  }

  if (
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_MODEL ||
    process.env.OPENROUTER_DEFAULT_MODEL ||
    process.env.OPENROUTER_URL ||
    process.env.OPENROUTER_SITE_URL ||
    process.env.OPENROUTER_SITE_NAME ||
    process.env.OPENROUTER_TEMPERATURE ||
    process.env.OPENROUTER_MAX_TOKENS
  ) {
    return "environment";
  }

  return "default";
}

function resolveSettings(stored: StoredAiSettings | null): OpenRouterSettings {
  const apiKey = normalizedString(stored?.openRouterApiKey, config.openrouter.apiKey);
  const model = normalizedString(stored?.openRouterModel, config.openrouter.model);
  const baseUrl = normalizedString(stored?.openRouterBaseUrl, config.openrouter.url);
  const siteUrl = normalizedString(stored?.siteUrl, config.openrouter.siteUrl);
  const siteName = normalizedString(stored?.siteName, config.openrouter.siteName);
  const temperature = normalizedNumber(stored?.temperature, config.openrouter.temperature);
  const maxTokens = normalizedNumber(stored?.maxTokens, config.openrouter.maxTokens);

  return {
    provider: "openrouter",
    apiKey,
    model,
    baseUrl,
    siteUrl,
    siteName,
    temperature,
    maxTokens,
    updatedAt: stored?.updatedAt || null,
    source: resolveSource(stored),
  };
}

export async function getAiSettings() {
  return resolveSettings(await getStoredAiSettings());
}

export async function getPublicAiSettings() {
  const settings = await getAiSettings();

  return {
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    siteUrl: settings.siteUrl,
    siteName: settings.siteName,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    hasApiKey: Boolean(settings.apiKey),
    maskedApiKey: maskApiKey(settings.apiKey),
    source: settings.source,
    updatedAt: settings.updatedAt,
  };
}

export async function saveAiSettings(input: {
  apiKey?: string;
  clearApiKey?: boolean;
  model?: string;
  baseUrl?: string;
  siteUrl?: string;
  siteName?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const existing = await getStoredAiSettings();
  const current = resolveSettings(existing);
  const nextApiKey = input.clearApiKey
    ? ""
    : (typeof input.apiKey === "string" && input.apiKey.trim()) || existing?.openRouterApiKey || "";

  const payload = {
    key: AI_SETTINGS_KEY,
    provider: "openrouter",
    openRouterApiKey: nextApiKey,
    openRouterModel: normalizedString(input.model, current.model),
    openRouterBaseUrl: normalizedString(input.baseUrl, current.baseUrl),
    siteUrl: normalizedString(input.siteUrl, current.siteUrl),
    siteName: normalizedString(input.siteName, current.siteName),
    temperature: normalizedNumber(input.temperature, current.temperature),
    maxTokens: normalizedNumber(input.maxTokens, current.maxTokens),
  };

  if (existing) {
    await db.update(SETTINGS_COLLECTION, existing.id, payload);
  } else {
    await db.create(SETTINGS_COLLECTION, payload);
  }

  return getPublicAiSettings();
}
