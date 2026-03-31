import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { config } from "../config";
import { db } from "../db";
import { getAiSettings } from "../ai/settings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUser(headers: any, jwtInstance: any, set: any) {
  const token = headers.authorization?.replace("Bearer ", "");
  if (!token) { set.status = 401; throw new Error("Unauthorized"); }
  const payload = await jwtInstance.verify(token);
  if (!payload) { set.status = 401; throw new Error("Invalid token"); }
  const user = await db.findOne("EnglishUsers", [db.filter.eq("id", (payload as any).userId)]);
  if (!user) { set.status = 404; throw new Error("Not found"); }
  return user;
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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
        max_tokens: settings.maxTokens,
        temperature: settings.temperature,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch { return null; }
}

// Auto-grade a single question answer
function gradeQuestion(question: any, userAnswer: any): boolean {
  const type = question.type || question.questionType;
  const correct = question.correctAnswer ?? question.answer;

  if (type === "single_choice" || type === "fill_blank" || type === "text_input") {
    return String(userAnswer).trim().toLowerCase() === String(correct).trim().toLowerCase();
  }
  if (type === "multiple_choice") {
    const ua = Array.isArray(userAnswer) ? [...userAnswer].sort() : [userAnswer].sort();
    const ca = Array.isArray(correct) ? [...correct].sort() : [correct].sort();
    return JSON.stringify(ua) === JSON.stringify(ca);
  }
  if (type === "match" || type === "order") {
    const ua = Array.isArray(userAnswer) ? userAnswer : [];
    const ca = Array.isArray(correct) ? correct : [];
    return JSON.stringify(ua) === JSON.stringify(ca);
  }
  return false;
}

// Get member record for user in group
async function getMembership(groupId: string, userId: string) {
  return db.findOne("EnglishGroupMembers", [
    db.filter.eq("groupId", groupId),
    db.filter.eq("userId", userId),
  ]);
}

// Require member; returns membership or throws
async function requireMember(groupId: string, userId: string, set: any) {
  const m = await getMembership(groupId, userId);
  if (!m) { set.status = 403; throw new Error("Forbidden"); }
  return m;
}

// Require teacher or owner
async function requireTeacher(groupId: string, userId: string, set: any) {
  const m = await requireMember(groupId, userId, set);
  if (m.role !== "owner" && m.role !== "teacher") { set.status = 403; throw new Error("Forbidden"); }
  return m;
}

// Require owner
async function requireOwner(groupId: string, userId: string, set: any) {
  const m = await requireMember(groupId, userId, set);
  if (m.role !== "owner") { set.status = 403; throw new Error("Forbidden"); }
  return m;
}

// Enrich member list with user info
async function enrichMembers(members: any[]) {
  return Promise.all(
    members.map(async (m) => {
      const u = await db.findOne("EnglishUsers", [db.filter.eq("id", m.userId)]);
      return {
        ...m,
        name: u?.name || "Пользователь",
        avatarUrl: u?.avatarUrl || null,
        level: u?.level || "beginner",
      };
    })
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const socialRoutes = new Elysia({ prefix: "/social" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  // =========================================================================
  // LEADERBOARD
  // =========================================================================

  .get("/leaderboard", async ({ headers, query, jwt, set }) => {
    await getUser(headers, jwt, set);
    const type = (query as any).type || "xp";
    const limit = Math.min(parseInt((query as any).limit || "50"), 100);

    let sortField = "xp";
    if (type === "streak") sortField = "studyStreak";
    if (type === "cards") sortField = "xp"; // we'll compute cards separately

    const users = await db.findMany("EnglishUsers", {
      sort: [{ field: sortField, direction: "desc" }],
      limit,
    });

    const result = await Promise.all(
      users.map(async (u: any, idx: number) => {
        let cardsCount = 0;
        if (type === "cards") {
          const cards = await db.findMany("EnglishCards", {
            filters: [db.filter.eq("userId", u.id)],
            limit: 1,
          });
          // Just count via reviews
          const reviews = await db.findMany("EnglishCardReviews", {
            filters: [db.filter.eq("userId", u.id)],
            limit: 1,
          });
          cardsCount = reviews.length > 0 ? reviews.length : (cards.length || 0);
        }
        return {
          rank: idx + 1,
          userId: u.id,
          name: u.name,
          avatarUrl: u.avatarUrl || null,
          xp: u.xp || 0,
          studyStreak: u.studyStreak || 0,
          level: u.level || "beginner",
          cardsCount,
        };
      })
    );

    if (type === "cards") {
      result.sort((a, b) => b.cardsCount - a.cardsCount);
      result.forEach((r, i) => { r.rank = i + 1; });
    }

    return result;
  })

  // =========================================================================
  // PUBLIC PROFILE
  // =========================================================================

  .get("/profile/:userId", async ({ headers, params, jwt, set }) => {
    await getUser(headers, jwt, set);
    const target = await db.findOne("EnglishUsers", [db.filter.eq("id", params.userId)]);
    if (!target) { set.status = 404; return { error: "Not found" }; }

    // Count stats
    const [grammarResults, questAttempts, studySessions, cards] = await Promise.all([
      db.findMany("EnglishGrammarTestResults", { filters: [db.filter.eq("userId", params.userId)], limit: 1000 }),
      db.findMany("EnglishQuestAttempts", { filters: [db.filter.eq("userId", params.userId)], limit: 1000 }),
      db.findMany("EnglishStudySessions", { filters: [db.filter.eq("userId", params.userId)], limit: 1000 }),
      db.findMany("EnglishCards", { filters: [db.filter.eq("userId", params.userId)], limit: 1000 }),
    ]);

    // Recent activity: last 12 weeks progress
    const progress = await db.findMany("EnglishProgress", {
      filters: [db.filter.eq("userId", params.userId)],
      sort: [{ field: "date", direction: "desc" }],
      limit: 84,
    });

    const cardsLearned = cards.filter((c: any) => c.reviewCount > 0).length;
    const testsCompleted = grammarResults.length;
    const questsDone = questAttempts.filter((a: any) => a.status === "completed").length;
    const writingSessions = studySessions.filter((s: any) => s.mode === "writing").length;

    return {
      userId: target.id,
      name: target.name,
      avatarUrl: target.avatarUrl || null,
      level: target.level || "beginner",
      xp: target.xp || 0,
      studyStreak: target.studyStreak || 0,
      isPremium: target.isPremium || false,
      joinedDate: target.createdAt,
      stats: {
        cardsLearned,
        testsCompleted,
        questsDone,
        writingSessions,
      },
      recentActivity: progress.slice(0, 84),
    };
  })

  // =========================================================================
  // GROUPS
  // =========================================================================

  // Create group
  .post("/groups", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const { name, description, emoji, color, isPublic, tags } = body as any;
    if (!name) { set.status = 400; return { error: "name required" }; }

    let inviteCode = generateInviteCode();
    // Ensure uniqueness
    let existing = await db.findOne("EnglishGroups", [db.filter.eq("inviteCode", inviteCode)]);
    while (existing) {
      inviteCode = generateInviteCode();
      existing = await db.findOne("EnglishGroups", [db.filter.eq("inviteCode", inviteCode)]);
    }

    const group = await db.create("EnglishGroups", {
      name,
      description: description || null,
      ownerId: user.id,
      inviteCode,
      emoji: emoji || "📚",
      color: color || "#6366f1",
      isPublic: isPublic || false,
      tags: tags || [],
      memberCount: 1,
      courseCount: 0,
    });

    await db.create("EnglishGroupMembers", {
      groupId: group.id,
      userId: user.id,
      role: "owner",
    });

    return group;
  })

  // My groups
  .get("/groups", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const memberships = await db.findMany("EnglishGroupMembers", {
      filters: [db.filter.eq("userId", user.id)],
      limit: 100,
    });
    const groups = await Promise.all(
      memberships.map(async (m: any) => {
        const g = await db.findOne("EnglishGroups", [db.filter.eq("id", m.groupId)]);
        return g ? { ...g, myRole: m.role } : null;
      })
    );
    return groups.filter(Boolean);
  })

  // Group detail
  .get("/groups/:id", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const group = await db.findOne("EnglishGroups", [db.filter.eq("id", params.id)]);
    if (!group) { set.status = 404; return { error: "Not found" }; }

    const myMembership = await getMembership(params.id, user.id);
    const members = await db.findMany("EnglishGroupMembers", {
      filters: [db.filter.eq("groupId", params.id)],
      limit: 200,
    });
    const enriched = await enrichMembers(members);

    return {
      ...group,
      isMember: !!myMembership,
      myRole: myMembership?.role || null,
      members: enriched,
    };
  })

  // Join group
  .post("/groups/:id/join", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const { inviteCode } = body as any;
    const group = await db.findOne("EnglishGroups", [db.filter.eq("id", params.id)]);
    if (!group) { set.status = 404; return { error: "Not found" }; }
    if (group.inviteCode !== inviteCode) { set.status = 403; return { error: "Неверный код приглашения" }; }

    const existing = await getMembership(params.id, user.id);
    if (existing) return { message: "Already a member", group };

    if ((group.memberCount || 0) >= (group.maxMembers || 50)) {
      set.status = 400; return { error: "Группа заполнена" };
    }

    await db.create("EnglishGroupMembers", {
      groupId: params.id,
      userId: user.id,
      role: "student",
    });
    await db.update("EnglishGroups", params.id, { memberCount: (group.memberCount || 0) + 1 });

    return { message: "Joined", group };
  })

  // Update group (owner/teacher)
  .patch("/groups/:id", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);
    const { name, description, emoji, color } = body as any;
    const update: any = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (emoji !== undefined) update.emoji = emoji;
    if (color !== undefined) update.color = color;
    const updated = await db.update("EnglishGroups", params.id, update);
    return updated;
  })

  // Remove member (owner only)
  .delete("/groups/:id/members/:userId", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireOwner(params.id, user.id, set);
    if (params.userId === user.id) { set.status = 400; return { error: "Cannot remove yourself" }; }

    const membership = await getMembership(params.id, params.userId);
    if (!membership) { set.status = 404; return { error: "Not found" }; }

    await db.delete("EnglishGroupMembers", membership.id);

    const group = await db.findOne("EnglishGroups", [db.filter.eq("id", params.id)]);
    if (group) {
      await db.update("EnglishGroups", params.id, { memberCount: Math.max(0, (group.memberCount || 1) - 1) });
    }

    return { message: "Member removed" };
  })

  // Regenerate invite code (owner)
  .post("/groups/:id/regenerate-invite", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireOwner(params.id, user.id, set);

    let inviteCode = generateInviteCode();
    let existing = await db.findOne("EnglishGroups", [db.filter.eq("inviteCode", inviteCode)]);
    while (existing) {
      inviteCode = generateInviteCode();
      existing = await db.findOne("EnglishGroups", [db.filter.eq("inviteCode", inviteCode)]);
    }

    await db.update("EnglishGroups", params.id, { inviteCode });
    return { inviteCode };
  })

  // =========================================================================
  // COURSES
  // =========================================================================

  // List courses in group
  .get("/groups/:id/courses", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireMember(params.id, user.id, set);
    const courses = await db.findMany("EnglishCourses", {
      filters: [db.filter.eq("groupId", params.id)],
      sort: [{ field: "orderIndex", direction: "asc" }],
      limit: 200,
    });
    return courses;
  })

  // Create course
  .post("/groups/:id/courses", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);
    const { title, description, emoji, color, level, orderIndex } = body as any;
    if (!title) { set.status = 400; return { error: "title required" }; }

    const course = await db.create("EnglishCourses", {
      groupId: params.id,
      authorId: user.id,
      title,
      description: description || null,
      emoji: emoji || "📖",
      color: color || "#6366f1",
      level: level || "beginner",
      isPublished: false,
      blockCount: 0,
      estimatedMinutes: 0,
      orderIndex: orderIndex || 0,
      aiGenerated: false,
    });

    const group = await db.findOne("EnglishGroups", [db.filter.eq("id", params.id)]);
    if (group) {
      await db.update("EnglishGroups", params.id, { courseCount: (group.courseCount || 0) + 1 });
    }

    return course;
  })

  // Get course with blocks + my progress
  .get("/groups/:id/courses/:courseId", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireMember(params.id, user.id, set);

    const course = await db.findOne("EnglishCourses", [
      db.filter.eq("id", params.courseId),
      db.filter.eq("groupId", params.id),
    ]);
    if (!course) { set.status = 404; return { error: "Not found" }; }

    const blocks = await db.findMany("EnglishCourseBlocks", {
      filters: [db.filter.eq("courseId", params.courseId)],
      sort: [{ field: "orderIndex", direction: "asc" }],
      limit: 500,
    });

    const progress = await db.findOne("EnglishStudentProgress", [
      db.filter.eq("userId", user.id),
      db.filter.eq("courseId", params.courseId),
    ]);

    return { course, blocks, progress: progress || null };
  })

  // Update course
  .patch("/groups/:id/courses/:courseId", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);

    const course = await db.findOne("EnglishCourses", [
      db.filter.eq("id", params.courseId),
      db.filter.eq("groupId", params.id),
    ]);
    if (!course) { set.status = 404; return { error: "Not found" }; }

    const { title, description, emoji, color, level, isPublished, estimatedMinutes } = body as any;
    const update: any = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (emoji !== undefined) update.emoji = emoji;
    if (color !== undefined) update.color = color;
    if (level !== undefined) update.level = level;
    if (isPublished !== undefined) update.isPublished = isPublished;
    if (estimatedMinutes !== undefined) update.estimatedMinutes = estimatedMinutes;

    return db.update("EnglishCourses", params.courseId, update);
  })

  // Delete course
  .delete("/groups/:id/courses/:courseId", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);

    const course = await db.findOne("EnglishCourses", [
      db.filter.eq("id", params.courseId),
      db.filter.eq("groupId", params.id),
    ]);
    if (!course) { set.status = 404; return { error: "Not found" }; }

    await db.delete("EnglishCourses", params.courseId);

    const group = await db.findOne("EnglishGroups", [db.filter.eq("id", params.id)]);
    if (group) {
      await db.update("EnglishGroups", params.id, { courseCount: Math.max(0, (group.courseCount || 1) - 1) });
    }

    return { message: "Course deleted" };
  })

  // =========================================================================
  // COURSE BLOCKS
  // =========================================================================

  // Add block
  .post("/groups/:id/courses/:courseId/blocks", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);

    const course = await db.findOne("EnglishCourses", [
      db.filter.eq("id", params.courseId),
      db.filter.eq("groupId", params.id),
    ]);
    if (!course) { set.status = 404; return { error: "Not found" }; }

    const { type, title, content, orderIndex } = body as any;
    if (!type) { set.status = 400; return { error: "type required" }; }

    const block = await db.create("EnglishCourseBlocks", {
      courseId: params.courseId,
      type,
      title: title || null,
      content: content || {},
      orderIndex: orderIndex || 0,
    });

    await db.update("EnglishCourses", params.courseId, {
      blockCount: (course.blockCount || 0) + 1,
    });

    return block;
  })

  // Update block
  .patch("/groups/:id/courses/:courseId/blocks/:blockId", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);

    const block = await db.findOne("EnglishCourseBlocks", [
      db.filter.eq("id", params.blockId),
      db.filter.eq("courseId", params.courseId),
    ]);
    if (!block) { set.status = 404; return { error: "Not found" }; }

    const { type, title, content, orderIndex } = body as any;
    const update: any = {};
    if (type !== undefined) update.type = type;
    if (title !== undefined) update.title = title;
    if (content !== undefined) update.content = content;
    if (orderIndex !== undefined) update.orderIndex = orderIndex;

    return db.update("EnglishCourseBlocks", params.blockId, update);
  })

  // Delete block
  .delete("/groups/:id/courses/:courseId/blocks/:blockId", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);

    const block = await db.findOne("EnglishCourseBlocks", [
      db.filter.eq("id", params.blockId),
      db.filter.eq("courseId", params.courseId),
    ]);
    if (!block) { set.status = 404; return { error: "Not found" }; }

    await db.delete("EnglishCourseBlocks", params.blockId);

    const course = await db.findOne("EnglishCourses", [db.filter.eq("id", params.courseId)]);
    if (course) {
      await db.update("EnglishCourses", params.courseId, {
        blockCount: Math.max(0, (course.blockCount || 1) - 1),
      });
    }

    return { message: "Block deleted" };
  })

  // Reorder blocks
  .post("/groups/:id/courses/:courseId/blocks/reorder", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);

    const { order } = body as { order: Array<{ id: string; orderIndex: number }> };
    if (!Array.isArray(order)) { set.status = 400; return { error: "order must be array" }; }

    await Promise.all(
      order.map(({ id, orderIndex }) => db.update("EnglishCourseBlocks", id, { orderIndex }))
    );

    return { message: "Reordered" };
  })

  // =========================================================================
  // TESTS
  // =========================================================================

  // Create test
  .post("/groups/:id/courses/:courseId/tests", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);

    const { title, description, blockId, timeLimitSeconds, passingScore, questions } = body as any;
    if (!title) { set.status = 400; return { error: "title required" }; }

    const test = await db.create("EnglishCourseTests", {
      courseId: params.courseId,
      groupId: params.id,
      blockId: blockId || null,
      title,
      description: description || null,
      timeLimitSeconds: timeLimitSeconds || null,
      passingScore: passingScore || 70,
      questions: questions || [],
    });

    return test;
  })

  // Get test (hide correct answers for students)
  .get("/groups/:id/courses/:courseId/tests/:testId", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const membership = await requireMember(params.id, user.id, set);

    const test = await db.findOne("EnglishCourseTests", [
      db.filter.eq("id", params.testId),
      db.filter.eq("courseId", params.courseId),
    ]);
    if (!test) { set.status = 404; return { error: "Not found" }; }

    // Teachers/owners see full test
    if (membership.role === "owner" || membership.role === "teacher") {
      return test;
    }

    // Students: strip correct answers
    const sanitizedQuestions = (test.questions || []).map((q: any) => {
      const { correctAnswer, answer, ...rest } = q;
      return rest;
    });
    return { ...test, questions: sanitizedQuestions };
  })

  // Update test
  .patch("/groups/:id/courses/:courseId/tests/:testId", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);

    const test = await db.findOne("EnglishCourseTests", [
      db.filter.eq("id", params.testId),
      db.filter.eq("courseId", params.courseId),
    ]);
    if (!test) { set.status = 404; return { error: "Not found" }; }

    const { title, description, timeLimitSeconds, passingScore, questions } = body as any;
    const update: any = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (timeLimitSeconds !== undefined) update.timeLimitSeconds = timeLimitSeconds;
    if (passingScore !== undefined) update.passingScore = passingScore;
    if (questions !== undefined) update.questions = questions;

    return db.update("EnglishCourseTests", params.testId, update);
  })

  // Delete test
  .delete("/groups/:id/courses/:courseId/tests/:testId", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);

    const test = await db.findOne("EnglishCourseTests", [
      db.filter.eq("id", params.testId),
      db.filter.eq("courseId", params.courseId),
    ]);
    if (!test) { set.status = 404; return { error: "Not found" }; }

    await db.delete("EnglishCourseTests", params.testId);
    return { message: "Test deleted" };
  })

  // Submit test answers
  .post("/groups/:id/courses/:courseId/tests/:testId/submit", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireMember(params.id, user.id, set);

    const test = await db.findOne("EnglishCourseTests", [
      db.filter.eq("id", params.testId),
      db.filter.eq("courseId", params.courseId),
    ]);
    if (!test) { set.status = 404; return { error: "Not found" }; }

    const { answers, timeTakenSeconds } = body as any;
    const questions: any[] = test.questions || [];
    const course = await db.findOne("EnglishCourses", [
      db.filter.eq("id", params.courseId),
      db.filter.eq("groupId", params.id),
    ]);
    let correctCount = 0;

    const graded = (answers || []).map((a: any) => {
      const question = questions.find((q: any) => q.id === a.questionId || q.id === a.id);
      const isCorrect = question ? gradeQuestion(question, a.answer) : false;
      if (isCorrect) correctCount++;
      return {
        questionId: a.questionId || a.id,
        userAnswer: a.answer,
        correct: isCorrect,
        correctAnswer: question?.correctAnswer ?? question?.answer,
      };
    });

    const total = questions.length;
    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = score >= (test.passingScore || 70);

    const attempt = await db.create("EnglishTestAttempts", {
      testId: params.testId,
      userId: user.id,
      groupId: params.id,
      courseId: params.courseId,
      answers: graded,
      score,
      passed,
      timeTakenSeconds: timeTakenSeconds || 0,
    });

    // Update student progress testScores
    let progress = await db.findOne("EnglishStudentProgress", [
      db.filter.eq("userId", user.id),
      db.filter.eq("courseId", params.courseId),
    ]);

    const existingCompletedBlockIds: string[] = Array.isArray(progress?.completedBlockIds)
      ? progress.completedBlockIds
      : [];
    const completedBlockIds = [...existingCompletedBlockIds];

    if (passed && test.blockId && !completedBlockIds.includes(test.blockId)) {
      completedBlockIds.push(test.blockId);
    }

    const percentComplete = course?.blockCount
      ? Math.min(100, Math.round((completedBlockIds.length / course.blockCount) * 100))
      : 0;

    if (!progress) {
      progress = await db.create("EnglishStudentProgress", {
        userId: user.id,
        groupId: params.id,
        courseId: params.courseId,
        completedBlockIds,
        testScores: [{ testId: params.testId, score, passed }],
        percentComplete,
        lastActivityAt: new Date(),
      });
    } else {
      const existingScores: any[] = Array.isArray(progress.testScores) ? progress.testScores : [];
      const filtered = existingScores.filter((s: any) => s.testId !== params.testId);
      filtered.push({ testId: params.testId, score, passed });
      await db.update("EnglishStudentProgress", progress.id, {
        completedBlockIds,
        testScores: filtered,
        percentComplete,
        lastActivityAt: new Date(),
      });
    }

    // Award XP
    if (passed) {
      await db.update("EnglishUsers", user.id, { xp: (user.xp || 0) + Math.round(score / 10) });
    }

    return { attempt, score, passed, graded, correctCount, total };
  })

  // Get my test attempts
  .get("/groups/:id/courses/:courseId/tests/:testId/results", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireMember(params.id, user.id, set);

    const attempts = await db.findMany("EnglishTestAttempts", {
      filters: [
        db.filter.eq("testId", params.testId),
        db.filter.eq("userId", user.id),
      ],
      sort: [{ field: "completedAt", direction: "desc" }],
      limit: 20,
    });
    return attempts;
  })

  // =========================================================================
  // PROGRESS
  // =========================================================================

  // Teacher: all members' progress across all courses
  .get("/groups/:id/progress", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);

    const [members, courses] = await Promise.all([
      db.findMany("EnglishGroupMembers", { filters: [db.filter.eq("groupId", params.id)], limit: 200 }),
      db.findMany("EnglishCourses", { filters: [db.filter.eq("groupId", params.id)], limit: 200 }),
    ]);

    const result = await Promise.all(
      members.map(async (m: any) => {
        const u = await db.findOne("EnglishUsers", [db.filter.eq("id", m.userId)]);
        const progressRecords = await db.findMany("EnglishStudentProgress", {
          filters: [
            db.filter.eq("userId", m.userId),
            db.filter.eq("groupId", params.id),
          ],
          limit: 200,
        });
        const courseProgress = courses.map((c: any) => {
          const p = progressRecords.find((pr: any) => pr.courseId === c.id);
          return {
            courseId: c.id,
            courseTitle: c.title,
            percentComplete: p?.percentComplete || 0,
            completedBlockIds: p?.completedBlockIds || [],
            testScores: p?.testScores || [],
            lastActivityAt: p?.lastActivityAt || null,
          };
        });
        return {
          userId: m.userId,
          name: u?.name || "Пользователь",
          avatarUrl: u?.avatarUrl || null,
          role: m.role,
          courseProgress,
        };
      })
    );

    return { members: result, courses };
  })

  // Student: mark block as completed
  .post("/groups/:id/courses/:courseId/progress/mark-block", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireMember(params.id, user.id, set);

    const { blockId } = body as any;
    if (!blockId) { set.status = 400; return { error: "blockId required" }; }

    const course = await db.findOne("EnglishCourses", [
      db.filter.eq("id", params.courseId),
      db.filter.eq("groupId", params.id),
    ]);
    if (!course) { set.status = 404; return { error: "Not found" }; }

    let progress = await db.findOne("EnglishStudentProgress", [
      db.filter.eq("userId", user.id),
      db.filter.eq("courseId", params.courseId),
    ]);

    if (!progress) {
      progress = await db.create("EnglishStudentProgress", {
        userId: user.id,
        groupId: params.id,
        courseId: params.courseId,
        completedBlockIds: [blockId],
        testScores: [],
        lastActivityAt: new Date(),
        percentComplete: 0,
      });
    } else {
      const ids: string[] = Array.isArray(progress.completedBlockIds) ? progress.completedBlockIds : [];
      if (!ids.includes(blockId)) ids.push(blockId);

      const totalBlocks = course.blockCount || 1;
      const pct = Math.round((ids.length / totalBlocks) * 100);

      await db.update("EnglishStudentProgress", progress.id, {
        completedBlockIds: ids,
        percentComplete: Math.min(100, pct),
        lastActivityAt: new Date(),
      });
      progress = await db.findOne("EnglishStudentProgress", [db.filter.eq("id", progress.id)]);
    }

    return progress;
  })

  // =========================================================================
  // AI COURSE BLOCK GENERATION
  // =========================================================================

  .post("/groups/:id/courses/:courseId/ai-generate-blocks", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    await requireTeacher(params.id, user.id, set);

    if (!user.isPremium) { set.status = 403; return { error: "Premium required" }; }

    const course = await db.findOne("EnglishCourses", [
      db.filter.eq("id", params.courseId),
      db.filter.eq("groupId", params.id),
    ]);
    if (!course) { set.status = 404; return { error: "Not found" }; }

    const { blockTypes, count } = body as any;
    const blockCount = Math.min(count || 3, 5);

    const systemPrompt = `You are an expert English teacher creating course content blocks. Return ONLY valid JSON.`;
    const prompt = `Create ${blockCount} course blocks for an English course titled "${course.title}".
Level: ${course.level}
Description: ${course.description || "not specified"}
Requested block types: ${blockTypes || "text, grammar, cards"}

Return a JSON array of blocks. Each block must have:
- type: "text" | "grammar" | "cards"
- title: string
- content: object appropriate to the type

For "text" blocks, content = { "markdown": "..." }
For "grammar" blocks, content = { "explanation": "...", "rules": [{"rule":"...","example":"..."}], "examples": [{"en":"...","ru":"..."}] }
For "cards" blocks, content = { "cards": [{"front":"word","back":"translation","example":"..."}] } (5-8 cards)

Example:
[
  { "type": "text", "title": "Introduction", "content": { "markdown": "## Welcome\\n\\nIn this lesson..." } },
  { "type": "grammar", "title": "Present Simple", "content": { "explanation": "...", "rules": [], "examples": [] } },
  { "type": "cards", "title": "Vocabulary", "content": { "cards": [{"front":"apple","back":"яблоко","example":"I eat an apple."}] } }
]`;

    const aiResponse = await callOpenRouter(prompt, systemPrompt);
    let blocks: any[] = [];

    if (aiResponse) {
      try {
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        blocks = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch { blocks = []; }
    }

    if (blocks.length === 0) {
      blocks = [
        { type: "text", title: course.title, content: { markdown: `## ${course.title}\n\nДобро пожаловать в этот курс. Начнём изучение!` } },
      ];
    }

    const existingBlocks = await db.findMany("EnglishCourseBlocks", {
      filters: [db.filter.eq("courseId", params.courseId)],
      limit: 1,
    });
    let startIndex = existingBlocks.length;

    const created = [];
    for (const b of blocks.slice(0, blockCount)) {
      const block = await db.create("EnglishCourseBlocks", {
        courseId: params.courseId,
        type: b.type || "text",
        title: b.title || null,
        content: b.content || {},
        orderIndex: startIndex++,
      });
      created.push(block);
    }

    await db.update("EnglishCourses", params.courseId, {
      blockCount: (course.blockCount || 0) + created.length,
      aiGenerated: true,
    });

    return { blocks: created };
  });
