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

async function callOpenRouter(prompt: string, systemPrompt: string, maxTokens = 2000) {
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
        max_tokens: maxTokens,
        temperature: 0.8,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch { return null; }
}

const DIFFICULTY_TOPICS: Record<string, string[][]> = {
  easy: [
    ["greetings", "introductions"],
    ["daily routines", "present simple"],
    ["shopping", "numbers", "prices"],
    ["food and drink", "ordering in a cafe"],
    ["directions", "locations"],
  ],
  medium: [
    ["job interview", "professional English", "modal verbs"],
    ["travel", "airport", "booking a hotel"],
    ["health", "doctor appointment", "giving advice"],
    ["social media", "expressing opinions", "present perfect"],
    ["problem solving", "negotiation", "conditionals"],
  ],
  hard: [
    ["business meeting", "formal English", "passive voice", "reported speech"],
    ["debate", "persuasion", "advanced vocabulary", "complex grammar"],
    ["cultural differences", "idiomatic expressions", "nuanced communication"],
    ["crisis management", "diplomatic language", "conditionals", "modal verbs"],
  ],
};

export const questsRoutes = new Elysia({ prefix: "/quests" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  // Get available quests (generate fresh ones if needed)
  .get("/", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const existing = await db.findMany("EnglishQuests", {
      sort: [{ field: "createdAt", direction: "desc" }],
      limit: 20,
    });
    return existing;
  })

  // Generate a new quest using AI
  .post("/generate", async ({ headers, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const { difficulty = "easy", customTopics } = body as { difficulty?: string; customTopics?: string[] };

    const topicSets = DIFFICULTY_TOPICS[difficulty] || DIFFICULTY_TOPICS.easy;
    const randomTopicSet = customTopics || topicSets[Math.floor(Math.random() * topicSets.length)];

    const systemPrompt = `You are a creative English language learning quest designer. Create immersive, realistic situational scenarios that test English communication skills. Always return valid JSON only.`;

    const prompt = `Create an English learning quest with difficulty "${difficulty}" covering these topics: ${randomTopicSet.join(", ")}.

The quest should be a realistic life scenario where the learner must communicate in English to achieve a goal.

Return JSON:
{
  "title": "Quest title (short, engaging)",
  "description": "Brief description (1-2 sentences)",
  "scenario": "Detailed scenario description explaining the situation, setting, characters, and what the learner must do. At least 100 words. Be specific and immersive.",
  "difficulty": "${difficulty}",
  "topics": ${JSON.stringify(randomTopicSet)},
  "objectives": [
    "Specific communication objective 1",
    "Specific communication objective 2",
    "Specific communication objective 3"
  ],
  "hints": [
    "Useful vocabulary hint",
    "Grammar structure hint",
    "Phrase you could use"
  ],
  "xpReward": ${difficulty === "easy" ? 50 : difficulty === "medium" ? 100 : 200}
}`;

    const aiResponse = await callOpenRouter(prompt, systemPrompt, 1500);
    let questData: any = null;

    if (aiResponse) {
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        questData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch { questData = null; }
    }

    if (!questData) {
      questData = {
        title: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Challenge`,
        description: `Practice your English skills in a real-world scenario`,
        scenario: `You are in a situation where you need to communicate in English about ${randomTopicSet.join(" and ")}. Use your English knowledge to handle this situation successfully.`,
        difficulty,
        topics: randomTopicSet,
        objectives: ["Communicate clearly", "Use appropriate vocabulary", "Apply correct grammar"],
        hints: ["Think about the vocabulary you know", "Use complete sentences", "Be polite and clear"],
        xpReward: difficulty === "easy" ? 50 : difficulty === "medium" ? 100 : 200,
      };
    }

    const quest = await db.create("EnglishQuests", { ...questData, aiGenerated: true });
    return quest;
  }, {
    body: t.Object({
      difficulty: t.Optional(t.String()),
      customTopics: t.Optional(t.Array(t.String())),
    }),
  })

  // Start a quest attempt
  .post("/:id/start", async ({ headers, params, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const quest = await db.findOne("EnglishQuests", [db.filter.eq("id", params.id)]);
    if (!quest) { set.status = 404; return { error: "Quest not found" }; }

    const attempt = await db.create("EnglishQuestAttempts", {
      userId: user.id,
      questId: params.id,
      status: "in_progress",
    });
    return { attempt, quest };
  })

  // Submit quest attempt for AI evaluation
  .post("/:id/submit", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const { attemptId, userResponse } = body as { attemptId: string; userResponse: string };

    const quest = await db.findOne("EnglishQuests", [db.filter.eq("id", params.id)]);
    if (!quest) { set.status = 404; return { error: "Quest not found" }; }

    const attempt = await db.findOne("EnglishQuestAttempts", [
      db.filter.eq("id", attemptId),
      db.filter.eq("userId", user.id),
    ]);
    if (!attempt) { set.status = 404; return { error: "Attempt not found" }; }

    // AI evaluation
    const systemPrompt = `You are an expert English teacher evaluating a student's response to a situational language task. Be constructive, encouraging, and precise. Return only valid JSON.`;

    const prompt = `Quest scenario: "${quest.scenario}"
Quest objectives: ${JSON.stringify(quest.objectives)}
Quest difficulty: ${quest.difficulty}
Topics covered: ${JSON.stringify(quest.topics)}

Student's English response:
"${userResponse}"

Evaluate the response and return JSON:
{
  "score": <0-100>,
  "grade": "<A/B/C/D/F>",
  "summary": "2-3 sentence overall assessment",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement area 1", "improvement area 2"],
  "grammarErrors": [
    {"error": "actual text", "correction": "corrected text", "explanation": "why"}
  ],
  "vocabularyFeedback": "comment on vocabulary usage",
  "communicationFeedback": "comment on how well they achieved the quest objective",
  "alternativePhrase": "A better way to say the key part of their response"
}`;

    const aiResponse = await callOpenRouter(prompt, systemPrompt, 2000);
    let evaluation: any = null;

    if (aiResponse) {
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch { evaluation = null; }
    }

    if (!evaluation) {
      evaluation = {
        score: 70,
        grade: "C",
        summary: "Your response showed effort. Keep practicing to improve your English communication skills.",
        strengths: ["Attempted the task", "Used relevant vocabulary"],
        improvements: ["Work on grammar accuracy", "Expand your vocabulary"],
        grammarErrors: [],
        vocabularyFeedback: "Good attempt at using relevant vocabulary.",
        communicationFeedback: "You communicated the basic idea but could be more detailed.",
        alternativePhrase: "Consider using more specific language for this situation.",
      };
    }

    const xpEarned = Math.round((evaluation.score / 100) * quest.xpReward);

    await db.update("EnglishQuestAttempts", attemptId, {
      userResponse,
      aiScore: evaluation.score,
      aiFeedback: evaluation.summary,
      aiDetails: evaluation,
      status: "completed",
      xpEarned,
      completedAt: new Date().toISOString(),
    });

    await db.update("EnglishUsers", user.id, { xp: (user.xp || 0) + xpEarned });

    return { evaluation, xpEarned, attempt: { ...attempt, status: "completed" } };
  }, {
    body: t.Object({
      attemptId: t.String(),
      userResponse: t.String(),
    }),
  })

  // Get user quest history
  .get("/history", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const attempts = await db.findMany("EnglishQuestAttempts", {
      filters: [db.filter.eq("userId", user.id)],
      sort: [{ field: "startedAt", direction: "desc" }],
      limit: 20,
    });

    const withQuests = await Promise.all(
      attempts.map(async (a) => {
        const quest = await db.findOne("EnglishQuests", [db.filter.eq("id", a.questId)]);
        return { ...a, quest };
      })
    );
    return withQuests;
  })

  // Get leaderboard
  .get("/leaderboard", async ({ headers, jwt, set }) => {
    await getUser(headers, jwt, set);
    const attempts = await db.findMany("EnglishQuestAttempts", {
      filters: [db.filter.eq("status", "completed")],
      sort: [{ field: "aiScore", direction: "desc" }],
      limit: 50,
    });

    const userScores = new Map<string, { userId: string; totalXp: number; quests: number; avgScore: number }>();
    for (const a of attempts) {
      const entry = userScores.get(a.userId) || { userId: a.userId, totalXp: 0, quests: 0, avgScore: 0 };
      entry.totalXp += a.xpEarned || 0;
      entry.quests += 1;
      entry.avgScore = Math.round(((entry.avgScore * (entry.quests - 1)) + (a.aiScore || 0)) / entry.quests);
      userScores.set(a.userId, entry);
    }

    const sorted = Array.from(userScores.values()).sort((a, b) => b.totalXp - a.totalXp).slice(0, 10);
    const withUsers = await Promise.all(
      sorted.map(async (entry) => {
        const user = await db.findOne("EnglishUsers", [db.filter.eq("id", entry.userId)]);
        return { ...entry, name: user?.name || "Unknown", avatarUrl: user?.avatarUrl };
      })
    );
    return withUsers;
  });
