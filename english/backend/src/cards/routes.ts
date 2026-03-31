import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db } from "../db";
import { config } from "../config";
import { sm2, getDueCards, getCardStatus, calculateXp } from "./spaced-repetition";

async function getUser(headers: any, jwtInstance: any, set: any) {
  const token = headers.authorization?.replace("Bearer ", "");
  if (!token) { set.status = 401; throw new Error("Unauthorized"); }
  const payload = await jwtInstance.verify(token);
  if (!payload) { set.status = 401; throw new Error("Invalid token"); }
  const user = await db.findOne("EnglishUsers", [db.filter.eq("id", (payload as any).userId)]);
  if (!user) { set.status = 404; throw new Error("Not found"); }
  return user;
}

export const cardsRoutes = new Elysia({ prefix: "/cards" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  // === DECKS ===
  .get("/decks", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const decks = await db.findMany("EnglishDecks", {
      filters: [db.filter.eq("userId", user.id)],
      sort: [{ field: "createdAt", direction: "asc" }],
    });
    return decks;
  })
  .post("/decks", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const deck = await db.create("EnglishDecks", {
      userId: user.id,
      ...body,
      cardCount: 0,
    });
    return deck;
  }, {
    body: t.Object({
      name: t.String(),
      description: t.Optional(t.String()),
      emoji: t.Optional(t.String()),
      color: t.Optional(t.String()),
      category: t.Optional(t.String()),
      isPublic: t.Optional(t.Boolean()),
    }),
  })
  .patch("/decks/:id", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const deck = await db.findOne("EnglishDecks", [
      db.filter.eq("id", params.id),
      db.filter.eq("userId", user.id),
    ]);
    if (!deck) { set.status = 404; return { error: "Not found" }; }
    return db.update("EnglishDecks", params.id, body);
  }, { body: t.Object({ name: t.Optional(t.String()), description: t.Optional(t.String()), emoji: t.Optional(t.String()), color: t.Optional(t.String()), isPublic: t.Optional(t.Boolean()) }) })
  .delete("/decks/:id", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const deck = await db.findOne("EnglishDecks", [
      db.filter.eq("id", params.id),
      db.filter.eq("userId", user.id),
    ]);
    if (!deck) { set.status = 404; return { error: "Not found" }; }
    await db.delete("EnglishDecks", params.id);
    // Delete all cards in deck
    const cards = await db.findMany("EnglishCards", [db.filter.eq("deckId", params.id)]);
    for (const card of cards) await db.delete("EnglishCards", card.id);
    return { success: true };
  })

  // === DECK IMAGE UPLOAD ===
  .post("/decks/:id/upload-image", async ({ headers, params, jwt, set, request }) => {
    const user = await getUser(headers, jwt, set);
    const deck = await db.findOne("EnglishDecks", [
      db.filter.eq("id", params.id),
      db.filter.eq("userId", user.id),
    ]);
    if (!deck) { set.status = 404; return { error: "Not found" }; }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) { set.status = 400; return { error: "No file" }; }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    if (!["jpg","jpeg","png","webp"].includes(ext)) { set.status = 400; return { error: "Invalid type" }; }
    if (file.size > 5 * 1024 * 1024) { set.status = 400; return { error: "Too large" }; }

    const { mkdir } = await import("node:fs/promises");
    await mkdir("./uploads/decks", { recursive: true });
    const filename = `${params.id}.${ext}`;
    await Bun.write(`./uploads/decks/${filename}`, await file.arrayBuffer());
    const imageUrl = `/uploads/decks/${filename}`;
    return db.update("EnglishDecks", params.id, { imageUrl });
  })

  // === CARDS ===
  .get("/", async ({ headers, query, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const filters: any[] = [db.filter.eq("userId", user.id)];
    if (query.deckId) filters.push(db.filter.eq("deckId", query.deckId));
    if (query.status) filters.push(db.filter.eq("status", query.status));
    if (query.tag) filters.push(db.filter.contains("tags", query.tag));
    const cards = await db.findMany("EnglishCards", {
      filters,
      sort: [{ field: "createdAt", direction: "desc" }],
      limit: parseInt(query.limit || "100"),
      offset: parseInt(query.offset || "0"),
    });
    return cards;
  })
  .get("/due", async ({ headers, query, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const filters: any[] = [db.filter.eq("userId", user.id)];
    if (query.deckId) filters.push(db.filter.eq("deckId", query.deckId));
    const allCards = await db.findMany("EnglishCards", { filters, limit: 500 });
    const due = getDueCards(allCards);
    return { cards: due, total: due.length };
  })
  .post("/", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const card = await db.create("EnglishCards", {
      userId: user.id,
      ...body,
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      reviewCount: 0,
      correctCount: 0,
      status: "new",
      nextReview: new Date().toISOString(),
      aiGenerated: false,
    });
    if (body.deckId) {
      const deck = await db.findOne("EnglishDecks", [db.filter.eq("id", body.deckId)]);
      if (deck) await db.update("EnglishDecks", body.deckId, { cardCount: (deck.cardCount || 0) + 1 });
    }
    return card;
  }, {
    body: t.Object({
      front: t.String(),
      back: t.String(),
      deckId: t.Optional(t.String()),
      pronunciation: t.Optional(t.String()),
      examples: t.Optional(t.Array(t.String())),
      tags: t.Optional(t.Array(t.String())),
      imageUrl: t.Optional(t.String()),
      audioUrl: t.Optional(t.String()),
    }),
  })
  .patch("/:id", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const card = await db.findOne("EnglishCards", [
      db.filter.eq("id", params.id),
      db.filter.eq("userId", user.id),
    ]);
    if (!card) { set.status = 404; return { error: "Not found" }; }
    return db.update("EnglishCards", params.id, body);
  }, {
    body: t.Object({
      front: t.Optional(t.String()),
      back: t.Optional(t.String()),
      deckId: t.Optional(t.String()),
      pronunciation: t.Optional(t.String()),
      examples: t.Optional(t.Array(t.String())),
      tags: t.Optional(t.Array(t.String())),
    }),
  })
  .delete("/:id", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const card = await db.findOne("EnglishCards", [
      db.filter.eq("id", params.id),
      db.filter.eq("userId", user.id),
    ]);
    if (!card) { set.status = 404; return { error: "Not found" }; }
    if (card.deckId) {
      const deck = await db.findOne("EnglishDecks", [db.filter.eq("id", card.deckId)]);
      if (deck) await db.update("EnglishDecks", card.deckId, { cardCount: Math.max(0, (deck.cardCount || 1) - 1) });
    }
    await db.delete("EnglishCards", params.id);
    return { success: true };
  })

  // === REVIEW (SM-2) ===
  .post("/review", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const { cardId, quality, sessionId } = body;
    const card = await db.findOne("EnglishCards", [
      db.filter.eq("id", cardId),
      db.filter.eq("userId", user.id),
    ]);
    if (!card) { set.status = 404; return { error: "Card not found" }; }

    const result = sm2({ easeFactor: card.easeFactor, interval: card.interval, repetitions: card.repetitions }, quality);
    const isCorrect = quality >= 3;
    const newStatus = getCardStatus({ ...card, ...result });
    const xp = calculateXp(quality, user.studyStreak > 0);

    await db.update("EnglishCards", cardId, {
      easeFactor: result.easeFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      nextReview: result.nextReview.toISOString(),
      lastReview: new Date().toISOString(),
      reviewCount: (card.reviewCount || 0) + 1,
      correctCount: (card.correctCount || 0) + (isCorrect ? 1 : 0),
      status: newStatus,
    });

    await db.create("EnglishCardReviews", {
      userId: user.id,
      cardId,
      sessionId: sessionId || null,
      quality,
      previousInterval: card.interval,
      newInterval: result.interval,
      previousEaseFactor: card.easeFactor,
      newEaseFactor: result.easeFactor,
    });

    // Update user XP
    await db.update("EnglishUsers", user.id, { xp: (user.xp || 0) + xp });

    // Update daily progress
    const today = new Date().toISOString().split("T")[0];
    const progress = await db.findOne("EnglishProgress", [
      db.filter.eq("userId", user.id),
      db.filter.eq("date", today),
    ]);
    if (progress) {
      await db.update("EnglishProgress", progress.id, {
        cardsStudied: (progress.cardsStudied || 0) + 1,
        cardsCorrect: (progress.cardsCorrect || 0) + (isCorrect ? 1 : 0),
        xpEarned: (progress.xpEarned || 0) + xp,
      });
    } else {
      await db.create("EnglishProgress", {
        userId: user.id,
        date: today,
        cardsStudied: 1,
        cardsCorrect: isCorrect ? 1 : 0,
        xpEarned: xp,
        minutesStudied: 0,
        streak: user.studyStreak || 0,
        goalsCompleted: false,
      });
    }

    return { success: true, xpEarned: xp, nextReview: result.nextReview, newStatus };
  }, {
    body: t.Object({
      cardId: t.String(),
      quality: t.Number({ minimum: 0, maximum: 5 }),
      sessionId: t.Optional(t.String()),
    }),
  })

  // === STUDY SESSION ===
  .post("/sessions", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const session = await db.create("EnglishStudySessions", {
      userId: user.id,
      deckId: body.deckId || null,
      mode: body.mode || "review",
      totalCards: 0,
      correctCards: 0,
      incorrectCards: 0,
      durationSeconds: 0,
      xpEarned: 0,
    });
    return session;
  }, {
    body: t.Object({
      deckId: t.Optional(t.String()),
      mode: t.Optional(t.String()),
    }),
  })
  .patch("/sessions/:id", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const session = await db.findOne("EnglishStudySessions", [
      db.filter.eq("id", params.id),
      db.filter.eq("userId", user.id),
    ]);
    if (!session) { set.status = 404; return { error: "Not found" }; }

    const updateData: any = { ...body };
    if (body.completed) {
      updateData.completedAt = new Date().toISOString();
      // Update streak
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      let streak = user.studyStreak || 0;
      if (user.lastStudyDate === yesterday) {
        streak += 1;
      } else if (user.lastStudyDate !== today) {
        streak = 1;
      }
      await db.update("EnglishUsers", user.id, { studyStreak: streak, lastStudyDate: today });
    }
    return db.update("EnglishStudySessions", params.id, updateData);
  }, {
    body: t.Object({
      totalCards: t.Optional(t.Number()),
      correctCards: t.Optional(t.Number()),
      incorrectCards: t.Optional(t.Number()),
      durationSeconds: t.Optional(t.Number()),
      xpEarned: t.Optional(t.Number()),
      completed: t.Optional(t.Boolean()),
    }),
  })
  .get("/sessions", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const sessions = await db.findMany("EnglishStudySessions", {
      filters: [db.filter.eq("userId", user.id)],
      sort: [{ field: "createdAt", direction: "desc" }],
      limit: 20,
    });
    return sessions;
  })

  // === IMAGE UPLOAD ===
  .post("/:id/upload-image", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const card = await db.findOne("EnglishCards", [
      db.filter.eq("id", params.id),
      db.filter.eq("userId", user.id),
    ]);
    if (!card) { set.status = 404; return { error: "Not found" }; }

    const { file } = body as { file: File };
    if (!file) { set.status = 400; return { error: "No file provided" }; }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const allowed = ["jpg", "jpeg", "png", "webp", "gif"];
    if (!allowed.includes(ext)) { set.status = 400; return { error: "Invalid file type" }; }

    const fileName = `card_${params.id}_${Date.now()}.${ext}`;
    const filePath = `${config.uploadsDir}/cards/${fileName}`;

    const { mkdir, writeFile } = await import("fs/promises");
    await mkdir(`${config.uploadsDir}/cards`, { recursive: true });
    const buffer = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(buffer));

    const imageUrl = `/uploads/cards/${fileName}`;
    await db.update("EnglishCards", params.id, { imageUrl });
    return { imageUrl };
  }, {
    body: t.Object({ file: t.File() }),
  })

  // AI bulk generate by topic
  .post("/generate-by-topic", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const { topic, count = 10, level = "intermediate", deckId } = body as any;

    const { getAiSettings } = await import("../ai/settings");
    const settings = await getAiSettings();

    if (!settings.apiKey || !settings.model) {
      set.status = 503;
      return { error: "AI not configured" };
    }

    const systemPrompt = `You are an English teacher creating high-quality flashcards for Russian learners. Return ONLY valid JSON array.`;
    const prompt = `Create ${count} English vocabulary flashcards on the topic: "${topic}".
Level: ${level}.

Return JSON array:
[
  {
    "front": "English word or phrase",
    "back": "Перевод на русском",
    "pronunciation": "/IPA/",
    "examples": ["English example 1.", "English example 2."],
    "tags": ["topic", "partOfSpeech"]
  }
]
Make cards varied - include nouns, verbs, phrases, idioms related to the topic. Ensure IPA pronunciation is correct.`;

    let cards: any[] = [];
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
          max_tokens: 3000,
          temperature: 0.7,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        const match = text.match(/\[[\s\S]*\]/);
        if (match) cards = JSON.parse(match[0]);
      }
    } catch {}

    const created = [];
    for (const c of cards.slice(0, count)) {
      const card = await db.create("EnglishCards", {
        userId: user.id,
        deckId: deckId || null,
        front: c.front,
        back: c.back,
        pronunciation: c.pronunciation || "",
        examples: c.examples || [],
        tags: c.tags || [topic],
        aiGenerated: true,
        easeFactor: 2.5,
        interval: 1,
        repetitions: 0,
        reviewCount: 0,
        correctCount: 0,
        status: "new",
        nextReview: new Date().toISOString(),
      });
      created.push(card);
    }

    if (deckId && created.length > 0) {
      const deck = await db.findOne("EnglishDecks", [db.filter.eq("id", deckId)]);
      if (deck) await db.update("EnglishDecks", deckId, { cardCount: (deck.cardCount || 0) + created.length });
    }

    return { cards: created, count: created.length };
  }, {
    body: t.Object({
      topic: t.String(),
      count: t.Optional(t.Number()),
      level: t.Optional(t.String()),
      deckId: t.Optional(t.String()),
    }),
  });
