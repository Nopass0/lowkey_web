import Elysia from "elysia";
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

export const progressRoutes = new Elysia({ prefix: "/progress" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  .get("/", async ({ headers, query, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    const days = parseInt(query.days || "30");
    const from = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    const progress = await db.findMany("EnglishProgress", {
      filters: [db.filter.eq("userId", user.id), db.filter.gte("date", from)],
      sort: [{ field: "date", direction: "asc" }],
    });
    return progress;
  })

  .get("/summary", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }

    const [allCards, allSessions, allProgress] = await Promise.all([
      db.findMany("EnglishCards", { filters: [db.filter.eq("userId", user.id)], limit: 2000 }),
      db.findMany("EnglishStudySessions", { filters: [db.filter.eq("userId", user.id)], limit: 200 }),
      db.findMany("EnglishProgress", { filters: [db.filter.eq("userId", user.id)], limit: 365 }),
    ]);

    const masteredCards = allCards.filter((c: any) => c.status === "mastered").length;
    const learningCards = allCards.filter((c: any) => c.status === "learning").length;
    const newCards = allCards.filter((c: any) => c.status === "new").length;
    const reviewCards = allCards.filter((c: any) => c.status === "review").length;

    const now = new Date();
    const dueCards = allCards.filter((c: any) =>
      !c.nextReview || new Date(c.nextReview) <= now || c.status === "new"
    ).length;

    const totalStudied = allProgress.reduce((s: number, p: any) => s + (p.cardsStudied || 0), 0);
    const totalMinutes = allProgress.reduce((s: number, p: any) => s + (p.minutesStudied || 0), 0);
    const totalXp = user.xp || 0;

    // Cards by status distribution
    const cardsByStatus = { new: newCards, learning: learningCards, review: reviewCards, mastered: masteredCards };

    // Accuracy
    const totalCorrect = allCards.reduce((s: number, c: any) => s + (c.correctCount || 0), 0);
    const totalReviewed = allCards.reduce((s: number, c: any) => s + (c.reviewCount || 0), 0);
    const accuracy = totalReviewed > 0 ? Math.round((totalCorrect / totalReviewed) * 100) : 0;

    return {
      totalCards: allCards.length,
      dueCards,
      cardsByStatus,
      totalStudied,
      totalMinutes,
      totalXp,
      accuracy,
      streak: user.studyStreak || 0,
      level: user.level || "beginner",
      dailyGoal: user.dailyGoal || 20,
    };
  })

  .get("/heatmap", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    const from = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
    const progress = await db.findMany("EnglishProgress", {
      filters: [db.filter.eq("userId", user.id), db.filter.gte("date", from)],
      sort: [{ field: "date", direction: "asc" }],
      limit: 366,
    });
    return progress.map((p: any) => ({ date: p.date, count: p.cardsStudied || 0, xp: p.xpEarned || 0 }));
  });
