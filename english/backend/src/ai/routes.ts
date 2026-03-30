import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db } from "../db";
import { getAiSettings } from "./settings";

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
  if (!settings.apiKey || !settings.model) {
    return null;
  }

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
        max_tokens: settings.maxTokens,
        temperature: settings.temperature,
      }),
    });

    if (!res.ok) {
      const details = await res.text().catch(() => "");
      throw new Error(`OpenRouter error: ${res.status} ${details.slice(0, 400)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.error("[openrouter]", error);
    return null;
  }
}

function fallbackCardGeneration(word: string) {
  return {
    front: word,
    back: `[Translation of "${word}"]`,
    pronunciation: `/${word}/`,
    examples: [`I use the word "${word}" in a sentence.`, `Another example with "${word}".`],
    tags: ["generated", "vocabulary"],
  };
}

export const aiRoutes = new Elysia({ prefix: "/ai" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  // Generate flashcard from word
  .post("/generate-card", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const { word, targetLanguage = "Russian", context } = body;

    const systemPrompt = `You are an English language teacher creating flashcards for Russian-speaking learners.
Return ONLY valid JSON in this exact format:
{
  "front": "English word or phrase",
  "back": "Russian translation",
  "pronunciation": "IPA transcription",
  "examples": ["example sentence 1", "example sentence 2"],
  "tags": ["category1", "category2"]
}`;

    const prompt = `Create a flashcard for the English word/phrase: "${word}"
${context ? `Context: ${context}` : ""}
Target translation language: ${targetLanguage}
Include 2 example sentences, IPA pronunciation, and relevant tags (e.g., noun, verb, business, everyday, etc.)`;

    const aiResponse = await callOpenRouter(prompt, systemPrompt);

    let cardData;
    if (aiResponse) {
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        cardData = jsonMatch ? JSON.parse(jsonMatch[0]) : fallbackCardGeneration(word);
      } catch {
        cardData = fallbackCardGeneration(word);
      }
    } else {
      cardData = fallbackCardGeneration(word);
    }

    return { ...cardData, aiGenerated: true };
  }, {
    body: t.Object({
      word: t.String(),
      targetLanguage: t.Optional(t.String()),
      context: t.Optional(t.String()),
    }),
  })

  // Generate multiple cards from text
  .post("/generate-cards-bulk", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user.isPremium && user.role !== "admin") {
      set.status = 403;
      return { error: "Premium required for bulk generation" };
    }
    const { text, count = 10 } = body;

    const systemPrompt = `You are an English language teacher. Extract key vocabulary from the provided text and create flashcards for Russian-speaking learners.
Return ONLY valid JSON array:
[{"front": "word", "back": "перевод", "pronunciation": "/word/", "examples": ["..."], "tags": ["..."]}]`;

    const prompt = `Extract ${count} key English vocabulary words/phrases from this text and create flashcards:\n\n${text}`;

    const aiResponse = await callOpenRouter(prompt, systemPrompt);

    let cards = [];
    if (aiResponse) {
      try {
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        cards = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch {
        cards = [];
      }
    }

    return { cards: cards.map((c: any) => ({ ...c, aiGenerated: true })) };
  }, {
    body: t.Object({
      text: t.String(),
      count: t.Optional(t.Number()),
    }),
  })

  // AI association game word
  .post("/association-game", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const { words, difficulty = "medium" } = body;

    const systemPrompt = `You are creating an English word association game for language learners.
Return ONLY valid JSON in this format:
{
  "targetWord": "word to guess",
  "clues": ["clue1", "clue2", "clue3", "clue4"],
  "category": "category name",
  "definition": "brief definition",
  "translation": "Russian translation",
  "pronunciation": "/pronunciation/",
  "examples": ["example sentence"]
}`;

    const excludeWords = words?.join(", ") || "";
    const prompt = `Create an association game round for ${difficulty} level English learner.
${excludeWords ? `Avoid these recently used words: ${excludeWords}` : ""}
Create 4 progressive clues (from hard to easy) that help guess the target word.
Choose an interesting, useful everyday English word.`;

    const aiResponse = await callOpenRouter(prompt, systemPrompt);

    let gameData;
    if (aiResponse) {
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        gameData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        gameData = null;
      }
    }

    if (!gameData) {
      // Fallback word list
      const fallbacks = [
        { targetWord: "ambiguous", clues: ["Not clear", "Can be interpreted multiple ways", "Causes confusion", "Neither yes nor no"], category: "adjectives", definition: "open to more than one interpretation", translation: "неоднозначный", pronunciation: "/æmˈbɪɡjuəs/", examples: ["The message was ambiguous."] },
        { targetWord: "resilient", clues: ["Bounces back", "Strong character", "Doesn't give up easily", "Like rubber"], category: "adjectives", definition: "able to recover quickly from difficulties", translation: "стойкий", pronunciation: "/rɪˈzɪliənt/", examples: ["She is very resilient."] },
      ];
      gameData = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    return gameData;
  }, {
    body: t.Object({
      words: t.Optional(t.Array(t.String())),
      difficulty: t.Optional(t.String()),
    }),
  })

  // Analyze pronunciation recording
  .post("/analyze-pronunciation", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const { word, transcription } = body;

    const systemPrompt = `You are an English pronunciation coach analyzing a learner's pronunciation attempt.
Return ONLY valid JSON:
{
  "score": 75,
  "feedback": "General feedback",
  "corrections": ["specific correction 1", "specific correction 2"],
  "tips": ["improvement tip 1", "improvement tip 2"],
  "phonemes": [{"sound": "/æ/", "correct": true, "note": "..."}]
}`;

    const prompt = `The learner tried to pronounce the word "${word}".
Their phonetic attempt: "${transcription}"
Correct IPA: "${body.correctIpa || word}"
Analyze their pronunciation accuracy (score 0-100) and provide constructive feedback in Russian.`;

    const aiResponse = await callOpenRouter(prompt, systemPrompt);

    let analysis = { score: 70, feedback: "Хорошая попытка! Продолжайте практиковаться.", corrections: [], tips: ["Слушайте носителей языка", "Практикуйтесь каждый день"], phonemes: [] };

    if (aiResponse) {
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
      } catch {}
    }

    return analysis;
  }, {
    body: t.Object({
      word: t.String(),
      transcription: t.String(),
      correctIpa: t.Optional(t.String()),
    }),
  })

  // Daily learning plan
  .get("/daily-plan", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);

    const today = new Date().toISOString().split("T")[0];
    const progress = await db.findOne("EnglishProgress", [
      db.filter.eq("userId", user.id),
      db.filter.eq("date", today),
    ]);

    const dueCards = await db.findMany("EnglishCards", {
      filters: [db.filter.eq("userId", user.id)],
      limit: 200,
    });

    const now = new Date();
    const dueCount = dueCards.filter(c => !c.nextReview || new Date(c.nextReview) <= now || c.status === "new").length;

    return {
      dueCards: dueCount,
      dailyGoal: user.dailyGoal || 20,
      studiedToday: progress?.cardsStudied || 0,
      xpToday: progress?.xpEarned || 0,
      streak: user.studyStreak || 0,
      level: user.level || "beginner",
      suggestions: [
        dueCount > 0 ? `Повторите ${Math.min(dueCount, user.dailyGoal || 20)} карточек` : "Все карточки повторены!",
        "Сыграйте в игру ассоциаций для запоминания новых слов",
        "Запишите произношение 3 сложных слов",
      ].filter(Boolean),
    };
  });
