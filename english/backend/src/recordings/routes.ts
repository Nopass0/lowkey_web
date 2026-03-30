import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { db } from "../db";
import { config } from "../config";
import { mkdir } from "fs/promises";
import { join } from "path";

async function getUser(headers: any, jwtInstance: any, set: any) {
  const token = headers.authorization?.replace("Bearer ", "");
  if (!token) { set.status = 401; throw new Error("Unauthorized"); }
  const payload = await jwtInstance.verify(token);
  if (!payload) { set.status = 401; throw new Error("Invalid token"); }
  return db.findOne("EnglishUsers", [db.filter.eq("id", (payload as any).userId)]);
}

export const recordingsRoutes = new Elysia({ prefix: "/recordings" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  .get("/", async ({ headers, query, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    const recordings = await db.findMany("EnglishRecordings", {
      filters: [db.filter.eq("userId", user.id)],
      sort: [{ field: "createdAt", direction: "desc" }],
      limit: parseInt(query.limit || "20"),
      offset: parseInt(query.offset || "0"),
    });
    return recordings;
  })

  .post("/upload", async ({ headers, body, jwt, set, request }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }

    const uploadDir = join(config.uploadsDir, "recordings", user.id);
    try { await mkdir(uploadDir, { recursive: true }); } catch {}

    const formData = await request.formData();
    const file = formData.get("audio") as File;
    const title = formData.get("title") as string || `Запись ${new Date().toLocaleDateString("ru")}`;
    const cardId = formData.get("cardId") as string || undefined;
    const type = formData.get("type") as string || "practice";

    if (!file) { set.status = 400; return { error: "No audio file" }; }

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.webm`;
    const filePath = join(uploadDir, filename);
    const buffer = await file.arrayBuffer();
    await Bun.write(filePath, buffer);

    const audioUrl = `/uploads/recordings/${user.id}/${filename}`;
    const durationSeconds = parseInt(formData.get("duration") as string || "0");

    const recording = await db.create("EnglishRecordings", {
      userId: user.id,
      cardId: cardId || null,
      title,
      audioUrl,
      durationSeconds,
      type,
      transcription: null,
      score: null,
      feedback: null,
    });

    // Update daily progress
    const today = new Date().toISOString().split("T")[0];
    const progress = await db.findOne("EnglishProgress", [
      db.filter.eq("userId", user.id),
      db.filter.eq("date", today),
    ]);
    const minutesStudied = Math.ceil(durationSeconds / 60);
    if (progress) {
      await db.update("EnglishProgress", progress.id, {
        minutesStudied: (progress.minutesStudied || 0) + minutesStudied,
      });
    }

    return recording;
  })

  .patch("/:id", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    const recording = await db.findOne("EnglishRecordings", [
      db.filter.eq("id", params.id),
      db.filter.eq("userId", user.id),
    ]);
    if (!recording) { set.status = 404; return { error: "Not found" }; }
    return db.update("EnglishRecordings", params.id, body);
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      transcription: t.Optional(t.String()),
      score: t.Optional(t.Number()),
      feedback: t.Optional(t.String()),
    }),
  })

  .delete("/:id", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    const recording = await db.findOne("EnglishRecordings", [
      db.filter.eq("id", params.id),
      db.filter.eq("userId", user.id),
    ]);
    if (!recording) { set.status = 404; return { error: "Not found" }; }
    await db.delete("EnglishRecordings", params.id);
    return { success: true };
  })

  .get("/stats", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    if (!user) { set.status = 401; return { error: "Unauthorized" }; }
    const recordings = await db.findMany("EnglishRecordings", {
      filters: [db.filter.eq("userId", user.id)],
      limit: 500,
    });
    const totalDuration = recordings.reduce((sum: number, r: any) => sum + (r.durationSeconds || 0), 0);
    const avgScore = recordings.filter((r: any) => r.score !== null).reduce((sum: number, r: any, _: any, arr: any[]) => sum + r.score / arr.length, 0);
    return {
      total: recordings.length,
      totalMinutes: Math.floor(totalDuration / 60),
      avgScore: Math.round(avgScore),
      thisWeek: recordings.filter((r: any) => {
        const date = new Date(r.createdAt);
        const weekAgo = new Date(Date.now() - 7 * 86400000);
        return date >= weekAgo;
      }).length,
    };
  });
