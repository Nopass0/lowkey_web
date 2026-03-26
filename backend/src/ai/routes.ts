import Elysia, { t } from "elysia";
import { put } from "@vercel/blob";
import { mkdir } from "fs/promises";
import { join } from "path";
import { db } from "../db";
import { config } from "../config";
import { authMiddleware, adminMiddleware } from "../auth/middleware";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DDG_SEARCH_URL = "https://duckduckgo.com/html/";
const DEFAULT_TITLE = "Новый диалог";
const DEFAULT_LOCAL_MODEL = "qwen3.5:0.8b";
const encoder = new TextEncoder();

type JsonObject = Record<string, unknown>;

interface FileMeta {
  id: string;
  fileName: string;
  mimeType: string;
  blobUrl: string;
  kind: string;
}

interface ConversationMessageRow {
  id: string;
  role: string;
  content: string;
  reasoning?: string | null;
  attachments?: unknown;
  artifacts?: unknown;
  toolEvents?: unknown;
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  createdAt: Date;
}

interface ConversationFileRow {
  id: string;
  fileName: string;
  mimeType: string;
  blobUrl: string;
  kind: string;
  createdAt: Date;
}

function isEmbeddingModel(model: string | null | undefined) {
  const value = String(model || "").toLowerCase();
  return value.includes("embed") || value.includes("embedding");
}

function getSafeLocalModel(model: string | null | undefined) {
  const candidate = model || config.AI_LOCAL_MODEL || DEFAULT_LOCAL_MODEL;
  return isEmbeddingModel(candidate) ? DEFAULT_LOCAL_MODEL : candidate;
}

function resolveChatModel(params: {
  requestedModel?: string | null;
  defaultModel?: string | null;
  localModel?: string | null;
  hasOpenRouter: boolean;
}) {
  const localModel = getSafeLocalModel(params.localModel);
  const requestedModel = params.requestedModel?.trim();
  const defaultModel = params.defaultModel?.trim();

  if (
    requestedModel &&
    !isEmbeddingModel(requestedModel) &&
    (requestedModel === localModel ||
      requestedModel.startsWith("qwen") ||
      requestedModel.startsWith("mercury"))
  ) {
    return { model: requestedModel, isLocalModel: true };
  }

  if (requestedModel && !isEmbeddingModel(requestedModel) && params.hasOpenRouter) {
    return { model: requestedModel, isLocalModel: false };
  }

  if (defaultModel && !isEmbeddingModel(defaultModel) && params.hasOpenRouter) {
    return { model: defaultModel, isLocalModel: false };
  }

  return { model: localModel, isLocalModel: true };
}

async function getAiSettings() {
  const settings = await db.aiSettings.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      defaultModel: config.OPENROUTER_API_KEY
        ? config.OPENROUTER_DEFAULT_MODEL
        : config.AI_LOCAL_MODEL,
      localBaseUrl: config.AI_LOCAL_BASE_URL,
      localModel: config.AI_LOCAL_MODEL,
      openRouterApiKey: config.OPENROUTER_API_KEY || null,
    },
  });

  if (
    !settings.openRouterApiKey &&
    (settings.defaultModel === "openai/gpt-4o-mini" ||
      settings.defaultModel === "qwen3:0.6b")
  ) {
    return db.aiSettings.update({
      where: { id: "global" },
      data: {
        defaultModel: settings.localModel || config.AI_LOCAL_MODEL,
        localModel:
          settings.localModel === "qwen3:0.6b"
            ? config.AI_LOCAL_MODEL
            : settings.localModel,
      },
    });
  }

  if (
    (settings.openRouterApiKey || config.OPENROUTER_API_KEY) &&
    (settings.defaultModel === "qwen3:0.6b" ||
      settings.defaultModel === config.AI_LOCAL_MODEL ||
      isEmbeddingModel(settings.defaultModel))
  ) {
    return db.aiSettings.update({
      where: { id: "global" },
      data: {
        defaultModel: config.OPENROUTER_DEFAULT_MODEL,
        localModel: getSafeLocalModel(settings.localModel),
      },
    });
  }

  if (isEmbeddingModel(settings.defaultModel) || isEmbeddingModel(settings.localModel)) {
    return db.aiSettings.update({
      where: { id: "global" },
      data: {
        defaultModel: getSafeLocalModel(settings.defaultModel),
        localModel: getSafeLocalModel(settings.localModel),
      },
    });
  }

  return settings;
}

async function ensureAiPeriod(userId: string) {
  const subscription = await db.aiSubscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    return null;
  }

  const now = new Date();
  const periodStart = new Date(subscription.periodStartsAt);
  const elapsedDays =
    (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);

  if (elapsedDays < 30 && subscription.activeUntil > now) {
    return subscription;
  }

  if (subscription.activeUntil <= now) {
    return subscription;
  }

  return db.aiSubscription.update({
    where: { userId },
    data: {
      periodStartsAt: now,
      monthlyTokensUsed: 0,
    },
  });
}

async function getUserAiQuota(userId: string) {
  const [settings, user, subscription] = await Promise.all([
    getAiSettings(),
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        balance: true,
        aiPurchasedTokens: true,
        aiFreeTokensUsed: true,
      },
    }),
    ensureAiPeriod(userId),
  ]);

  if (!user) {
    throw new Error("User not found");
  }

  const now = new Date();
  const activeSubscription =
    subscription && subscription.activeUntil > now ? subscription : null;

  const includedLimit = activeSubscription
    ? activeSubscription.monthlyTokenLimit
    : settings.freeMonthlyTokens;
  const usedIncluded = activeSubscription
    ? activeSubscription.monthlyTokensUsed
    : user.aiFreeTokensUsed;
  const includedRemaining = Math.max(0, includedLimit - usedIncluded);
  const totalAvailable = includedRemaining + user.aiPurchasedTokens;

  return {
    settings,
    user,
    activeSubscription,
    includedLimit,
    usedIncluded,
    includedRemaining,
    purchasedTokens: user.aiPurchasedTokens,
    totalAvailable,
    balance: user.balance,
  };
}

function buildConversationTitle(message: string) {
  const cleaned = message.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return DEFAULT_TITLE;
  }

  return cleaned.slice(0, 60);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkText(text: string, size = 28) {
  const chunks: string[] = [];
  let current = "";

  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    if ((current + word).length > size && current) {
      chunks.push(current);
      current = word;
    } else {
      current += word;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [text];
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchDuckDuckGo(query: string) {
  const url = `${DDG_SEARCH_URL}?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "lowkey-ai/1.0",
    },
  });

  const html = await response.text();
  const matches = [
    ...html.matchAll(
      /result__a" href="([^"]+)".*?>(.*?)<\/a>[\s\S]*?result__snippet">([\s\S]*?)<\/a>/g,
    ),
  ].slice(0, 5);

  return matches.map((match) => ({
    url: match[1],
    title: stripHtml(match[2]),
    snippet: stripHtml(match[3]),
  }));
}

async function fetchUrlSummary(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "lowkey-ai/1.0",
    },
  });

  const html = await response.text();
  return {
    url,
    text: stripHtml(html).slice(0, 6000),
  };
}

async function uploadArtifactToBlob(
  userId: string,
  pathname: string,
  body: string | ArrayBuffer,
  contentType: string,
) {
  if (!config.BLOB_READ_WRITE_TOKEN) {
    const relativePath = pathname.replace(/^ai\//, "ai/");
    const diskPath = join(config.APP_FILES_DIR, relativePath);
    const directory = diskPath.split(/[\\/]/).slice(0, -1).join("/");
    await mkdir(directory, { recursive: true });
    await Bun.write(diskPath, body);
    return `/uploads/${relativePath}`;
  }

  const result = await put(pathname, body, {
    access: "public",
    token: config.BLOB_READ_WRITE_TOKEN,
    contentType,
    addRandomSuffix: true,
  });

  return result.url;
}

async function createArtifact(
  userId: string,
  conversationId: string,
  payload: { kind?: string; title?: string; content?: string; mimeType?: string },
) {
  const kind = payload.kind || "markdown";
  const title = (payload.title || "artifact").replace(/[^\w.-]+/g, "-");
  const content = payload.content || "";
  const mimeType =
    payload.mimeType ||
    (kind === "csv"
      ? "text/csv"
      : kind === "html"
        ? "text/html"
        : kind === "json"
          ? "application/json"
          : "text/markdown");
  const extension =
    kind === "csv"
      ? "csv"
      : kind === "html"
        ? "html"
        : kind === "json"
          ? "json"
          : "md";

  const blobUrl = await uploadArtifactToBlob(
    userId,
    `ai/${userId}/${title}.${extension}`,
    content,
    mimeType,
  );

  return db.aiFile.create({
    data: {
      userId,
      conversationId,
      fileName: `${title}.${extension}`,
      mimeType,
      size: content.length,
      blobUrl,
      kind: "artifact",
    },
  });
}

async function executeTool(
  userId: string,
  conversationId: string,
  toolName: string,
  rawArguments: string,
) {
  const args = rawArguments ? JSON.parse(rawArguments) : {};

  if (toolName === "duckduckgo_search") {
    return {
      results: await searchDuckDuckGo(String(args.query || "")),
    };
  }

  if (toolName === "smart_fetch_url") {
    return await fetchUrlSummary(String(args.url || ""));
  }

  if (toolName === "create_artifact") {
    const file = await createArtifact(userId, conversationId, args);
    return {
      id: file.id,
      url: file.blobUrl,
      fileName: file.fileName,
      mimeType: file.mimeType,
    };
  }

  return { error: `Unknown tool ${toolName}` };
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: unknown[],
  maxTokens: number,
  userId: string,
  conversationId: string,
) {
  const toolDefinitions = [
    {
      type: "function",
      function: {
        name: "duckduckgo_search",
        description: "Search public web results through DuckDuckGo.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "smart_fetch_url",
        description: "Fetch and extract the readable text content from a public URL.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string" },
          },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_artifact",
        description:
          "Create a downloadable artifact such as markdown, html, csv or json.",
        parameters: {
          type: "object",
          properties: {
            kind: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
            mimeType: { type: "string" },
          },
          required: ["kind", "title", "content"],
        },
      },
    },
  ];

  const workingMessages = [...messages];
  const toolEvents: JsonObject[] = [];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lowkey.su",
        "X-Title": "lowkey AI",
      },
      body: JSON.stringify({
        model,
        messages: workingMessages,
        tools: toolDefinitions,
        tool_choice: "auto",
        max_tokens: Math.max(256, Math.min(1600, maxTokens)),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter error: ${text}`);
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    const usage = data?.usage ?? {};
    const toolCalls = message?.tool_calls ?? [];

    if (!toolCalls.length) {
      return {
        provider: "openrouter",
        model,
        content: message?.content ?? "Ответ не получен.",
        reasoning:
          message?.reasoning ||
          data?.choices?.[0]?.reasoning ||
          data?.choices?.[0]?.message?.reasoning_content ||
          null,
        usage: {
          inputTokens: usage?.prompt_tokens ?? 0,
          outputTokens: usage?.completion_tokens ?? 0,
          totalTokens: usage?.total_tokens ?? 0,
        },
        toolEvents,
      };
    }

    workingMessages.push({
      role: "assistant",
      content: message?.content || "",
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const result = await executeTool(
        userId,
        conversationId,
        toolCall.function.name,
        toolCall.function.arguments,
      );

      toolEvents.push({
        id: toolCall.id,
        name: toolCall.function.name,
        result,
      });

      workingMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error("The model exceeded the tool execution limit");
}

async function callLocalModel(
  baseUrl: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Local model error: ${text}`);
  }

  const data = await response.json();
  return {
    provider: "local",
    model,
    content: data?.message?.content ?? "Ответ не получен.",
    reasoning: null,
    usage: {
      inputTokens: data?.prompt_eval_count ?? 0,
      outputTokens: data?.eval_count ?? 0,
      totalTokens:
        (data?.prompt_eval_count ?? 0) + (data?.eval_count ?? 0),
    },
    toolEvents: [],
  };
}

async function callLocalModelStream(
  baseUrl: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  onDelta: (chunk: string) => void,
) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Local model error: ${text}`);
  }

  if (!response.body) {
    throw new Error("Local model returned an empty stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const data = JSON.parse(trimmed) as {
        done?: boolean;
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const chunk = data.message?.content ?? "";
      if (chunk) {
        content += chunk;
        onDelta(chunk);
      }

      if (data.done) {
        usage = {
          inputTokens: data.prompt_eval_count ?? 0,
          outputTokens: data.eval_count ?? 0,
          totalTokens:
            (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        };
      }
    }
  }

  return {
    provider: "local",
    model,
    content: content || "Ответ не получен.",
    reasoning: null,
    usage,
    toolEvents: [] as JsonObject[],
  };
}

function buildSystemPrompt(settings: Awaited<ReturnType<typeof getAiSettings>>) {
  return [
    "You are lowkey AI, a polished assistant inside a premium chat UI.",
    "Default local model is qwen3.5:0.8b unless another model is explicitly selected.",
    "Always prefer progressive, readable answers that feel natural while they stream.",
    "Format answers in clean Markdown.",
    "Use headings, bullet lists and short paragraphs when they improve readability.",
    "Use GitHub-flavored Markdown tables whenever the answer contains comparable values, specs, prices, pros/cons, steps or structured data.",
    "LaTeX is allowed for formulas and must be wrapped in standard markdown math syntax.",
    "When the user asks for charts, dashboards, analytics or comparisons, output a fenced JSON chart spec that matches this schema: {\"type\":\"bar|line|area|pie\",\"title\":\"...\",\"data\":[...],\"xKey\":\"name\",\"yKeys\":[\"value\"]}.",
    "Prefer colorful multi-series bar, line and area charts when they help the user understand trends.",
    "If a downloadable result is useful, call create_artifact instead of dumping the whole file into the chat.",
    "If the user needs up-to-date information, call duckduckgo_search first and then smart_fetch_url for the most relevant pages.",
    "If files are attached, analyze them and explicitly mention what you could read from them. Treat markdown, text, csv and json as readable content when provided.",
    "Keep the final answer visually balanced for a centered chat layout: no giant walls of text and no unnecessary preambles.",
    settings.systemPrompt || "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildMessagePayload(
  settings: Awaited<ReturnType<typeof getAiSettings>>,
  history: Array<{
    role: string;
    content: string;
    attachments: unknown;
  }>,
  files: FileMeta[],
  userMessage: string,
) {
  const systemPrompt = buildSystemPrompt(settings);

  const fileNotes = files.length
    ? `Attached files:\n${files
        .map((file) => `- ${file.fileName} (${file.mimeType}) ${file.blobUrl}`)
        .join("\n")}`
    : "";

  const trimmedHistory = history
    .slice(-settings.maxContextMessages)
    .map((entry) => ({
      role: entry.role,
      content: String(entry.content || ""),
    }));

  return [
    { role: "system", content: systemPrompt },
    ...trimmedHistory,
    {
      role: "user",
      content: [userMessage, fileNotes].filter(Boolean).join("\n\n"),
    },
  ];
}

async function consumeQuota(userId: string, totalTokens: number) {
  const quota = await getUserAiQuota(userId);
  const includedRemaining = quota.includedRemaining;
  const useIncluded = Math.min(includedRemaining, totalTokens);
  const usePurchased = Math.max(0, totalTokens - useIncluded);

  if (quota.activeSubscription) {
    await db.aiSubscription.update({
      where: { userId },
      data: {
        monthlyTokensUsed: { increment: useIncluded },
      },
    });
  } else {
    await db.user.update({
      where: { id: userId },
      data: {
        aiFreeTokensUsed: { increment: useIncluded },
      },
    });
  }

  if (usePurchased > 0) {
    await db.user.update({
      where: { id: userId },
      data: {
        aiPurchasedTokens: { decrement: usePurchased },
      },
    });
  }
}

export const aiRoutes = new Elysia()
  .get("/ai/config", async () => {
    const settings = await getAiSettings();

    return {
      defaultModel: settings.defaultModel,
      freeMonthlyTokens: settings.freeMonthlyTokens,
      plans: [
        {
          slug: "ai",
          title: "AI",
          price: settings.aiPlanPrice,
          monthlyTokens: settings.aiPlanMonthlyTokens,
        },
        {
          slug: "max",
          title: "MAX",
          price: settings.maxPlanPrice,
          monthlyTokens: settings.maxPlanMonthlyTokens,
        },
        {
          slug: "combo",
          title: "Combo VPN + AI",
          price: settings.comboPlanPrice,
          monthlyTokens: settings.maxPlanMonthlyTokens,
        },
      ],
      tokenPack: {
        slug: "tokens",
        amount: settings.tokenPackSize,
        price: settings.tokenPackPrice,
      },
    };
  })
  .group("/user/ai", (app) =>
    app
      .use(authMiddleware)
      .get("/state", async ({ user }) => {
        const quota = await getUserAiQuota(user.userId);
        const conversations = await db.aiConversation.findMany({
          where: { userId: user.userId },
          orderBy: { updatedAt: "desc" },
          take: 12,
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        });

        return {
          quota: {
            includedLimit: quota.includedLimit,
            usedIncluded: quota.usedIncluded,
            includedRemaining: quota.includedRemaining,
            purchasedTokens: quota.purchasedTokens,
            totalAvailable: quota.totalAvailable,
          },
          subscription: quota.activeSubscription
            ? {
                tier: quota.activeSubscription.tier,
                title: quota.activeSubscription.title,
                activeUntil: quota.activeSubscription.activeUntil.toISOString(),
                monthlyTokenLimit: quota.activeSubscription.monthlyTokenLimit,
                monthlyTokensUsed: quota.activeSubscription.monthlyTokensUsed,
              }
            : null,
          settings: {
            defaultModel: quota.settings.defaultModel,
            freeMonthlyTokens: quota.settings.freeMonthlyTokens,
            aiPlanPrice: quota.settings.aiPlanPrice,
            maxPlanPrice: quota.settings.maxPlanPrice,
            comboPlanPrice: quota.settings.comboPlanPrice,
            tokenPackPrice: quota.settings.tokenPackPrice,
            tokenPackSize: quota.settings.tokenPackSize,
          },
          conversations: conversations.map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            model: conversation.model,
            updatedAt: conversation.updatedAt.toISOString(),
            lastMessage: conversation.messages[0]?.content ?? null,
          })),
        };
      })
      .get("/conversations/:id", async ({ user, params, set }) => {
        const conversation = await db.aiConversation.findFirst({
          where: { id: params.id, userId: user.userId },
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
            },
            files: {
              orderBy: { createdAt: "desc" },
            },
          },
        });

        if (!conversation) {
          set.status = 404;
          return { message: "Conversation not found" };
        }

        return {
          id: conversation.id,
          title: conversation.title,
          model: conversation.model,
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: conversation.updatedAt.toISOString(),
          messages: conversation.messages.map((message: ConversationMessageRow) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            reasoning: message.reasoning,
            attachments: message.attachments,
            artifacts: message.artifacts,
            toolEvents: message.toolEvents,
            model: message.model,
            inputTokens: message.inputTokens,
            outputTokens: message.outputTokens,
            totalTokens: message.totalTokens,
            createdAt: message.createdAt.toISOString(),
          })),
          files: conversation.files.map((file: ConversationFileRow) => ({
            id: file.id,
            fileName: file.fileName,
            mimeType: file.mimeType,
            blobUrl: file.blobUrl,
            kind: file.kind,
            createdAt: file.createdAt.toISOString(),
          })),
        };
      })
      .post(
        "/conversations",
        async ({ user, body }) => {
          const conversation = await db.aiConversation.create({
            data: {
              userId: user.userId,
              title: body.title?.trim() || DEFAULT_TITLE,
            },
          });

          return {
            id: conversation.id,
            title: conversation.title,
            updatedAt: conversation.updatedAt.toISOString(),
          };
        },
        {
          body: t.Object({
            title: t.Optional(t.String()),
          }),
        },
      )
      .post(
        "/uploads",
        async ({ user, body, set }) => {
          if (!config.BLOB_READ_WRITE_TOKEN) {
            set.status = 500;
            return { message: "Blob storage is not configured" };
          }

          const file = body.file;
          const arrayBuffer = await file.arrayBuffer();
          const blobUrl = await uploadArtifactToBlob(
            user.userId,
            `ai/${user.userId}/uploads/${file.name}`,
            arrayBuffer,
            file.type || "application/octet-stream",
          );

          const created = await db.aiFile.create({
            data: {
              userId: user.userId,
              conversationId: body.conversationId || null,
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              size: file.size,
              blobUrl,
              kind: "upload",
            },
          });

          return {
            id: created.id,
            fileName: created.fileName,
            mimeType: created.mimeType,
            size: created.size,
            blobUrl: created.blobUrl,
            kind: created.kind,
          };
        },
        {
          body: t.Object({
            file: t.File(),
            conversationId: t.Optional(t.String()),
          }),
        },
      )
      .post(
        "/purchase",
        async ({ user, body, set }) => {
          const quota = await getUserAiQuota(user.userId);
          const { settings } = quota;

          const purchaseMap = {
            ai: {
              title: "AI",
              price: settings.aiPlanPrice,
              monthlyTokens: settings.aiPlanMonthlyTokens,
            },
            max: {
              title: "MAX",
              price: settings.maxPlanPrice,
              monthlyTokens: settings.maxPlanMonthlyTokens,
            },
            combo: {
              title: "Combo VPN + AI",
              price: settings.comboPlanPrice,
              monthlyTokens: settings.maxPlanMonthlyTokens,
            },
            tokens: {
              title: "Пакет AI токенов",
              price: settings.tokenPackPrice,
              monthlyTokens: settings.tokenPackSize,
            },
          } as const;

          const product = purchaseMap[body.plan as keyof typeof purchaseMap];
          if (!product) {
            set.status = 400;
            return { message: "Unknown AI plan" };
          }

          if (quota.balance < product.price) {
            set.status = 402;
            return { message: "Insufficient balance" };
          }

          const now = new Date();

          await db.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: user.userId },
              data: {
                balance: { decrement: product.price },
                ...(body.plan === "tokens"
                  ? { aiPurchasedTokens: { increment: product.monthlyTokens } }
                  : {}),
              },
            });

            await tx.transaction.create({
              data: {
                userId: user.userId,
                type: "subscription",
                amount: -product.price,
                title:
                  body.plan === "tokens"
                    ? `AI токены ${product.monthlyTokens.toLocaleString("ru-RU")}`
                    : `AI подписка "${product.title}"`,
              },
            });

            if (body.plan !== "tokens") {
              await tx.aiSubscription.upsert({
                where: { userId: user.userId },
                update: {
                  tier: body.plan,
                  title: product.title,
                  monthlyTokenLimit: product.monthlyTokens,
                  activeUntil: new Date(
                    now.getTime() + 30 * 24 * 60 * 60 * 1000,
                  ),
                  periodStartsAt: now,
                  monthlyTokensUsed: 0,
                },
                create: {
                  userId: user.userId,
                  tier: body.plan,
                  title: product.title,
                  monthlyTokenLimit: product.monthlyTokens,
                  activeUntil: new Date(
                    now.getTime() + 30 * 24 * 60 * 60 * 1000,
                  ),
                  periodStartsAt: now,
                },
              });
            }
          });

          return { success: true };
        },
        {
          body: t.Object({
            plan: t.String(),
          }),
        },
      )
      .post(
        "/chat/stream",
        async ({ user, body, set }) => {
          set.headers["Content-Type"] = "text/event-stream; charset=utf-8";
          set.headers["Cache-Control"] = "no-cache, no-transform";
          set.headers.Connection = "keep-alive";

          const stream = new ReadableStream({
            async start(controller) {
              const send = (event: string, data: unknown) => {
                controller.enqueue(
                  encoder.encode(
                    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
                  ),
                );
              };

              try {
                const quota = await getUserAiQuota(user.userId);
                if (quota.totalAvailable <= 0) {
                  send("error", { message: "AI token limit reached" });
                  controller.close();
                  return;
                }

                let conversationId = body.conversationId || null;

                if (!conversationId) {
                  const created = await db.aiConversation.create({
                    data: {
                      userId: user.userId,
                      title: buildConversationTitle(body.message),
                    },
                  });
                  conversationId = created.id;
                }

                const conversation = await db.aiConversation.findFirst({
                  where: { id: conversationId, userId: user.userId },
                  include: {
                    messages: {
                      orderBy: { createdAt: "asc" },
                    },
                  },
                });

                if (!conversation) {
                  send("error", { message: "Conversation not found" });
                  controller.close();
                  return;
                }

                const attachmentIds = body.attachmentIds ?? [];
                const files = attachmentIds.length
                  ? await db.aiFile.findMany({
                      where: {
                        id: { in: attachmentIds },
                        userId: user.userId,
                      },
                      select: {
                        id: true,
                        fileName: true,
                        mimeType: true,
                        blobUrl: true,
                        kind: true,
                      },
                    })
                  : [];

                const userMessageRecord = await db.aiMessage.create({
                  data: {
                    conversationId: conversation.id,
                    role: "user",
                    content: body.message,
                    attachments: files as unknown as object,
                  },
                });

                if (files.length) {
                  await db.aiFile.updateMany({
                    where: { id: { in: files.map((file) => file.id) } },
                    data: {
                      messageId: userMessageRecord.id,
                      conversationId: conversation.id,
                    },
                  });
                }

                const messagePayload = buildMessagePayload(
                  quota.settings,
                  [...conversation.messages, userMessageRecord].map((message) => ({
                    role: message.role,
                    content: message.content,
                    attachments: message.attachments,
                  })),
                  files,
                  body.message,
                );

                const requestedModel =
                  body.model || quota.settings.defaultModel || DEFAULT_LOCAL_MODEL;
                const useOpenRouter =
                  Boolean(quota.settings.openRouterApiKey) ||
                  Boolean(config.OPENROUTER_API_KEY);
                const chatTarget = resolveChatModel({
                  requestedModel,
                  defaultModel: quota.settings.defaultModel,
                  localModel: quota.settings.localModel || config.AI_LOCAL_MODEL,
                  hasOpenRouter: useOpenRouter,
                });

                send("connected", {
                  conversationId: conversation.id,
                  isNew: !body.conversationId,
                });

                const result =
                  chatTarget.isLocalModel || !useOpenRouter
                    ? await callLocalModelStream(
                        quota.settings.localBaseUrl || config.AI_LOCAL_BASE_URL,
                        chatTarget.model,
                        messagePayload.map((message) => ({
                          role: String((message as JsonObject).role),
                          content: String((message as JsonObject).content),
                        })),
                        (chunk) => send("delta", { text: chunk }),
                      )
                    : await callOpenRouter(
                        quota.settings.openRouterApiKey ||
                          config.OPENROUTER_API_KEY,
                        chatTarget.model,
                        messagePayload,
                        quota.totalAvailable,
                        user.userId,
                        conversation.id,
                      );

                if (!chatTarget.isLocalModel && useOpenRouter) {
                  for (const event of (result.toolEvents as JsonObject[]) ?? []) {
                    send("tool_result", event);
                  }

                  for (const chunk of chunkText(result.content)) {
                    send("delta", { text: chunk });
                    await delay(12);
                  }
                }

                const artifacts = await db.aiFile.findMany({
                  where: {
                    userId: user.userId,
                    conversationId: conversation.id,
                    kind: "artifact",
                  },
                  orderBy: { createdAt: "desc" },
                  take: 12,
                });

                const assistantMessage = await db.aiMessage.create({
                  data: {
                    conversationId: conversation.id,
                    role: "assistant",
                    content: result.content,
                    reasoning: result.reasoning,
                    model: result.model,
                    inputTokens: result.usage.inputTokens,
                    outputTokens: result.usage.outputTokens,
                    totalTokens: result.usage.totalTokens,
                    toolEvents: result.toolEvents as unknown as object,
                    artifacts: artifacts as unknown as object,
                  },
                });

                await db.aiUsageEntry.create({
                  data: {
                    userId: user.userId,
                    conversationId: conversation.id,
                    messageId: assistantMessage.id,
                    provider: result.provider,
                    model: result.model,
                    inputTokens: result.usage.inputTokens,
                    outputTokens: result.usage.outputTokens,
                    totalTokens: result.usage.totalTokens,
                  },
                });

                await consumeQuota(user.userId, result.usage.totalTokens);

                await db.aiConversation.update({
                  where: { id: conversation.id },
                  data: { model: result.model },
                });

                send("done", {
                  messageId: assistantMessage.id,
                  content: assistantMessage.content,
                  reasoning: assistantMessage.reasoning,
                  model: assistantMessage.model,
                  toolEvents: assistantMessage.toolEvents,
                  artifacts: artifacts.map((artifact) => ({
                    id: artifact.id,
                    fileName: artifact.fileName,
                    mimeType: artifact.mimeType,
                    blobUrl: artifact.blobUrl,
                    kind: artifact.kind,
                  })),
                  inputTokens: assistantMessage.inputTokens,
                  outputTokens: assistantMessage.outputTokens,
                  totalTokens: assistantMessage.totalTokens,
                });
              } catch (error) {
                send("error", {
                  message:
                    error instanceof Error
                      ? error.message
                      : "Streaming failed",
                });
              } finally {
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
            },
          });
        },
        {
          body: t.Object({
            conversationId: t.Optional(t.String()),
            model: t.Optional(t.String()),
            message: t.String(),
            attachmentIds: t.Optional(t.Array(t.String())),
          }),
        },
      )
      .post(
        "/chat",
        async ({ user, body, set }) => {
          const quota = await getUserAiQuota(user.userId);
          if (quota.totalAvailable <= 0) {
            set.status = 402;
            return { message: "AI token limit reached" };
          }

          let conversationId = body.conversationId || null;

          if (!conversationId) {
            const created = await db.aiConversation.create({
              data: {
                userId: user.userId,
                title: buildConversationTitle(body.message),
              },
            });
            conversationId = created.id;
          }

          const conversation = await db.aiConversation.findFirst({
            where: { id: conversationId, userId: user.userId },
            include: {
              messages: {
                orderBy: { createdAt: "asc" },
              },
            },
          });

          if (!conversation) {
            set.status = 404;
            return { message: "Conversation not found" };
          }

          const attachmentIds = body.attachmentIds ?? [];
          const files = attachmentIds.length
            ? await db.aiFile.findMany({
                where: {
                  id: { in: attachmentIds },
                  userId: user.userId,
                },
                select: {
                  id: true,
                  fileName: true,
                  mimeType: true,
                  blobUrl: true,
                  kind: true,
                },
              })
            : [];

          const userMessageRecord = await db.aiMessage.create({
            data: {
              conversationId: conversation.id,
              role: "user",
              content: body.message,
              attachments: files as unknown as object,
            },
          });

          if (files.length) {
            await db.aiFile.updateMany({
              where: { id: { in: files.map((file) => file.id) } },
              data: {
                messageId: userMessageRecord.id,
                conversationId: conversation.id,
              },
            });
          }

          const messagePayload = buildMessagePayload(
            quota.settings,
            [...conversation.messages, userMessageRecord].map((message) => ({
              role: message.role,
              content: message.content,
              attachments: message.attachments,
            })),
            files,
            body.message,
          );

          const preferredModel = body.model || quota.settings.defaultModel;
          const useOpenRouter =
            Boolean(quota.settings.openRouterApiKey) ||
            Boolean(config.OPENROUTER_API_KEY);
          const chatTarget = resolveChatModel({
            requestedModel: preferredModel,
            defaultModel: quota.settings.defaultModel,
            localModel: quota.settings.localModel || config.AI_LOCAL_MODEL,
            hasOpenRouter: useOpenRouter,
          });
          const result = !chatTarget.isLocalModel && useOpenRouter
            ? await callOpenRouter(
                quota.settings.openRouterApiKey ||
                  config.OPENROUTER_API_KEY,
                chatTarget.model,
                messagePayload,
                quota.totalAvailable,
                user.userId,
                conversation.id,
              )
            : await callLocalModel(
                quota.settings.localBaseUrl || config.AI_LOCAL_BASE_URL,
                chatTarget.model,
                messagePayload.map((message) => ({
                  role: String((message as JsonObject).role),
                  content: String((message as JsonObject).content),
                })),
              );

          const assistantMessage = await db.aiMessage.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: result.content,
              reasoning: result.reasoning,
              model: result.model,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              totalTokens: result.usage.totalTokens,
              toolEvents: result.toolEvents as unknown as object,
            },
          });

          await db.aiUsageEntry.create({
            data: {
              userId: user.userId,
              conversationId: conversation.id,
              messageId: assistantMessage.id,
              provider: result.provider,
              model: result.model,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              totalTokens: result.usage.totalTokens,
            },
          });

          await consumeQuota(user.userId, result.usage.totalTokens);

          const artifacts = await db.aiFile.findMany({
            where: {
              userId: user.userId,
              conversationId: conversation.id,
              kind: "artifact",
            },
            orderBy: { createdAt: "desc" },
            take: 12,
          });

          return {
            conversationId: conversation.id,
            reply: {
              id: assistantMessage.id,
              role: assistantMessage.role,
              content: assistantMessage.content,
              reasoning: assistantMessage.reasoning,
              model: assistantMessage.model,
              toolEvents: assistantMessage.toolEvents,
              inputTokens: assistantMessage.inputTokens,
              outputTokens: assistantMessage.outputTokens,
              totalTokens: assistantMessage.totalTokens,
              createdAt: assistantMessage.createdAt.toISOString(),
            },
            artifacts: artifacts.map((artifact) => ({
              id: artifact.id,
              fileName: artifact.fileName,
              mimeType: artifact.mimeType,
              blobUrl: artifact.blobUrl,
              kind: artifact.kind,
            })),
          };
        },
        {
          body: t.Object({
            conversationId: t.Optional(t.String()),
            model: t.Optional(t.String()),
            message: t.String(),
            attachmentIds: t.Optional(t.Array(t.String())),
          }),
        },
      ),
  )
  .group("/admin/ai", (app) =>
    app
      .use(adminMiddleware)
      .get("/settings", async () => {
        return await getAiSettings();
      })
      .post(
        "/settings",
        async ({ body }) => {
          return await db.aiSettings.upsert({
            where: { id: "global" },
            update: body,
            create: {
              id: "global",
              ...body,
            },
          });
        },
        {
          body: t.Object({
            openRouterApiKey: t.Nullable(t.String()),
            defaultModel: t.String(),
            localModel: t.String(),
            localBaseUrl: t.String(),
            freeMonthlyTokens: t.Number(),
            aiPlanMonthlyTokens: t.Number(),
            maxPlanMonthlyTokens: t.Number(),
            aiPlanPrice: t.Number(),
            maxPlanPrice: t.Number(),
            comboPlanPrice: t.Number(),
            tokenPackSize: t.Number(),
            tokenPackPrice: t.Number(),
            systemPrompt: t.Nullable(t.String()),
            maxContextMessages: t.Number(),
            enableReasoning: t.Boolean(),
          }),
        },
      )
      .get("/analytics", async () => {
        const [usage, users] = await Promise.all([
          db.aiUsageEntry.findMany({
            orderBy: { createdAt: "desc" },
            include: {
              user: {
                select: {
                  login: true,
                },
              },
            },
            take: 500,
          }),
          db.user.findMany({
            select: {
              id: true,
              login: true,
              aiPurchasedTokens: true,
              aiFreeTokensUsed: true,
              aiSubscription: true,
            },
          }),
        ]);

        const statsByUser = new Map<
          string,
          {
            userId: string;
            login: string;
            inputTokens: number;
            outputTokens: number;
            totalTokens: number;
            messages: number;
          }
        >();

        usage.forEach((entry) => {
          const current =
            statsByUser.get(entry.userId) ||
            {
              userId: entry.userId,
              login: entry.user.login,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              messages: 0,
            };

          current.inputTokens += entry.inputTokens;
          current.outputTokens += entry.outputTokens;
          current.totalTokens += entry.totalTokens;
          current.messages += 1;
          statsByUser.set(entry.userId, current);
        });

        return {
          totals: {
            inputTokens: usage.reduce((sum, entry) => sum + entry.inputTokens, 0),
            outputTokens: usage.reduce(
              (sum, entry) => sum + entry.outputTokens,
              0,
            ),
            totalTokens: usage.reduce((sum, entry) => sum + entry.totalTokens, 0),
            users: users.length,
            activeSubscriptions: users.filter((user) => user.aiSubscription).length,
          },
          users: Array.from(statsByUser.values()).sort(
            (left, right) => right.totalTokens - left.totalTokens,
          ),
          recentUsage: usage.slice(0, 50).map((entry) => ({
            id: entry.id,
            userId: entry.userId,
            login: entry.user.login,
            model: entry.model,
            provider: entry.provider,
            totalTokens: entry.totalTokens,
            inputTokens: entry.inputTokens,
            outputTokens: entry.outputTokens,
            createdAt: entry.createdAt.toISOString(),
          })),
        };
      }),
  );
