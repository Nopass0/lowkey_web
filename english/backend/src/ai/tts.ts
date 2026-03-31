import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import axios from "axios";
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

type ProviderMappingEntry = {
  provider: string;
  providerId: string;
  hfModelId?: string;
  task?: string;
  status?: string;
};

const DEFAULT_TTS_MODELS = [
  "hexgrad/Kokoro-82M",
  "ResembleAI/chatterbox",
];

function buildPlaybackUrl(cacheId: string) {
  return `/api/tts/cache/${encodeURIComponent(cacheId)}/audio`;
}

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

function normalizeProviderMappings(input: unknown): ProviderMappingEntry[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input as ProviderMappingEntry[];
  }

  if (typeof input === "object") {
    return Object.entries(input as Record<string, any>).map(([provider, value]) => ({
      provider,
      providerId: value?.providerId || value?.modelId || value?.id || "",
      hfModelId: value?.hfModelId,
      task: value?.task,
      status: value?.status,
    })).filter((entry) => entry.providerId);
  }

  return [];
}

async function fetchInferenceProviderMappings(model: string, token: string) {
  try {
    const response = await axios.get(`https://huggingface.co/api/models/${model}`, {
      adapter: "http",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        "expand[]": "inferenceProviderMapping",
      },
      timeout: 30_000,
    });

    return normalizeProviderMappings(response.data?.inferenceProviderMapping);
  } catch (error) {
    console.error(`[hf-tts] failed to fetch provider mapping for ${model}:`, error);
    return [];
  }
}

function selectTtsMappings(mappings: ProviderMappingEntry[]) {
  const supportedProviders = ["fal-ai", "replicate"];

  return mappings
    .filter((entry) => entry.task === "text-to-speech" && entry.status !== "staging")
    .sort((left, right) => {
      const leftIndex = supportedProviders.indexOf(left.provider);
      const rightIndex = supportedProviders.indexOf(right.provider);
      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
    });
}

async function downloadAudio(url: string): Promise<TtsResult> {
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      adapter: "http",
      responseType: "arraybuffer",
      timeout: 120_000,
    });

    return {
      ok: true,
      buffer: new Uint8Array(response.data),
      contentType: response.headers["content-type"] || "audio/wav",
    };
  } catch (error) {
    const axiosError = error as any;
    const message = [
      axiosError?.message,
      readProviderErrorBody(axiosError?.response?.data),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      ok: false,
      status: axiosError?.response?.status || 500,
      message: message || "failed to download audio",
    };
  }
}

async function requestFalAiTts(
  mapping: ProviderMappingEntry,
  token: string,
  text: string,
): Promise<TtsResult> {
  try {
    const response = await axios.post(
      `https://router.huggingface.co/fal-ai/${mapping.providerId}`,
      { text },
      {
        adapter: "http",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 120_000,
      },
    );

    if (typeof response.data?.audio?.url !== "string") {
      return {
        ok: false,
        status: response.status,
        message: "Malformed fal-ai TTS response",
      };
    }

    return await downloadAudio(response.data.audio.url);
  } catch (error) {
    const axiosError = error as any;
    const message = [
      axiosError?.message,
      readProviderErrorBody(axiosError?.response?.data),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      ok: false,
      status: axiosError?.response?.status || 500,
      message: message || "fal-ai TTS request failed",
      loading:
        (axiosError?.response?.status || 500) === 503 &&
        /loading/i.test(message),
    };
  }
}

async function requestReplicateTts(
  mapping: ProviderMappingEntry,
  token: string,
  text: string,
): Promise<TtsResult> {
  try {
    const usesVersionRoute = mapping.providerId.includes(":");
    const url = usesVersionRoute
      ? "https://router.huggingface.co/replicate/v1/predictions"
      : `https://router.huggingface.co/replicate/v1/models/${mapping.providerId}/predictions`;

    const response = await axios.post(
      url,
      {
        input: {
          text,
        },
        version: usesVersionRoute ? mapping.providerId.split(":")[1] : undefined,
      },
      {
        adapter: "http",
        headers: {
          Authorization: `Bearer ${token}`,
          Prefer: "wait",
          "Content-Type": "application/json",
        },
        timeout: 120_000,
      },
    );

    const output = response.data?.output;
    if (typeof output === "string") {
      return await downloadAudio(output);
    }

    if (Array.isArray(output) && typeof output[0] === "string") {
      return await downloadAudio(output[0]);
    }

    const status = String(response.data?.status || "");
    if (status && ["starting", "processing"].includes(status)) {
      return {
        ok: false,
        status: 503,
        message: `Replicate model is ${status}`,
        loading: true,
      };
    }

    return {
      ok: false,
      status: response.status,
      message: "Malformed replicate TTS response",
    };
  } catch (error) {
    const axiosError = error as any;
    const message = [
      axiosError?.message,
      readProviderErrorBody(axiosError?.response?.data),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      ok: false,
      status: axiosError?.response?.status || 500,
      message: message || "replicate TTS request failed",
      loading:
        (axiosError?.response?.status || 500) === 503 &&
        /loading|starting|processing/i.test(message),
    };
  }
}

async function requestTtsFromMapping(
  mapping: ProviderMappingEntry,
  token: string,
  text: string,
) {
  if (mapping.provider === "fal-ai") {
    return requestFalAiTts(mapping, token, text);
  }

  if (mapping.provider === "replicate") {
    return requestReplicateTts(mapping, token, text);
  }

  return {
    ok: false,
    status: 501,
    message: `Unsupported TTS provider: ${mapping.provider}`,
  } satisfies TtsResult;
}

async function requestTtsAudio(
  models: string[],
  token: string,
  text: string,
): Promise<SuccessfulTtsResult | FailedTtsResult> {
  let lastError: FailedTtsResult | null = null;
  let loadingSeen = false;
  const attempts: Array<{ model: string; status: number; message: string }> = [];

  for (const model of models) {
    const mappings = selectTtsMappings(await fetchInferenceProviderMappings(model, token));
    if (mappings.length === 0) {
      attempts.push({
        model,
        status: 404,
        message: "No supported text-to-speech inference provider mapping found",
      });
      lastError = {
        ok: false,
        status: 404,
        message: "No supported text-to-speech inference provider mapping found",
        model,
        attempts: [...attempts],
      };
      continue;
    }

    for (const mapping of mappings) {
      const result = await requestTtsFromMapping(mapping, token, text);
      if (result.ok) {
        return { ...result, model };
      }

      attempts.push({
        model: `${model}@${mapping.provider}`,
        status: result.status,
        message: result.message,
      });
      lastError = {
        ...result,
        model,
        attempts: [...attempts],
      };
      if (result.loading) {
        loadingSeen = true;
      }
    }
  }

  if (loadingSeen) {
    return {
      ok: false,
      status: 503,
      message: "All configured TTS models are currently loading on HuggingFace.",
      loading: true,
      model: lastError?.model,
      attempts,
    };
  }

  return lastError || {
    ok: false,
    status: 500,
    message: "Unknown TTS error",
    attempts,
  };
}

export const ttsRoutes = new Elysia({ prefix: "/tts" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))
  .get(
    "/cache/:id/audio",
    async ({ params, set }) => {
      const cached = await db.findOne("EnglishSoundCache", [
        db.filter.eq("id", params.id),
      ]);

      if (!cached?.audio?._blob_bucket || !cached?.audio?._blob_key) {
        set.status = 404;
        return { error: "Not found" };
      }

      const file = await db.downloadBlob(cached.audio);
      const headers: Record<string, string> = {
        "Content-Type": file.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      };

      if (file.contentLength) {
        headers["Content-Length"] = String(file.contentLength);
      }
      if (file.lastModified) {
        headers["Last-Modified"] = file.lastModified;
      }
      if (file.etag) {
        headers.ETag = file.etag;
      }

      return new Response(file.buffer, { headers });
    },
  )

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
        cached.id &&
        (!cached.model || modelCandidates.includes(cached.model))
      ) {
        return {
          audioUrl: buildPlaybackUrl(cached.id),
          storageUrl: cached.audioUrl,
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

        return {
          audioUrl: buildPlaybackUrl(cacheItem.id),
          storageUrl: audioUrl,
          cached: false,
          model: result.model,
        };
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
