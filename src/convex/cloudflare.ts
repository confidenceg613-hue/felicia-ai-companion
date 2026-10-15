"use node";

import { v } from "convex/values";
import {
  aiHordeApiKey,
  cloudflareAccountId,
  cloudflareToken,
  groqApiKey,
  groqVoiceEnabled,
} from "./config";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

/**
 * AI Horde — image generation only.
 *
 * Text and voice have their own backends now:
 *   chat  → Groq chat completions
 *   speak → Cloudflare Workers AI voice models, with Groq Orpheus TTS as an
 *           alternative when Cloudflare is unavailable
 *   image → AI Horde
 *
 * The token and account id are read from the deployment environment so the
 * secret never reaches the browser bundle. Add them in the project's
 * Keys/API keys settings as:
 *   CLOUDFLARE_API_TOKEN   – an API token with the "Workers AI: Read" permission
 *   CLOUDFLARE_ACCOUNT_ID  – the account that owns the Workers AI usage
 *   GROQ_API_KEY           – used for both chat and Groq text-to-speech
 */

/**
 * Felicia's speaking voice. Aura's feminine English speakers include asteria,
 * athena, luna, hera and stella.
 */
export const FELICIA_VOICE = "asteria";

/**
 * Voice models in preference order.
 *
 * Aura-1 is the better voice but costs ~1,364 neurons per 1,000 characters;
 * MeloTTS is roughly a hundred times cheaper at ~18.6 neurons per audio minute.
 * Both share the same daily neuron budget as her photos, so the cheaper model is
 * a genuine fallback rather than a token one.
 *
 * Neither model's REST response shape is documented, so the response is parsed
 * defensively below.
 */
const TTS_MODELS: Array<{
  model: string;
  mimeType: string;
  body: (text: string) => unknown;
}> = [
  {
    model: "@cf/deepgram/aura-1",
    mimeType: "audio/mpeg",
    body: (text) => ({ text, speaker: FELICIA_VOICE }),
  },
  {
    model: "@cf/myshell-ai/melotts",
    mimeType: "audio/mpeg",
    body: (text) => ({ prompt: text, lang: "en" }),
  },
];

/** Paths where a base64 audio payload might live, most likely first. */
const BASE64_AUDIO_PATHS: string[][] = [
  ["result", "audio"],
  ["result", "audio_base64"],
  ["result", "audioBase64"],
  ["result", "data"],
  ["result", "output"],
  ["result", "mp3"],
  ["audio"],
  ["data"],
];

/** Dig a base64 audio string out of an unknown JSON envelope. */
function pickBase64Audio(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  for (const path of BASE64_AUDIO_PATHS) {
    let node: unknown = root;
    for (const key of path) {
      if (!node || typeof node !== "object") {
        node = undefined;
        break;
      }
      node = (node as Record<string, unknown>)[key];
    }
    if (typeof node === "string" && node.length > 100) return node;
  }

  // Last resort: a long, unbroken string sitting under `result`.
  const result = root.result;
  if (result && typeof result === "object") {
    for (const value of Object.values(result as Record<string, unknown>)) {
      if (
        typeof value === "string" &&
        value.length > 200 &&
        !/\s/.test(value.slice(0, 120))
      ) {
        return value;
      }
    }
  }
  return null;
}

const VOICE_CONFIG_HINT =
  "Cloudflare Workers AI is not connected yet. Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in your project's Keys/API keys settings, then try again.";

function voiceCredentials(): { token: string; accountId: string } {
  const token = cloudflareToken();
  const accountId = cloudflareAccountId();
  if (!token || !accountId) {
    throw new Error(VOICE_CONFIG_HINT);
  }
  return { token, accountId };
}

async function runVoiceModel(
  accountId: string,
  token: string,
  model: string,
  body: unknown,
): Promise<Response> {
  return await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

/** Turn a Cloudflare error response into something readable. */
function describeVoiceFailure(status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      errors?: Array<{ message?: string }>;
    };
    const message = parsed.errors?.[0]?.message;
    if (message) {
      // "AiError: AiError: Input prompt contains NSFW content." reads poorly.
      return message.replace(/^AiError:\s*/i, "").replace(/^AiError:\s*/i, "");
    }
  } catch {
    // fall through to the raw text
  }
  return raw.slice(0, 300) || `Cloudflare returned status ${status}`;
}

/**
 * Ask Felicia's text model for a reply, using Groq.
 *
 * Uses the OpenAI-compatible chat completions endpoint, so Felicia's existing
 * message shape (`role` + `content`) works unchanged.
 *
 * Returns the assistant text only.
 */
export const chat = internalAction({
  args: {
    messages: v.array(
      v.object({ role: v.string(), content: v.string() }),
    ),
  },
  returns: v.string(),
  handler: async (_ctx, { messages }): Promise<string> => {
    const apiKey = groqApiKey();
    if (!apiKey) {
      throw new Error(
        "Groq is not connected yet. Add GROQ_API_KEY in your project's " +
          "Keys/API keys settings, then try again.",
      );
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // llama-3.1-8b-instant is scheduled off free/Developer tiers on 2026-08-16.
          // If the model below is blocked at the project or org level, open:
          //   https://console.groq.com/settings/project/limits
          //   https://console.groq.com/settings/limits
          // and enable it there. Org-level model permissions override project settings.
          model: "openai/gpt-oss-120b",
          messages,
          temperature: 0.85,
          max_completion_tokens: 400,
        }),
      },
    );

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(groqFailure(response.status, raw));
    }

    let payload: {
      choices?: Array<{ message?: { content?: unknown } }>;
      error?: { message?: string };
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error("Felicia's model returned an unreadable response.");
    }

    if (payload.error) {
      throw new Error(payload.error.message || "Groq returned an error.");
    }

    const text =
      typeof payload.choices?.[0]?.message?.content === "string"
        ? payload.choices[0].message.content
        : "";

    if (!text.trim()) {
      throw new Error("Felicia's model returned an empty reply.");
    }
    return text.trim();
  },
});

/** Turn a Groq error response into something readable. */
function groqFailure(status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; type?: string };
    };
    const message =
      parsed.error?.message ?? parsed.error?.type ?? null;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  } catch {
    // fall through to the raw body
  }
  if (raw.trim()) return raw.slice(0, 300);
  return `Groq returned status ${status}`;
}

/**
 * Generate one photo of Felicia on the AI Horde and store it in Convex storage.
 *
 * The Horde is asynchronous: submit the job, poll `/check/{id}` until it is done,
 * then read the image URL from `/status/{id}`. The returned URL is only good for a
 * few minutes, so it is downloaded immediately and persisted into Convex storage
 * before it expires.
 *
 * Queues are volunteer-powered, so a request can take anywhere from a few seconds to
 * a couple of minutes. The caller (the photo develop animation in `Dashboard.tsx`)
 * already waits for generation + browser decode + a short develop window, so this
 * action is free to take as long as the Horde needs.
 */
export const generateImage = internalAction({
  args: { prompt: v.string() },
  returns: v.object({ storageId: v.id("_storage"), mimeType: v.string() }),
  handler: async (
    ctx,
    { prompt },
  ): Promise<{ storageId: Id<"_storage">; mimeType: string }> => {
    const apiKey = aiHordeApiKey();
    if (!apiKey) {
      throw new Error(
        "AI Horde is not connected yet. Add AI_HORDE_API_KEY in your project's " +
          "Keys/API keys settings, then try again.",
      );
    }

    const baseUrl = "https://aihorde.com/api/v2";
    const headers = {
      apikey: apiKey,
      "content-type": "application/json",
    };

    /**
     * A realistic portrait aspect ratio for a full-body social photo.
     * Native SDXL / Flux-friendly resolution, portrait orientation.
     */
    const width = 832;
    const height = 1216;

    const submit = await fetch(`${baseUrl}/generate/async`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        params: {
          width,
          height,
          steps: 25,
          n: 1,
        },
        nsfw: false,
      }),
    });

    const submitRaw = await submit.text();
    if (!submit.ok) {
      throw new Error(
        `AI Horde rejected the request: ${describeHordeFailure(submit.status, submitRaw)}`,
      );
    }

    let requestId: string;
    try {
      const submitPayload = JSON.parse(submitRaw) as {
        id?: string;
        error?: string;
      };
      if (submitPayload.error) {
        throw new Error(submitPayload.error);
      }
      if (!submitPayload.id || typeof submitPayload.id !== "string") {
        throw new Error("AI Horde did not return a request id.");
      }
      requestId = submitPayload.id;
    } catch (error) {
      throw new Error(
        `AI Horde submitted but the reply was unreadable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Poll until the Horde reports the request as done, waiting at least one
    // second between checks so we don't pound the 1-second cache.
    let done = false;
    let attempts = 0;
    const maxAttempts = 120; // ~2 minutes at 1-second polling

    while (!done && attempts < maxAttempts) {
      await sleep(1000);
      attempts += 1;

      const check = await fetch(`${baseUrl}/generate/check/${requestId}`, {
        headers,
      });
      if (!check.ok) {
        continue; // transient statuses are retried; the status endpoint will
        // give a clearer error once the request is finished or failed.
      }

      const checkRaw = await check.text();
      try {
        const checkPayload = JSON.parse(checkRaw) as {
          done?: boolean;
        };
        done = !!checkPayload.done;
      } catch {
        // If we cannot parse the check response, keep polling — the status
        // endpoint is the authoritative result source.
      }
    }

    if (!done) {
      throw new Error(
        "AI Horde did not finish the photo in time. It is a volunteer network, " +
          "so this can happen under load — try again in a moment.",
      );
    }

    // Retrieve the finished generations.
    const statusResponse = await fetch(`${baseUrl}/generate/status/${requestId}`, {
      headers,
    });
    const statusRaw = await statusResponse.text();

    if (!statusResponse.ok) {
      throw new Error(
        `AI Horde finished the request but would not give back the image: ${describeHordeFailure(statusResponse.status, statusRaw)}`,
      );
    }

    const statusPayload = (() => {
      try {
        return JSON.parse(statusRaw);
      } catch {
        throw new Error("AI Horde returned an unreadable status response.");
      }
    })() as {
      generations?: Array<{ img?: string; seed?: number }>;
      error?: string;
    };

    if (statusPayload.error) {
      throw new Error(statusPayload.error);
    }

    const generations =
      Array.isArray(statusPayload.generations) ? statusPayload.generations : [];
    const first = generations[0];
    const imageUrl =
      typeof first?.img === "string" && first.img ? first.img : null;

    if (!imageUrl) {
      throw new Error(
        "AI Horde finished the request but did not return any images.",
      );
    }

    // Download the image immediately — these URLs expire after a few minutes.
    const imageResponse = await fetch(imageUrl, {
      headers: { accept: "image/*" },
    });
    if (!imageResponse.ok) {
      throw new Error(
        "AI Horde returned an image URL that stopped working before we could download it.",
      );
    }

    const contentType =
      imageResponse.headers.get("content-type") ?? "image/jpeg";
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new Error("AI Horde returned an empty image.");
    }

    const mimeType =
      contentType.split(";")[0]?.trim() || "image/jpeg";
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array(bytes)], { type: mimeType }),
    );

    return { storageId, mimeType };
  },
});

/**
 * Groq Orpheus text-to-speech.
 *
 * Returns WAV bytes directly from `POST /openai/v1/audio/speech`.
 */
async function speakWithGroq(
  apiKey: string,
  text: string,
): Promise<{ bytes: Uint8Array; mimeType: string; model: string }> {
  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/speech",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "canopylabs/orpheus-v1-english",
        input: text,
        voice: "austin",
        response_format: "wav",
      }),
    },
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(groqAudioFailure(response.status, raw));
  }

  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("Groq TTS returned empty audio.");
  }

  return {
    bytes: new Uint8Array(bytes),
    mimeType:
      contentType.split(";")[0]?.trim() || "audio/wav",
    model: "canopylabs/orpheus-v1-english",
  };
}

/** Turn a Groq audio error response into something readable. */
function groqAudioFailure(status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; type?: string };
    };
    const message =
      parsed.error?.message ?? parsed.error?.type ?? null;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  } catch {
    // fall through to the raw body
  }
  if (raw.trim()) return raw.slice(0, 300);
  return `Groq TTS returned status ${status}`;
}

/**
 * Sleep for the given number of milliseconds. Used only by the Horde polling
 * loop, where we deliberately pause between status checks.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Keep the timer reference so we could clear it if the action were cancelled.
    void timer;
  });
}

/** Turn a Horde error response into something readable. */
function describeHordeFailure(status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      detail?: string;
      error?: string;
      message?: string;
    };
    const message =
      parsed.detail ?? parsed.error ?? parsed.message ?? null;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  } catch {
    // fall through to the raw body
  }
  if (raw.trim()) return raw.slice(0, 300);
  return `AI Horde returned status ${status}`;
}

/**
 * Render text as speech and store it in Convex file storage.
 *
 * Walks the voice ladder until one model answers with usable audio; if every
 * model fails the error lists what each one said, so a quota problem reads
 * differently from a malformed request.
 *
 * The default ladder is Cloudflare Workers AI because it returns MP3 directly.
 * If Cloudflare is unavailable, this falls back to Groq Orpheus TTS, which
 * returns WAV audio from the Groq Audio API.
 */
export const speak = internalAction({
  args: { text: v.string() },
  returns: v.object({
    storageId: v.id("_storage"),
    mimeType: v.string(),
    model: v.string(),
  }),
  handler: async (
    ctx,
    { text },
  ): Promise<{ storageId: Id<"_storage">; mimeType: string; model: string }> => {
    const { token, accountId } = voiceCredentials();
    const spoken = text.trim().slice(0, 600);
    if (!spoken) throw new Error("There is nothing to say.");

    const failures: string[] = [];

    for (const candidate of TTS_MODELS) {
      let response: Response;
      try {
        response = await runVoiceModel(
          accountId,
          token,
          candidate.model,
          candidate.body(spoken),
        );
      } catch (error) {
        failures.push(
          `${candidate.model}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      if (!response.ok) {
        failures.push(
          `${candidate.model}: ${describeVoiceFailure(response.status, await response.text())}`,
        );
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      let bytes: Buffer;
      let mimeType: string;

      try {
        if (contentType.startsWith("audio/")) {
          mimeType = contentType.split(";")[0]?.trim() || candidate.mimeType;
          bytes = Buffer.from(await response.arrayBuffer());
        } else {
          const base64 = pickBase64Audio(await response.json());
          if (!base64) {
            failures.push(`${candidate.model}: unrecognised audio response`);
            continue;
          }
          mimeType = candidate.mimeType;
          bytes = Buffer.from(base64, "base64");
        }
      } catch (error) {
        failures.push(
          `${candidate.model}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      if (bytes.byteLength === 0) {
        failures.push(`${candidate.model}: returned empty audio`);
        continue;
      }

      const storageId = await ctx.storage.store(
        new Blob([new Uint8Array(bytes)], { type: mimeType }),
      );
      return { storageId, mimeType, model: candidate.model };
    }

    // Cloudflare did not work; try Groq Orpheus TTS if a Groq key is present.
    if (groqVoiceEnabled()) {
      try {
        const groqAudio = await speakWithGroq(groqApiKey()!, spoken);
        const storageId = await ctx.storage.store(
          new Blob([new Uint8Array(groqAudio.bytes)], { type: groqAudio.mimeType }),
        );
        return { storageId, mimeType: groqAudio.mimeType, model: groqAudio.model };
      } catch (error) {
        failures.push(`groq/orpheus: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`Felicia could not speak: ${failures.join(" | ")}`);
  },
});
