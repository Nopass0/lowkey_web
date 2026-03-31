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
        max_tokens: settings.maxTokens,
        temperature: settings.temperature,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch { return null; }
}

const GRAMMAR_SEED = [
  {
    title: "Present Simple", slug: "present-simple", level: "beginner", category: "tenses",
    description: "Expressing habits, facts, and routines",
    content: "The Present Simple tense is used to describe habitual actions, general truths, and permanent situations. It is formed with the base form of the verb (add -s or -es for third person singular).",
    rules: [
      { rule: "I/You/We/They + base verb", example: "I work every day." },
      { rule: "He/She/It + verb + s/es", example: "She works every day." },
      { rule: "Negatives: don't/doesn't + base verb", example: "He doesn't like coffee." },
      { rule: "Questions: Do/Does + subject + base verb?", example: "Does she speak English?" },
    ],
    examples: [
      { en: "The sun rises in the east.", ru: "Солнце встаёт на востоке." },
      { en: "She always drinks coffee in the morning.", ru: "Она всегда пьёт кофе утром." },
      { en: "Do you understand?", ru: "Ты понимаешь?" },
    ],
    orderIndex: 1,
  },
  {
    title: "Present Continuous", slug: "present-continuous", level: "beginner", category: "tenses",
    description: "Actions happening right now or around the current period",
    content: "Present Continuous describes actions happening at the moment of speaking or temporary situations around the present time. Formed with: to be + verb-ing.",
    rules: [
      { rule: "Subject + am/is/are + verb-ing", example: "I am reading." },
      { rule: "Negative: Subject + am/is/are + not + verb-ing", example: "She is not sleeping." },
      { rule: "Question: Am/Is/Are + subject + verb-ing?", example: "Are you listening?" },
    ],
    examples: [
      { en: "I am studying English now.", ru: "Я сейчас учу английский." },
      { en: "They are building a new house.", ru: "Они строят новый дом." },
    ],
    orderIndex: 2,
  },
  {
    title: "Past Simple", slug: "past-simple", level: "beginner", category: "tenses",
    description: "Completed actions in the past",
    content: "Past Simple is used for completed actions that happened at a specific time in the past. Regular verbs add -ed; irregular verbs have unique past forms.",
    rules: [
      { rule: "Regular: verb + -ed", example: "I worked yesterday." },
      { rule: "Irregular: unique forms", example: "I went to school. She saw a movie." },
      { rule: "Negative: didn't + base verb", example: "He didn't call me." },
      { rule: "Question: Did + subject + base verb?", example: "Did you sleep well?" },
    ],
    examples: [
      { en: "She visited Paris last year.", ru: "Она посетила Париж в прошлом году." },
      { en: "Did you finish your homework?", ru: "Ты сделал домашнее задание?" },
    ],
    orderIndex: 3,
  },
  {
    title: "Articles: A/An/The", slug: "articles", level: "beginner", category: "grammar",
    description: "When to use definite and indefinite articles",
    content: "Articles are determiners placed before nouns. 'A/An' are indefinite articles used for non-specific nouns. 'The' is the definite article for specific nouns.",
    rules: [
      { rule: "A + consonant sound", example: "a book, a university" },
      { rule: "An + vowel sound", example: "an apple, an hour" },
      { rule: "The = specific, known, or unique", example: "The sun, the book you gave me" },
      { rule: "No article for general plural/uncountable", example: "I like cats. Water is essential." },
    ],
    examples: [
      { en: "I saw a dog in the park.", ru: "Я видел собаку в парке." },
      { en: "The moon is bright tonight.", ru: "Луна яркая сегодня ночью." },
    ],
    orderIndex: 4,
  },
  {
    title: "Modal Verbs", slug: "modal-verbs", level: "intermediate", category: "grammar",
    description: "Can, could, must, should, may, might, will, would",
    content: "Modal verbs are auxiliary verbs that express ability, permission, obligation, possibility, and other modalities. They are followed by the base form of the main verb.",
    rules: [
      { rule: "Can/Could — ability/permission", example: "I can swim. Could you help me?" },
      { rule: "Must/Have to — obligation", example: "You must wear a seatbelt." },
      { rule: "Should — advice", example: "You should see a doctor." },
      { rule: "May/Might — possibility", example: "It might rain tomorrow." },
      { rule: "Will/Would — future/conditional", example: "I will call you. Would you like tea?" },
    ],
    examples: [
      { en: "You should study more.", ru: "Тебе следует больше учиться." },
      { en: "Can I use your phone?", ru: "Можно воспользоваться твоим телефоном?" },
    ],
    orderIndex: 5,
  },
  {
    title: "Conditionals", slug: "conditionals", level: "intermediate", category: "grammar",
    description: "Zero, first, second, and third conditional",
    content: "Conditionals express what would happen if certain conditions were met. There are four main types: Zero (facts), First (real future), Second (unreal present/future), Third (unreal past).",
    rules: [
      { rule: "Zero: If + present, present (facts)", example: "If you heat water to 100°C, it boils." },
      { rule: "First: If + present, will + base (real future)", example: "If it rains, I'll stay home." },
      { rule: "Second: If + past, would + base (unreal)", example: "If I had money, I would travel." },
      { rule: "Third: If + past perfect, would have + past participle", example: "If I had studied, I would have passed." },
    ],
    examples: [
      { en: "If I were you, I would apologize.", ru: "На твоём месте я бы извинился." },
      { en: "If I had known, I would have helped.", ru: "Если бы я знал, я бы помог." },
    ],
    orderIndex: 6,
  },
  {
    title: "Passive Voice", slug: "passive-voice", level: "intermediate", category: "grammar",
    description: "When the subject receives the action",
    content: "The passive voice is used when the focus is on the action or the object rather than the subject. Formed with: to be + past participle.",
    rules: [
      { rule: "Present: am/is/are + past participle", example: "The book is written by her." },
      { rule: "Past: was/were + past participle", example: "The cake was eaten." },
      { rule: "Future: will be + past participle", example: "The letter will be sent." },
    ],
    examples: [
      { en: "The window was broken by the child.", ru: "Окно было разбито ребёнком." },
      { en: "English is spoken all over the world.", ru: "На английском говорят во всём мире." },
    ],
    orderIndex: 7,
  },
  {
    title: "Reported Speech", slug: "reported-speech", level: "advanced", category: "grammar",
    description: "Indirect speech and backshift of tenses",
    content: "Reported speech (indirect speech) is used to relay what someone said without quoting them directly. Tenses usually shift back in time.",
    rules: [
      { rule: "Present Simple → Past Simple", example: "\"I like coffee\" → He said he liked coffee." },
      { rule: "Present Continuous → Past Continuous", example: "\"I'm working\" → She said she was working." },
      { rule: "Will → Would", example: "\"I will come\" → He said he would come." },
      { rule: "Time expressions change", example: "today → that day, tomorrow → the next day" },
    ],
    examples: [
      { en: "She said she was tired.", ru: "Она сказала, что устала." },
      { en: "He told me he would call back.", ru: "Он сказал мне, что перезвонит." },
    ],
    orderIndex: 8,
  },
];

export const grammarRoutes = new Elysia({ prefix: "/grammar" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  // Get all grammar topics
  .get("/topics", async ({ headers, jwt, set }) => {
    await getUser(headers, jwt, set);
    const existing = await db.findMany("EnglishGrammarTopics", {
      sort: [{ field: "orderIndex", direction: "asc" }],
      limit: 100,
    });
    if (existing.length === 0) {
      for (const topic of GRAMMAR_SEED) {
        await db.create("EnglishGrammarTopics", { ...topic, isPublished: true });
      }
      return db.findMany("EnglishGrammarTopics", {
        sort: [{ field: "orderIndex", direction: "asc" }],
        limit: 100,
      });
    }
    return existing;
  })

  // Get single topic with tests
  .get("/topics/:slug", async ({ headers, params, jwt, set }) => {
    await getUser(headers, jwt, set);
    const topic = await db.findOne("EnglishGrammarTopics", [db.filter.eq("slug", params.slug)]);
    if (!topic) { set.status = 404; return { error: "Not found" }; }
    const tests = await db.findMany("EnglishGrammarTests", [db.filter.eq("topicId", topic.id)]);
    return { topic, tests };
  })

  // Generate tests for a topic using AI
  .post("/topics/:id/generate-tests", async ({ headers, params, jwt, set }) => {
    await getUser(headers, jwt, set);
    const topic = await db.findOne("EnglishGrammarTopics", [db.filter.eq("id", params.id)]);
    if (!topic) { set.status = 404; return { error: "Not found" }; }

    const existing = await db.findMany("EnglishGrammarTests", [db.filter.eq("topicId", params.id)]);
    if (existing.length >= 5) return { tests: existing };

    const systemPrompt = `You are an expert English teacher creating grammar tests. Return ONLY valid JSON.`;
    const prompt = `Create 5 multiple-choice grammar test questions for the topic: "${topic.title}".
Topic content: ${topic.content}
Rules: ${JSON.stringify(topic.rules)}

Return JSON array:
[
  {
    "question": "Choose the correct form...",
    "questionType": "multiple_choice",
    "options": ["option A", "option B", "option C", "option D"],
    "correctAnswer": "option A",
    "explanation": "Because...",
    "difficulty": 1
  }
]
Difficulty: 1=easy, 2=medium, 3=hard. Mix difficulties.`;

    const aiResponse = await callOpenRouter(prompt, systemPrompt);
    let tests: any[] = [];

    if (aiResponse) {
      try {
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        tests = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch { tests = []; }
    }

    if (tests.length === 0) {
      tests = [
        {
          question: `Which sentence uses ${topic.title} correctly?`,
          questionType: "multiple_choice",
          options: ["She go to school every day.", "She goes to school every day.", "She going to school every day.", "She have gone to school every day."],
          correctAnswer: "She goes to school every day.",
          explanation: `With third person singular (she/he/it), add -s to the verb in ${topic.title}.`,
          difficulty: 1,
        },
      ];
    }

    const created = [];
    for (const test of tests.slice(0, 5)) {
      const t = await db.create("EnglishGrammarTests", { ...test, topicId: params.id });
      created.push(t);
    }
    return { tests: created };
  })

  // Submit test results
  .post("/topics/:id/submit", async ({ headers, params, body, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const { answers } = body as { answers: Array<{ testId: string; answer: string }> };
    const tests = await db.findMany("EnglishGrammarTests", [db.filter.eq("topicId", params.id)]);
    let score = 0;
    const detailed = answers.map((a) => {
      const test = tests.find((t) => t.id === a.testId);
      const correct = test?.correctAnswer === a.answer;
      if (correct) score++;
      return { testId: a.testId, answer: a.answer, correct, correctAnswer: test?.correctAnswer };
    });

    const xpEarned = score * 10;
    const result = await db.create("EnglishGrammarTestResults", {
      userId: user.id,
      topicId: params.id,
      score,
      totalQuestions: tests.length,
      answers: detailed,
      xpEarned,
    });

    await db.update("EnglishUsers", user.id, { xp: (user.xp || 0) + xpEarned });
    return { result, score, total: tests.length, xpEarned };
  })

  // Get user grammar progress
  .get("/progress", async ({ headers, jwt, set }) => {
    const user = await getUser(headers, jwt, set);
    const results = await db.findMany("EnglishGrammarTestResults", {
      filters: [db.filter.eq("userId", user.id)],
      sort: [{ field: "completedAt", direction: "desc" }],
      limit: 50,
    });
    return results;
  })

  // AI: explain grammar question
  .post("/explain", async ({ headers, body, jwt, set }) => {
    await getUser(headers, jwt, set);
    const { text, question } = body as { text: string; question: string };

    const systemPrompt = `You are an expert English grammar teacher. Give clear, concise explanations in Russian with English examples. Keep answers to 3-5 sentences.`;
    const prompt = question
      ? `Explain this English grammar question: "${question}". Context: "${text}"`
      : `Explain this English grammar structure: "${text}"`;

    const response = await callOpenRouter(prompt, systemPrompt);
    return { explanation: response || "Объяснение недоступно. Проверьте настройки AI." };
  });
