"use node";

import { v } from "convex/values";
import {
  aiHordeApiKey,
  cloudflareAccountId,
  cloudflareToken,
  groqApiKey,
  groqVoiceEnabled,
  isCloudflareConfigured,
} from "./config";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

/**
 * The slice of an action context the image helpers below actually use.
 *
 * Typed structurally rather than as the generated action context type: these
 * are plain functions shared by the internal action, and this keeps them
 * honest about needing nothing more than storage.
 */
type ImageCtx = {
  storage: { store: (blob: Blob) => Promise<Id<"_storage">> };
};

/**
 * Image and voice backends.
 *
 * Text and voice have their own backends now:
 *   chat  → Groq chat completions
 *   speak → Cloudflare Workers AI voice models, with Groq Orpheus TTS as an
 *           alternative when Cloudflare is unavailable
 *   image → Cloudflare's unified AI endpoint with google/nano-banana-2.1,
 *           falling back to the AI Horde (free, volunteer-powered)
 *
 * The token and account id are read from the deployment environment so the
 * secret never reaches the browser bundle. Add them in the project's
 * Keys/API keys settings as:
 *   CLOUDFLARE_API_TOKEN   – an API token with the "Workers AI: Read" permission
 *   CLOUDFLARE_ACCOUNT_ID  – the account that owns the Workers AI usage
 *   GROQ_API_KEY           – used for both chat and Groq text-to-speech
 */

/**
 * Felicia's speaking voice.
 *
 * Groq Orpheus is the primary voice because it reads as a real woman talking
 * rather than as a narrator. `hannah` is one of the three feminine English
 * Orpheus personas (the others are `autumn` and `diana`); swap the constant to
 * audition them. Vocal directions are deliberately omitted from the request,
 * because Groq says that produces the most natural conversational cadence.
 *
 * The Cloudflare voices are the fallback. Aura's feminine English speakers
 * include asteria, athena, luna, hera and stella.
 */
export const FELICIA_GROQ_VOICE = "hannah";
export const FELICIA_VOICE = "asteria";

/**
 * Orpheus caps a single request at 200 characters, so longer lines are split
 * and the audio is stitched back together. See `splitForSpeech` / `buildWav`.
 */
const GROQ_SPEECH_LIMIT = 200;

/**
 * Cloudflare voice models in preference order — the fallback ladder used when
 * Groq Orpheus is unavailable.
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
          // gpt-oss is a reasoning model: it spends completion tokens on hidden
          // reasoning before writing any visible text. "low" keeps that spending
          // near ~50 tokens instead of ~200, which both cuts latency and stops a
          // long system prompt from burning the whole budget and returning an
          // empty reply. The ceiling is generous so the visible reply always has
          // room even when the model reasons more than usual.
          reasoning_effort: "low",
          max_completion_tokens: 700,
        }),
      },
    );

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(groqFailure(response.status, raw));
    }

    let payload: {
      choices?: Array<{
        message?: { content?: unknown };
        finish_reason?: string;
      }>;
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

    const choice = payload.choices?.[0];
    const text =
      typeof choice?.message?.content === "string" ? choice.message.content : "";

    if (!text.trim()) {
      // A reasoning model that ran out of budget before writing any visible text
      // looks exactly like a broken model from here, so say which it is.
      throw new Error(
        choice?.finish_reason === "length"
          ? "Felicia ran out of room before she finished that thought. Try a shorter message."
          : "Felicia's model returned an empty reply.",
      );
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
 * Felicia's image model, called through Cloudflare's unified AI endpoint.
 *
 * Two details that are easy to get wrong and cost a full debugging session:
 * Nano Banana 2.1 is a *third-party* (Google) model, so it is posted to
 * `/ai/run` with the model in the body — the older `/ai/run/{model}` path
 * answers `400 No route for that URI` for it — and it bills against the
 * account's AI Gateway balance rather than the Workers AI neuron pool, so an
 * empty balance comes back as `402 Insufficient balance` rather than as an
 * auth error.
 */
const IMAGE_MODEL = "google/nano-banana-2.1";

/** Decode base64 (with or without padding) into plain bytes. */
function decodeBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/** Split a `data:` URI into bytes and a MIME type, or null if it is malformed. */
function decodeDataUri(
  uri: string,
): { bytes: Uint8Array; mimeType: string } | null {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(uri);
  if (!match) return null;

  const mimeType = match[1] || "image/png";
  if (!match[2]) {
    return {
      bytes: new TextEncoder().encode(decodeURIComponent(match[3])),
      mimeType,
    };
  }
  return { bytes: decodeBase64(match[3]), mimeType };
}

/** Turn a Cloudflare error body into something a person can act on. */
function cloudflareFailure(status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      errors?: Array<{ message?: string }>;
      messages?: Array<{ message?: string }>;
    };
    const message =
      parsed.errors?.[0]?.message ?? parsed.messages?.[0]?.message ?? null;
    if (message && message.trim()) {
      if (status === 402 || /insufficient balance/i.test(message)) {
        return (
          `Cloudflare can't render photos right now: ${IMAGE_MODEL} is a ` +
          "third-party model and the account has no balance for it. Add " +
          "credits (or bring your own key) in the Cloudflare dashboard."
        );
      }
      return `Cloudflare could not render the photo: ${message}`;
    }
  } catch {
    // fall through to the raw body
  }
  if (raw.trim()) return `Cloudflare returned status ${status}: ${raw.slice(0, 200)}`;
  return `Cloudflare returned status ${status}`;
}

/**
 * Pull an image source out of whatever the endpoint answered with.
 *
 * The documented success shape is `{ state, result: { image: <url> } }`, but a
 * hosted Workers AI model returns raw image bytes and other routes have shipped
 * base64 and arrays, so every plausible location is checked in order.
 */
function nanoBananaSource(payload: unknown): string | null {
  if (typeof payload === "string" && payload) return payload;
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const result = record.result;
  const candidates: unknown[] = [record.image, result];

  if (result && typeof result === "object" && !Array.isArray(result)) {
    const inner = result as Record<string, unknown>;
    candidates.push(inner.image, inner.images, inner.url, inner.output);
  }

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) return candidate;
    if (!Array.isArray(candidate) || candidate.length === 0) continue;

    const first = candidate[0];
    if (typeof first === "string" && first) return first;
    if (first && typeof first === "object") {
      const item = first as Record<string, unknown>;
      if (typeof item.image === "string" && item.image) return item.image;
      if (typeof item.url === "string" && item.url) return item.url;
      if (typeof item.b64_json === "string" && item.b64_json) {
        return `data:image/png;base64,${item.b64_json}`;
      }
    }
  }

  return null;
}

/** Persist raw image bytes in Convex storage and report what they are. */
async function storeImage(
  ctx: ImageCtx,
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ storageId: Id<"_storage">; mimeType: string }> {
  if (bytes.byteLength === 0) {
    throw new Error("Cloudflare returned an empty image.");
  }
  const storageId = await ctx.storage.store(
    // `slice()` so a view over a pooled buffer hands Blob exactly the image.
    new Blob([bytes.slice()], { type: mimeType }),
  );
  return { storageId, mimeType };
}

/**
 * Generate one photo of Felicia with Nano Banana 2.1 and store it.
 *
 * Unlike the Horde this is synchronous: one request comes back with the finished
 * image (as a URL, a data URI, or raw bytes), so there is nothing to poll.
 */
async function generateWithNanoBanana(
  ctx: ImageCtx,
  prompt: string,
): Promise<{ storageId: Id<"_storage">; mimeType: string }> {
  const token = cloudflareToken();
  const accountId = cloudflareAccountId();
  if (!token || !accountId) {
    throw new Error(
      "Cloudflare is not connected yet. Add CLOUDFLARE_API_TOKEN and " +
        "CLOUDFLARE_ACCOUNT_ID in your project's Keys/API keys settings.",
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        // 2:3 portrait — the frame every photo slot in the app expects.
        input: { prompt, aspect_ratio: "2:3" },
      }),
    },
  );

  // A hosted Workers AI model answers with raw image bytes; the third-party
  // route answers with JSON. Branch on the content type before reading the body
  // so binary data is never mangled through text().
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok || bytes.byteLength === 0) {
      throw new Error(cloudflareFailure(response.status, ""));
    }
    return storeImage(ctx, bytes, contentType.split(";")[0]?.trim() || "image/jpeg");
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(cloudflareFailure(response.status, raw));
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("Cloudflare returned an unreadable photo response.");
  }

  const source = nanoBananaSource(payload);
  if (!source) {
    throw new Error(cloudflareFailure(response.status, raw));
  }

  if (source.startsWith("data:")) {
    const decoded = decodeDataUri(source);
    if (!decoded) throw new Error("Cloudflare returned malformed image data.");
    return storeImage(ctx, decoded.bytes, decoded.mimeType);
  }

  if (/^https?:\/\//i.test(source)) {
    const imageResponse = await fetch(source, {
      headers: { accept: "image/*" },
    });
    if (!imageResponse.ok) {
      throw new Error(
        "Cloudflare returned an image URL that stopped working before we could download it.",
      );
    }
    const mime =
      (imageResponse.headers.get("content-type") ?? "image/jpeg")
        .split(";")[0]
        ?.trim() || "image/jpeg";
    return storeImage(
      ctx,
      new Uint8Array(await imageResponse.arrayBuffer()),
      mime,
    );
  }

  // Bare base64 with no data: prefix.
  if (source.length > 64 && /^[A-Za-z0-9+/=\s]+$/.test(source)) {
    return storeImage(ctx, decodeBase64(source), "image/png");
  }

  throw new Error("Cloudflare returned no usable image.");
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
async function generateWithHorde(
  ctx: ImageCtx,
  prompt: string,
): Promise<{ storageId: Id<"_storage">; mimeType: string }> {
    const apiKey = aiHordeApiKey();
    if (!apiKey) {
      throw new Error(
        "AI Horde is not connected yet. Add AI_HORDE_API_KEY in your project's " +
          "Keys/API keys settings, then try again.",
      );
    }

    // The API lives on stablehorde.net. aihorde.com is the project's website,
    // and it answers every /api/v2 request with a 404 — which surfaced as
    // "AI Horde rejected the request: AI Horde returned status 404" and meant
    // no photo ever generated.
    const baseUrl = "https://stablehorde.net/api/v2";
    const headers = {
      apikey: apiKey,
      "content-type": "application/json",
    };

    /**
     * A 2:3 portrait frame for a full-body social photo.
     *
     * The Horde refuses anything above a 786x786 pixel budget for clients that
     * have not banked kudos yet ("requires 20.13 kudos to fulfil"). 640x960 is
     * 614,400 pixels — the largest true portrait ratio that fits under that cap,
     * so it produces the sharpest photo an unauthenticated-tier key can request.
     */
    const width = 640;
    const height = 960;

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
}

/**
 * The account-hosted Workers AI image model — the safety net under Nano Banana.
 *
 * Nano Banana is a third-party model billed against the account's AI Gateway
 * balance, so an empty balance comes back as `402`. This one runs on the
 * account's own Workers AI allocation and answers with raw image bytes, so
 * photos keep working while the balance is being sorted out.
 */
const HOSTED_IMAGE_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

async function generateWithHostedModel(
  ctx: ImageCtx,
  prompt: string,
): Promise<{ storageId: Id<"_storage">; mimeType: string }> {
  const token = cloudflareToken();
  const accountId = cloudflareAccountId();
  if (!token || !accountId) {
    throw new Error(
      "Cloudflare is not connected yet. Add CLOUDFLARE_API_TOKEN and " +
        "CLOUDFLARE_ACCOUNT_ID in your project's Keys/API keys settings.",
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${HOSTED_IMAGE_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        negative_prompt:
          "blurry, low quality, extra fingers, deformed, distorted face",
      }),
    },
  );

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    return storeImage(
      ctx,
      new Uint8Array(await response.arrayBuffer()),
      contentType.split(";")[0]?.trim() || "image/png",
    );
  }

  throw new Error(cloudflareFailure(response.status, await response.text()));
}

/**
 * Generate one photo of Felicia and store it in Convex storage.
 *
 * Three engines, cheapest success first:
 *   1. Nano Banana 2.1 on Cloudflare — the requested model, synchronous, but
 *      third-party and billed against the account's gateway balance.
 *   2. Cloudflare's own hosted image model — same account, no gateway balance
 *      involved, so a `402` degrades to a slower photo rather than to none.
 *   3. The AI Horde — free, volunteer-powered, and deliberately last.
 */
export const generateImage = internalAction({
  args: { prompt: v.string() },
  returns: v.object({ storageId: v.id("_storage"), mimeType: v.string() }),
  handler: async (
    ctx,
    { prompt },
  ): Promise<{ storageId: Id<"_storage">; mimeType: string }> => {
    let nanoBananaError: unknown = null;
    let hostedError: unknown = null;

    if (isCloudflareConfigured()) {
      try {
        return await generateWithNanoBanana(ctx, prompt);
      } catch (error) {
        nanoBananaError = error;
      }

      try {
        return await generateWithHostedModel(ctx, prompt);
      } catch (error) {
        hostedError = error;
      }
    }

    const reason = (value: unknown) =>
      value instanceof Error ? value.message : value ? String(value) : null;
    const primary = reason(nanoBananaError);

    if (aiHordeApiKey()) {
      try {
        return await generateWithHorde(ctx, prompt);
      } catch (hordeError) {
        // All three failed. Lead with Nano Banana's reason when it is a
        // billing problem — that is the actionable half; the volunteer queue
        // timing out on top of it is only the symptom the user can see.
        if (primary && /balance|billing|402/i.test(primary)) {
          throw new Error(`${primary} (The AI Horde fallback failed too: ${reason(hordeError)})`);
        }
        throw hordeError;
      }
    }

    if (primary) {
      const hosted = reason(hostedError);
      throw new Error(hosted ? `${primary} ${hosted}` : primary);
    }
    throw new Error(
      "No photo backend is configured. Add CLOUDFLARE_API_TOKEN + " +
        "CLOUDFLARE_ACCOUNT_ID (Nano Banana), or AI_HORDE_API_KEY (free fallback).",
    );
  },
});

/**
 * Groq Orpheus text-to-speech.
 *
 * Returns WAV bytes from `POST /openai/v1/audio/speech`. Orpheus accepts at most
 * 200 characters per request, so a longer line is split at sentence boundaries
 * and the resulting WAV files are stitched into one continuous clip.
 */
async function speakWithGroq(
  apiKey: string,
  text: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string; model: string }> {
  const model = "canopylabs/orpheus-v1-english";
  const chunks = splitForSpeech(text, GROQ_SPEECH_LIMIT);
  const parts: Array<{ fmt: Uint8Array; data: Uint8Array }> = [];

  for (const chunk of chunks) {
    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: chunk,
          voice: FELICIA_GROQ_VOICE,
          response_format: "wav",
        }),
      },
    );

    if (!response.ok) {
      throw new Error(groqAudioFailure(response.status, await response.text()));
    }

    const rawBytes = await response.arrayBuffer();
    if (rawBytes.byteLength === 0) {
      throw new Error("Groq TTS returned empty audio.");
    }

    const part = readWavChunks(new Uint8Array(rawBytes));
    if (!part) {
      // Not a WAV we can parse. If this was the whole line, happily use it as
      // is; if there were several chunks we cannot stitch them, so fail and let
      // the Cloudflare ladder try instead.
      if (chunks.length === 1) {
        return {
          bytes: new Uint8Array(rawBytes),
          mimeType: "audio/wav",
          model,
        };
      }
      throw new Error("Groq TTS returned audio in an unsupported container.");
    }
    parts.push(part);
  }

  const first = parts[0];
  if (!first) throw new Error("Groq TTS returned no audio.");

  const data = concatBytes(parts.map((part) => part.data));
  return { bytes: buildWav(first.fmt, data), mimeType: "audio/wav", model };
}

/**
 * Break a line into pieces Orpheus will accept, preferring to cut after a
 * sentence so the seams fall where a speaker would naturally pause.
 */
function splitForSpeech(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    let cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
    );
    if (cut < limit * 0.4) cut = window.lastIndexOf(", ");
    if (cut < limit * 0.4) cut = window.lastIndexOf("; ");
    if (cut < limit * 0.4) cut = window.lastIndexOf(" ");
    // No usable break, or a single very long word: hard-cut at the limit.
    if (cut <= 0) cut = limit - 1;
    else cut += 1;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks.filter((chunk) => chunk.length > 0);
}

/** Read the `fmt ` and `data` chunks out of a RIFF/WAVE buffer. */
function readWavChunks(
  buffer: Uint8Array,
): { fmt: Uint8Array; data: Uint8Array } | null {
  if (buffer.byteLength < 44) return null;
  if (readAscii(buffer, 0, 4) !== "RIFF") return null;
  if (readAscii(buffer, 8, 4) !== "WAVE") return null;

  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  let fmt: Uint8Array | null = null;
  let offset = 12;

  while (offset + 8 <= buffer.byteLength) {
    const id = readAscii(buffer, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = Math.min(start + size, buffer.byteLength);

    if (id === "fmt ") fmt = buffer.slice(start, end);
    if (id === "data") {
      return fmt ? { fmt, data: buffer.slice(start, end) } : null;
    }

    // RIFF chunks are word-aligned, so an odd size is followed by a pad byte.
    offset = start + size + (size % 2);
  }

  return null;
}

/** Rebuild one canonical WAV from a format chunk and raw sample data. */
function buildWav(fmt: Uint8Array, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const dataIdOffset = 20 + fmt.byteLength;
  const total = dataIdOffset + 8 + data.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  writeAscii(out, 0, "RIFF");
  view.setUint32(4, total - 8, true);
  writeAscii(out, 8, "WAVE");
  writeAscii(out, 12, "fmt ");
  view.setUint32(16, fmt.byteLength, true);
  out.set(fmt, 20);
  writeAscii(out, dataIdOffset, "data");
  view.setUint32(dataIdOffset + 4, data.byteLength, true);
  out.set(data, dataIdOffset + 8);

  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function readAscii(buffer: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += String.fromCharCode(buffer[offset + index] ?? 0);
  }
  return out;
}

function writeAscii(buffer: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    buffer[offset + index] = text.charCodeAt(index);
  }
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
 * The ladder runs in the order that sounds best first: Groq Orpheus reads as a
 * real woman talking, so it is tried before Cloudflare. Every failure is
 * collected, and the thrown error lists what each backend said — a quota
 * problem then reads differently from a malformed request.
 *
 * Cloudflare credentials are only required if Groq is unavailable, so a
 * deployment with just GROQ_API_KEY still has a voice.
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
    const spoken = text.trim().slice(0, 600);
    if (!spoken) throw new Error("There is nothing to say.");

    const failures: string[] = [];

    // Her best voice first.
    if (groqVoiceEnabled()) {
      try {
        const groqAudio = await speakWithGroq(groqApiKey()!, spoken);
        const storageId = await ctx.storage.store(
          new Blob([groqAudio.bytes], { type: groqAudio.mimeType }),
        );
        return {
          storageId,
          mimeType: groqAudio.mimeType,
          model: groqAudio.model,
        };
      } catch (error) {
        failures.push(
          `groq/orpheus: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Cloudflare needs both credentials; without them, skip to the error.
    const token = cloudflareToken();
    const accountId = cloudflareAccountId();
    if (!token || !accountId) {
      failures.push(`cloudflare: ${VOICE_CONFIG_HINT}`);
      throw new Error(`Felicia could not speak: ${failures.join(" | ")}`);
    }

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

    throw new Error(`Felicia could not speak: ${failures.join(" | ")}`);
  },
});
