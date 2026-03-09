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

type JsonObject = Record<string, unknown>;

interface FileMeta {
  id: string;
  fileName: string;
  mimeType: string;
  blobUrl: string;
  kind: string;
}

async function getAiSettings() {
  return db.aiSettings.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      localBaseUrl: config.AI_LOCAL_BASE_URL,
      localModel: config.AI_LOCAL_MODEL,
      openRouterApiKey: config.OPENROUTER_API_KEY || null,
    },
  });
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

// ─── Streaming version of callOpenRouter ─────────────────────────────────────
async function callOpenRouterStream(
  apiKey: string,
  model: string,
  messages: unknown[],
  maxTokens: number,
  userId: string,
  conversationId: string,
  emit: (event: string, data: JsonObject) => void,
) {
  const toolDefinitions = [
    {
      type: "function",
      function: {
        name: "duckduckgo_search",
        description: "Search public web results through DuckDuckGo.",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
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
          properties: { url: { type: "string" } },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_artifact",
        description: "Create a downloadable artifact such as markdown, html, csv or json.",
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
        max_tokens: Math.max(256, Math.min(16000, maxTokens)),
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter error: ${text}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let reasoning = "";
    const pendingToolCalls: Record<
      number,
      { id: string; name: string; args: string }
    > = {};
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break outer;

        let chunk: JsonObject;
        try {
          chunk = JSON.parse(raw) as JsonObject;
        } catch {
          continue;
        }

        const choices = chunk.choices as Array<JsonObject> | undefined;
        const delta = choices?.[0]?.delta as JsonObject | undefined;
        if (!delta) {
          if (chunk.usage) {
            const u = chunk.usage as JsonObject;
            usage = {
              inputTokens: Number(u.prompt_tokens ?? 0),
              outputTokens: Number(u.completion_tokens ?? 0),
              totalTokens: Number(u.total_tokens ?? 0),
            };
          }
          continue;
        }

        if (delta.content) {
          content += String(delta.content);
          emit("delta", { text: String(delta.content) });
        }

        const reasoningText =
          (delta.reasoning as string) ||
          (delta.reasoning_content as string) ||
          "";
        if (reasoningText) {
          reasoning += reasoningText;
          emit("reasoning_delta", { text: reasoningText });
        }

        if (delta.tool_calls) {
          const tcs = delta.tool_calls as Array<JsonObject>;
          for (const tc of tcs) {
            const idx = Number(tc.index ?? 0);
            if (!pendingToolCalls[idx]) {
              pendingToolCalls[idx] = { id: "", name: "", args: "" };
            }
            const fn = tc.function as JsonObject | undefined;
            if (tc.id) pendingToolCalls[idx].id = String(tc.id);
            if (fn?.name) pendingToolCalls[idx].name += String(fn.name);
            if (fn?.arguments) pendingToolCalls[idx].args += String(fn.arguments);
          }
        }

        if (chunk.usage) {
          const u = chunk.usage as JsonObject;
          usage = {
            inputTokens: Number(u.prompt_tokens ?? 0),
            outputTokens: Number(u.completion_tokens ?? 0),
            totalTokens: Number(u.total_tokens ?? 0),
          };
        }
      }
    }

    const toolCallList = Object.values(pendingToolCalls);

    if (!toolCallList.length) {
      return {
        provider: "openrouter",
        model,
        content: content || "Ответ не получен.",
        reasoning: reasoning || null,
        usage,
        toolEvents,
      };
    }

    workingMessages.push({
      role: "assistant",
      content: content || "",
      tool_calls: toolCallList.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.args },
      })),
    });

    for (const tc of toolCallList) {
      emit("tool_call", { name: tc.name, args: tc.args });
      const result = await executeTool(userId, conversationId, tc.name, tc.args);
      toolEvents.push({ id: tc.id, name: tc.name, result });
      emit("tool_result", { name: tc.name, result: result as JsonObject });
      workingMessages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }

    // reset for next iteration
    content = "";
    reasoning = "";
    Object.keys(pendingToolCalls).forEach(
      (k) => delete pendingToolCalls[Number(k)],
    );
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
  const systemPrompt = [
    "You are lowkey AI, a concise but capable assistant.",
    "When useful, use tools for web search, URL reading and artifact creation.",
    "Return markdown with readable tables and clear sections.",
    settings.systemPrompt || "",
  ]
    .filter(Boolean)
    .join("\n\n");

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
          messages: conversation.messages.map((message) => ({
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
          files: conversation.files.map((file) => ({
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
          const result = useOpenRouter
            ? await callOpenRouter(
                quota.settings.openRouterApiKey ||
                  config.OPENROUTER_API_KEY,
                preferredModel,
                messagePayload,
                quota.totalAvailable,
                user.userId,
                conversation.id,
              )
            : await callLocalModel(
                quota.settings.localBaseUrl || config.AI_LOCAL_BASE_URL,
                quota.settings.localModel || config.AI_LOCAL_MODEL,
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
      )
      .post(
        "/chat/stream",
        async ({ user, body, set }) => {
          const quota = await getUserAiQuota(user.userId);
          if (quota.totalAvailable <= 0) {
            set.status = 402;
            return { message: "AI token limit reached" };
          }

          let conversationId = body.conversationId || null;
          const isNew = !conversationId;

          if (isNew) {
            const created = await db.aiConversation.create({
              data: {
                userId: user.userId,
                title: buildConversationTitle(body.message),
              },
            });
            conversationId = created.id;
          }

          const conversation = await db.aiConversation.findFirst({
            where: { id: conversationId!, userId: user.userId },
            include: {
              messages: { orderBy: { createdAt: "asc" } },
            },
          });

          if (!conversation) {
            set.status = 404;
            return { message: "Conversation not found" };
          }

          const attachmentIds = body.attachmentIds ?? [];
          const files = attachmentIds.length
            ? await db.aiFile.findMany({
                where: { id: { in: attachmentIds }, userId: user.userId },
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
              where: { id: { in: files.map((f) => f.id) } },
              data: { messageId: userMessageRecord.id, conversationId: conversation.id },
            });
          }

          const messagePayload = buildMessagePayload(
            quota.settings,
            [...conversation.messages, userMessageRecord].map((m) => ({
              role: m.role,
              content: m.content,
              attachments: m.attachments,
            })),
            files,
            body.message,
          );

          const preferredModel = body.model || quota.settings.defaultModel;
          const useOpenRouter =
            Boolean(quota.settings.openRouterApiKey) ||
            Boolean(config.OPENROUTER_API_KEY);

          const encoder = new TextEncoder();

          const stream = new ReadableStream({
            async start(controller) {
              function emit(event: string, data: JsonObject) {
                const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(chunk));
              }

              try {
                emit("connected", {
                  conversationId: conversation!.id,
                  isNew,
                  title: conversation!.title,
                });

                let result: Awaited<ReturnType<typeof callOpenRouterStream>>;

                if (useOpenRouter) {
                  result = await callOpenRouterStream(
                    quota.settings.openRouterApiKey || config.OPENROUTER_API_KEY,
                    preferredModel,
                    messagePayload,
                    quota.totalAvailable,
                    user.userId,
                    conversation!.id,
                    emit,
                  );
                } else {
                  // Local model — no streaming, fake it
                  const localResult = await callLocalModel(
                    quota.settings.localBaseUrl || config.AI_LOCAL_BASE_URL,
                    quota.settings.localModel || config.AI_LOCAL_MODEL,
                    messagePayload.map((m) => ({
                      role: String((m as JsonObject).role),
                      content: String((m as JsonObject).content),
                    })),
                  );
                  // Emit word-by-word for UX consistency
                  const words = localResult.content.split(" ");
                  for (const word of words) {
                    emit("delta", { text: word + " " });
                  }
                  result = localResult;
                }

                const assistantMessage = await db.aiMessage.create({
                  data: {
                    conversationId: conversation!.id,
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
                    conversationId: conversation!.id,
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
                    conversationId: conversation!.id,
                    kind: "artifact",
                  },
                  orderBy: { createdAt: "desc" },
                  take: 12,
                });

                emit("done", {
                  messageId: assistantMessage.id,
                  content: result.content,
                  reasoning: result.reasoning as string | null ?? null,
                  model: result.model,
                  inputTokens: result.usage.inputTokens,
                  outputTokens: result.usage.outputTokens,
                  totalTokens: result.usage.totalTokens,
                  toolEvents: result.toolEvents,
                  artifacts: artifacts.map((a) => ({
                    id: a.id,
                    fileName: a.fileName,
                    mimeType: a.mimeType,
                    blobUrl: a.blobUrl,
                    kind: a.kind,
                  })),
                });
              } catch (err) {
                emit("error", { message: (err as Error).message ?? "Unknown error" });
              } finally {
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": "*",
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
