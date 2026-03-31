import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { InferenceClient } from "@huggingface/inference";
import { config } from "../config";
import { db } from "../db";
import { getHfSettings } from "./hf-settings";

type TtsResult =
  | { ok: true; buffer: Uint8Array; contentType: string }
  | { ok: false; status: number; message: string; loading?: boolean };

type SuccessfulTtsResult = Extract<TtsResult, { ok: true }> & { model: string };
type FailedTtsResult = Extract<TtsResult, { ok: false }> & {
  model?: string;
  attempts?: Array<{ model: string; status: number; message: string }>;
};

const DEFAULT_TTS_MODELS = [
  "hexgrad/Kokoro-82M",
  "ResembleAI/chatterbox",
];

function buildModelCandidates(...models: Array<string | undefined>) {
  return [
    ...new Set(
      models
        .flatMap((model) => (model ? [model] : []))
        .concat(DEFAULT_TTS_MODELS)
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  ];
}

function readProviderErrorBody(body: unknown) {
  if (typeof body === "string") {
    return body;
  }

  if (body && typeof body === "object") {
    try {
      return JSON.stringify(body);
    } catch {
      return String(body);
    }
  }

  return "";
}

async function requestTtsFromModel(
  client: InferenceClient,
  model: string,
  text: string,
): Promise<TtsResult> {
  try {
    const audio = await client.textToSpeech({
      model,
      provider: "auto",
      inputs: text,
    });

    return {
      ok: true,
      buffer: new Uint8Array(await audio.arrayBuffer()),
      contentType: audio.type || "audio/wav",
    };
  } catch (error) {
    const providerError = error as Error & {
      response?: { status?: number; body?: unknown };
    };
    const status = providerError.response?.status || 500;
    const responseBody = readProviderErrorBody(providerError.response?.body);
    const message = [providerError.message, responseBody]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      ok: false,
      status,
      message: message || "unknown TTS error",
      loading: status === 503 && /loading/i.test(message),
    };
  }
}

async function requestTtsAudio(
  models: string[],
  token: string,
  text: string,
): Promise<SuccessfulTtsResult | FailedTtsResult> {
  const client = new InferenceClient(token);

  let lastError: FailedTtsResult | null = null;
  let loadingSeen = false;
  const attempts: Array<{ model: string; status: number; message: string }> = [];

  for (const model of models) {
    const result = await requestTtsFromModel(client, model, text);
    if (result.ok) {
      return { ...result, model };
    }

    attempts.push({
      model,
      status: result.status,
      message: result.message,
    });
    lastError = { ...result, model, attempts: [...attempts] };
    if (result.loading) {
      loadingSeen = true;
    }
  }

  if (loadingSeen) {
    return {
      ok: false,
      status: 503,
      message:
        "All configured TTS models are currently loading on HuggingFace.",
      loading: true,
      model: lastError?.model,
      attempts,
    };
  }

  return (
    lastError || {
      ok: false,
      status: 500,
      message: "Unknown TTS error",
      attempts,
    }
  );
}

export const ttsRoutes = new Elysia({ prefix: "/tts" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))

  .post(
    "/",
    async ({ headers, body, jwt, set }) => {
      const token = headers.authorization?.replace("Bearer ", "");
      if (!token) {
        set.status = 401;
        throw new Error("Unauthorized");
      }
      const payload = await jwt.verify(token);
      if (!payload) {
        set.status = 401;
        throw new Error("Invalid token");
      }

      const { text, model: customModel } = body;
      const normalizedText = text.trim();

      const cached = await db.findOne("EnglishSoundCache", [
        db.filter.eq("text", normalizedText),
      ]);
      const hfSettings = await getHfSettings();
      if (!hfSettings.apiToken) {
        set.status = 503;
        return { error: "HuggingFace API token not set in admin" };
      }

      const modelCandidates = buildModelCandidates(
        customModel,
        hfSettings.ttsModel,
        config.huggingface.ttsModel,
      );
      const requestedModel = modelCandidates[0];

      if (
        cached &&
        cached.audioUrl &&
        (!cached.model || modelCandidates.includes(cached.model))
      ) {
        return {
          audioUrl: cached.audioUrl,
          cached: true,
          model: cached.model || requestedModel,
        };
      }

      try {
        const result = await requestTtsAudio(
          modelCandidates,
          hfSettings.apiToken,
          normalizedText,
        );
        if (!result.ok) {
          const attemptsSummary = result.attempts
            ?.map((attempt) => `${attempt.model}: ${attempt.status}`)
            .join(", ");
          console.error(
            `[hf-tts] error from ${result.model || requestedModel}:`,
            result.status,
            result.message.slice(0, 300),
            attemptsSummary ? `attempts=${attemptsSummary}` : "",
          );

          if (result.loading) {
            set.status = 503;
            return {
              error: "Model is loading on HuggingFace, try again in a moment.",
            };
          }

          set.status = 502;
          return { error: "Speech generation failed" };
        }

        let cacheItem = cached;
        if (!cacheItem) {
          cacheItem = await db.create("EnglishSoundCache", {
            text: normalizedText,
            model: result.model,
          });
        }

        if (!cacheItem) {
          throw new Error("Failed to create cache item");
        }

        const extension = result.contentType.includes("mpeg")
          ? "mp3"
          : result.contentType.includes("wav")
            ? "wav"
            : result.contentType.includes("ogg")
              ? "ogg"
              : "flac";

        const ref = await db.uploadFile(
          "EnglishSoundCache",
          cacheItem.id,
          "audio",
          result.buffer,
          {
            filename: `tts_${cacheItem.id}.${extension}`,
            contentType: result.contentType,
            bucket: "english-sounds",
          },
        );

        const audioUrl = await db.blobUrl("EnglishSoundCache", ref);
        await db.update("EnglishSoundCache", cacheItem.id, {
          audioUrl,
          model: result.model,
        });

        return { audioUrl, cached: false, model: result.model };
      } catch (error) {
        console.error("[hf-tts] exception:", error);
        set.status = 500;
        return { error: "Internal error during TTS generation" };
      }
    },
    {
      body: t.Object({
        text: t.String({ minLength: 1, maxLength: 500 }),
        model: t.Optional(t.String()),
      }),
    },
  );
