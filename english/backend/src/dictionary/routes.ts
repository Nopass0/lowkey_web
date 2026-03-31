import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { config } from "../config";
import { db } from "../db";
import { getAiSettings } from "../ai/settings";

async function getUser(headers: any, jwtInstance: any, set: any) {
  const token = headers.authorization?.replace("Bearer ", "");
  if (!token) { set.status = 401; throw new Error("Unauthorized"); }
  const payload = await jwtInstance.verify(token);
  if (!payload) { set.status = 401; throw new Error("Invalid token"); }
  const user = await db.findOne("EnglishUsers", [db.filter.eq("id", (payload as any).userId)]);
  if (!user) { set.status = 404; throw new Error("Not found"); }
  return user;
}

async function callOpenRouter(prompt: string, systemPrompt: string) {
  const settings = await getAiSettings();
  if (!settings.apiKey || !settings.model) return null;
  try {
    const res = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`,
        "HTTP-Referer": settings.siteUrl,
        "X-Title": settings.siteName,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch { return null; }
}

// Fetch from Free Dictionary API
async function fetchFromFreeDictionary(word: string) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const entry = data[0];
    const phonetic = entry.phonetics?.find((p: any) => p.text)?.text || entry.phonetic || "";
    const audioUrl = entry.phonetics?.find((p: any) => p.audio && p.audio.length > 0)?.audio || "";

    const definitions: any[] = [];
    const examples: any[] = [];
    const synonyms: Set<string> = new Set();
    const antonyms: Set<string> = new Set();
    let partOfSpeech = "";

    for (const meaning of entry.meanings || []) {
      if (!partOfSpeech) partOfSpeech = meaning.partOfSpeech;
      for (const def of meaning.definitions?.slice(0, 3) || []) {
        definitions.push({
          partOfSpeech: meaning.partOfSpeech,
          definition: def.definition,
          example: def.example || null,
        });
        if (def.example) examples.push({ en: def.example, partOfSpeech: meaning.partOfSpeech });
      }
      for (const s of meaning.synonyms?.slice(0, 5) || []) synonyms.add(s);
      for (const a of meaning.antonyms?.slice(0, 5) || []) antonyms.add(a);
    }

    return {
      word: entry.word,
      pronunciation: phonetic,
      phonetic,
      definitions,
      examples,
      synonyms: Array.from(synonyms).slice(0, 8),
      antonyms: Array.from(antonyms).slice(0, 8),
      audioUrl: audioUrl.startsWith("//") ? `https:${audioUrl}` : audioUrl,
      origin: entry.origin || null,
      partOfSpeech,
    };
  } catch {
    return null;
  }
}

// Enrich with AI (Russian translation, advanced examples)
async function enrichWithAI(word: string, freeApiData: any) {
  const systemPrompt = `You are an English-Russian dictionary. Return ONLY valid JSON with Russian translations and usage context.`;
  const prompt = `For the English word "${word}", provide:
1. Russian translation(s) (most common first)
2. 3 example sentences in English with Russian translations (level: everyday usage)
3. Common collocations (word combinations)
4. Register/usage note (formal/informal/neutral)

Return JSON:
{
  "russianTranslations": ["перевод1", "перевод2"],
  "enrichedExamples": [
    {"en": "example sentence", "ru": "перевод примера"},
    {"en": "example sentence 2", "ru": "перевод примера 2"},
    {"en": "example sentence 3", "ru": "перевод примера 3"}
  ],
  "collocations": ["common collocation 1", "common collocation 2"],
  "register": "formal/informal/neutral",
  "usageNote": "short usage tip in Russian"
}`;

  const response = await callOpenRouter(prompt, systemPrompt);
  if (!response) return null;

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch { return null; }
}

export const dictionaryRoutes = new Elysia({ prefix: "/dictionary" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  // Lookup a word
  .get("/lookup/:word", async ({ headers, params, jwt, set }) => {
    await getUser(headers, jwt, set);
    const word = params.word.toLowerCase().trim();

    // Check cache first
    const cached = await db.findOne("EnglishDictionaryCache", [db.filter.eq("word", word)]);
    if (cached) {
      const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
      if (cacheAge < 7 * 24 * 60 * 60 * 1000) return cached;
    }

    // Fetch from free dictionary API
    const freeData = await fetchFromFreeDictionary(word);

    // Enrich with AI (Russian translations + examples)
    const aiEnrichment = await enrichWithAI(word, freeData);

    const result = {
      word,
      pronunciation: freeData?.phonetic || "",
      phonetic: freeData?.phonetic || "",
      audioUrl: freeData?.audioUrl || "",
      partOfSpeech: freeData?.partOfSpeech || "",
      origin: freeData?.origin || null,
      definitions: freeData?.definitions || [],
      examples: [
        ...(freeData?.examples || []),
        ...(aiEnrichment?.enrichedExamples || []),
      ],
      synonyms: freeData?.synonyms || [],
      antonyms: freeData?.antonyms || [],
      russianTranslations: aiEnrichment?.russianTranslations || [],
      collocations: aiEnrichment?.collocations || [],
      register: aiEnrichment?.register || "neutral",
      usageNote: aiEnrichment?.usageNote || null,
    };

    // Cache the result
    if (cached) {
      await db.update("EnglishDictionaryCache", cached.id, { ...result, cachedAt: new Date().toISOString() });
    } else {
      await db.create("EnglishDictionaryCache", result);
    }

    return result;
  })

  // Search words (autocomplete)
  .get("/search", async ({ headers, query, jwt, set }) => {
    await getUser(headers, jwt, set);
    const q = (query.q || "").toLowerCase().trim();
    if (!q || q.length < 2) return { words: [] };

    const cached = await db.findMany("EnglishDictionaryCache", {
      filters: [db.filter.contains("word", q)],
      limit: 10,
    });
    return { words: cached.map((c) => c.word) };
  })

  // Get word of the day
  .get("/word-of-day", async ({ headers, jwt, set }) => {
    await getUser(headers, jwt, set);
    const DAILY_WORDS = [
      "serendipity", "ephemeral", "eloquent", "resilient", "tenacious",
      "ambivalent", "pragmatic", "meticulous", "diligent", "perseverance",
      "innovation", "sustainable", "versatile", "profound", "authentic",
      "empathy", "integrity", "momentum", "catalyst", "paradigm",
    ];

    const today = new Date().toISOString().split("T")[0];
    const idx = today.split("-").reduce((a, b) => a + parseInt(b), 0) % DAILY_WORDS.length;
    const word = DAILY_WORDS[idx];

    const cached = await db.findOne("EnglishDictionaryCache", [db.filter.eq("word", word)]);
    if (cached) return { ...cached, date: today };

    const freeData = await fetchFromFreeDictionary(word);
    const aiEnrichment = await enrichWithAI(word, freeData);

    const result = {
      word,
      pronunciation: freeData?.phonetic || "",
      phonetic: freeData?.phonetic || "",
      audioUrl: freeData?.audioUrl || "",
      partOfSpeech: freeData?.partOfSpeech || "",
      origin: freeData?.origin || null,
      definitions: freeData?.definitions || [],
      examples: [...(freeData?.examples || []), ...(aiEnrichment?.enrichedExamples || [])],
      synonyms: freeData?.synonyms || [],
      antonyms: freeData?.antonyms || [],
      russianTranslations: aiEnrichment?.russianTranslations || [],
      collocations: aiEnrichment?.collocations || [],
      register: aiEnrichment?.register || "neutral",
      usageNote: aiEnrichment?.usageNote || null,
    };

    await db.create("EnglishDictionaryCache", result);
    return { ...result, date: today };
  })

  // Save word as flashcard
  .post("/save-card", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const { word, deckId } = body as { word: string; deckId?: string };

    const cached = await db.findOne("EnglishDictionaryCache", [db.filter.eq("word", word)]);
    if (!cached) { set.status = 404; return { error: "Word not found in dictionary" }; }

    const translation = (cached.russianTranslations as string[])?.[0] || cached.definitions?.[0]?.definition || word;
    const examples = (cached.examples as any[])?.slice(0, 2).map((e: any) => e.en).filter(Boolean) || [];

    const card = await db.create("EnglishCards", {
      userId: user.id,
      deckId: deckId || null,
      front: word,
      back: translation,
      pronunciation: cached.pronunciation || "",
      examples,
      tags: [cached.partOfSpeech, "dictionary"].filter(Boolean),
      aiGenerated: true,
    });

    return card;
  }, {
    body: t.Object({
      word: t.String(),
      deckId: t.Optional(t.String()),
    }),
  });
