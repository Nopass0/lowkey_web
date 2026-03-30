import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db } from "../db";
import { config } from "../config";

async function getUser(headers: any, jwtInstance: any, set: any) {
  const token = headers.authorization?.replace("Bearer ", "");
  if (!token) { set.status = 401; throw new Error("Unauthorized"); }
  const payload = await jwtInstance.verify(token);
  if (!payload) { set.status = 401; throw new Error("Invalid token"); }
  return db.findOne("EnglishUsers", [db.filter.eq("id", (payload as any).userId)]);
}

export const gamesRoutes = new Elysia({ prefix: "/games" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  .post("/session", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    const session = await db.create("EnglishGameSessions", {
      userId: user.id,
      gameType: body.gameType || "association",
      score: 0,
      totalRounds: 0,
      correctAnswers: 0,
      durationSeconds: 0,
      xpEarned: 0,
      wordsLearned: [],
    });
    return session;
  }, {
    body: t.Object({ gameType: t.Optional(t.String()) }),
  })

  .patch("/session/:id", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    const session = await db.findOne("EnglishGameSessions", [
      db.filter.eq("id", params.id),
      db.filter.eq("userId", user.id),
    ]);
    if (!session) { set.status = 404; return { error: "Not found" }; }

    const updated = await db.update("EnglishGameSessions", params.id, body);

    // If finishing game, save words as cards and award XP
    if (body.wordsLearned && body.wordsLearned.length > 0) {
      const xp = (body.correctAnswers || 0) * 15;
      await db.update("EnglishUsers", user.id, {
        xp: (user.xp || 0) + xp,
      });

      // Update daily progress
      const today = new Date().toISOString().split("T")[0];
      const progress = await db.findOne("EnglishProgress", [
        db.filter.eq("userId", user.id),
        db.filter.eq("date", today),
      ]);
      if (progress) {
        await db.update("EnglishProgress", progress.id, {
          xpEarned: (progress.xpEarned || 0) + xp,
          minutesStudied: (progress.minutesStudied || 0) + Math.ceil((body.durationSeconds || 0) / 60),
        });
      }
    }

    return updated;
  }, {
    body: t.Object({
      score: t.Optional(t.Number()),
      totalRounds: t.Optional(t.Number()),
      correctAnswers: t.Optional(t.Number()),
      durationSeconds: t.Optional(t.Number()),
      xpEarned: t.Optional(t.Number()),
      wordsLearned: t.Optional(t.Array(t.String())),
    }),
  })

  // Save game word as flashcard
  .post("/save-word", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }

    // Find default deck or create one
    let deck = await db.findOne("EnglishDecks", [
      db.filter.eq("userId", user.id),
      db.filter.eq("name", "Из игр"),
    ]);
    if (!deck) {
      deck = await db.create("EnglishDecks", {
        userId: user.id,
        name: "Из игр",
        description: "Слова, изученные в играх",
        emoji: "🎮",
        color: "#ec4899",
        category: "games",
        cardCount: 0,
      });
    }

    // Check if card already exists
    const existing = await db.findOne("EnglishCards", [
      db.filter.eq("userId", user.id),
      db.filter.eq("front", body.front),
    ]);
    if (existing) return { card: existing, alreadyExists: true };

    const card = await db.create("EnglishCards", {
      userId: user.id,
      deckId: deck.id,
      front: body.front,
      back: body.back,
      pronunciation: body.pronunciation || null,
      examples: body.examples || [],
      tags: [...(body.tags || []), "game"],
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      reviewCount: 0,
      correctCount: 0,
      status: "new",
      nextReview: new Date().toISOString(),
      aiGenerated: true,
    });

    await db.update("EnglishDecks", deck.id, { cardCount: (deck.cardCount || 0) + 1 });
    return { card, alreadyExists: false };
  }, {
    body: t.Object({
      front: t.String(),
      back: t.String(),
      pronunciation: t.Optional(t.String()),
      examples: t.Optional(t.Array(t.String())),
      tags: t.Optional(t.Array(t.String())),
    }),
  })

  .get("/leaderboard", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    const topUsers = await db.findMany("EnglishUsers", {
      sort: [{ field: "xp", direction: "desc" }],
      limit: 10,
    });
    return topUsers.map((u: any, i: number) => ({
      rank: i + 1,
      name: u.name,
      xp: u.xp || 0,
      level: u.level || "beginner",
      streak: u.studyStreak || 0,
      isMe: u.id === user.id,
    }));
  })

  .get("/history", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    return db.findMany("EnglishGameSessions", {
      filters: [db.filter.eq("userId", user.id)],
      sort: [{ field: "createdAt", direction: "desc" }],
      limit: 20,
    });
  });
