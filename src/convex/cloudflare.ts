"use node";

import { v } from "convex/values";
import { cloudflareAccountId, cloudflareToken } from "./config";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

/**
 * Cloudflare Workers AI.
 *
 * The token and account id are read from the deployment environment so the
 * secret never reaches the browser bundle. Add them in the project's
 * Keys/API keys settings as:
 *   CLOUDFLARE_API_TOKEN   – an API token with the "Workers AI: Read" permission
 *   CLOUDFLARE_ACCOUNT_ID  – the account that owns the Workers AI usage
 */
const CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

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

const CONFIG_HINT =
  "Cloudflare Workers AI is not connected yet. Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in your project's Keys/API keys settings, then try again.";

function credentials(): { token: string; accountId: string } {
  const token = cloudflareToken();
  const accountId = cloudflareAccountId();
  if (!token || !accountId) {
    throw new Error(CONFIG_HINT);
  }
  return { token, accountId };
}

async function runModel(
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

/** Strip Cloudflare's error envelope down to something readable. */
function describeFailure(status: number, raw: string): string {
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
 * Ask Felicia's text model for a reply.
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
    const { token, accountId } = credentials();
    const response = await runModel(accountId, token, CHAT_MODEL, {
      messages,
      max_tokens: 400,
      temperature: 0.85,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(
        `Felicia's model is unavailable: ${describeFailure(response.status, raw)}`,
      );
    }

    let payload: {
      result?: {
        response?: unknown;
        choices?: Array<{ message?: { content?: unknown } }>;
      };
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error("Felicia's model returned an unreadable response.");
    }

    const text =
      typeof payload.result?.response === "string"
        ? payload.result.response
        : typeof payload.result?.choices?.[0]?.message?.content === "string"
          ? payload.result.choices[0].message.content
          : "";

    if (!text.trim()) {
      throw new Error("Felicia's model returned an empty reply.");
    }
    return text.trim();
  },
});

/**
 * Generate one photo of Felicia and store it in Convex file storage.
 *
 * Flux Schnell answers with JSON (`result.image` as base64). Other Workers AI
 * image models stream raw bytes instead, so both shapes are handled.
 */
export const generateImage = internalAction({
  args: { prompt: v.string() },
  returns: v.object({ storageId: v.id("_storage"), mimeType: v.string() }),
  handler: async (
    ctx,
    { prompt },
  ): Promise<{ storageId: Id<"_storage">; mimeType: string }> => {
    const { token, accountId } = credentials();
    const response = await runModel(accountId, token, IMAGE_MODEL, {
      prompt,
      steps: 8,
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(describeFailure(response.status, raw));
    }

    const contentType = response.headers.get("content-type") ?? "";
    let bytes: Buffer;
    let mimeType = "image/jpeg";

    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as {
        result?: { image?: unknown };
        image?: unknown;
      };
      const base64 =
        typeof payload.result?.image === "string"
          ? payload.result.image
          : typeof payload.image === "string"
            ? payload.image
            : null;
      if (!base64) {
        throw new Error("Cloudflare did not return an image.");
      }
      bytes = Buffer.from(base64, "base64");
    } else {
      mimeType = contentType.split(";")[0]?.trim() || "image/png";
      bytes = Buffer.from(await response.arrayBuffer());
    }

    if (bytes.byteLength === 0) {
      throw new Error("Cloudflare returned an empty image.");
    }

    // Copy into a plain ArrayBuffer-backed view so the Blob part type is exact.
    const bytesView = new Uint8Array(bytes);
    const storageId = await ctx.storage.store(
      new Blob([bytesView], { type: mimeType }),
    );
    return { storageId, mimeType };
  },
});

/**
 * Render text as speech and store it in Convex file storage.
 *
 * Walks the voice ladder until one model answers with usable audio; if every
 * model fails the error lists what each one said, so a quota problem reads
 * differently from a malformed request.
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
    const { token, accountId } = credentials();
    const spoken = text.trim().slice(0, 600);
    if (!spoken) throw new Error("There is nothing to say.");

    const failures: string[] = [];

    for (const candidate of TTS_MODELS) {
      let response: Response;
      try {
        response = await runModel(
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
          `${candidate.model}: ${describeFailure(response.status, await response.text())}`,
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
