"use node";

import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { groqApiKey } from "./config";

/**
 * Groq, as Felicia uses it.
 *
 * Her replies and her voice both come from Groq.
 *
 * Two rules shape this file:
 *
 *   1. A failure is reported, never papered over. There is deliberately no
 *      second model behind this one: if the tokens for the day are gone, the
 *      message is not sent and the person is told exactly that, instead of
 *      getting a reply from somewhere else while the real limit goes unnoticed.
 *   2. A failure must never look like a conversation. `sendMessage` only writes
 *      to the transcript once a reply exists, so a rejected request leaves her
 *      memory exactly as it was.
 */

const CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const SPEECH_URL = "https://api.groq.com/openai/v1/audio/speech";

/** The model behind her words. */
const CHAT_MODEL = "openai/gpt-oss-120b";

/** The voice she speaks with. */
const SPEECH_MODEL = "canopylabs/orpheus-v1-english";
const SPEECH_VOICE = "autumn";

/** A message as the chat endpoint wants it. */
const messageValidator = v.object({
  role: v.string(),
  content: v.string(),
});

/**
 * Why a request could not be answered.
 *
 *   quota         the daily token allowance for this project is used up
 *   unavailable   Groq is unreachable, or answered with something else
 *   not_configured  there is no key on this deployment at all
 *
 * `retryAfterMs` is only set when Groq says when to come back, so the screen
 * can promise a time instead of guessing one.
 */
export type GroqFailure = {
  code: "quota" | "unavailable" | "not_configured";
  message: string;
  retryAfterMs?: number;
};

function fail(failure: GroqFailure): never {
  throw new ConvexError(failure);
}

const MISSING_KEY: GroqFailure = {
  code: "not_configured",
  message:
    "Groq isn't connected on this deployment. Add GROQ_API_KEY in this " +
    "project's Keys settings.",
};

/** `11m3.12s`, `2h`, `45s` → milliseconds. */
function parseRetryAfter(text: string): number | undefined {
  const match = text.match(
    /(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:([\d.]+)\s*s)?/i,
  );
  if (!match) return undefined;
  const [, hours, minutes, seconds] = match;
  if (!hours && !minutes && !seconds) return undefined;
  const ms =
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes ?? 0) * 60_000 +
    Math.round(Number(seconds ?? 0) * 1000);
  return ms > 0 ? ms : undefined;
}

/**
 * Read a failed Groq response.
 *
 * A 429 is not one thing: the per-minute limiter asks for a short wait, while
 * the daily allowance is gone until it resets, and something else may be an
 * outage. They are worth telling apart, because only one of them is worth
 * sitting and waiting for.
 */
async function readFailure(response: Response): Promise<never> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    // The body only makes the message more useful; its absence is not fatal.
  }

  const message = extractMessage(body) ?? response.statusText;
  const headerRetry = Number(response.headers.get("retry-after"));

  if (response.status === 429 || /rate limit/i.test(message)) {
    const daily = /per day|\(TPD\)|daily/i.test(body) || /per day|\(TPD\)/i.test(message);
    const retryAfterMs = Number.isFinite(headerRetry)
      ? headerRetry * 1000
      : parseRetryAfter(message);

    if (daily) {
      return fail({
        code: "quota",
        message:
          "The daily token allowance for this deployment is used up, so she " +
          "can't reply right now.",
        ...(retryAfterMs ? { retryAfterMs } : {}),
      });
    }

    return fail({
      code: "unavailable",
      message: "Groq is rate-limiting this deployment at the moment.",
      ...(retryAfterMs ? { retryAfterMs } : {}),
    });
  }

  return fail({
    code: "unavailable",
    message: `Groq couldn't answer (${response.status}). ${message}`.trim(),
  });
}

/** The `error.message` field of a Groq error body, when there is one. */
function extractMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message;
  } catch {
    return undefined;
  }
}

/**
 * One completion — the whole of her side of a conversation.
 *
 * Returns the reply text with the surrounding whitespace trimmed, because the
 * model occasionally pads a short line with newlines and the chat renders what
 * it is given.
 */
export const chat = internalAction({
  args: {
    messages: v.array(messageValidator),
    temperature: v.optional(v.number()),
  },
  handler: async (
    _ctx: unknown,
    { messages, temperature }: { messages: Array<{ role: string; content: string }>; temperature?: number },
  ): Promise<string> => {
    const key = groqApiKey();
    if (!key) fail(MISSING_KEY);

    let response: Response;
    try {
      response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages,
          temperature: temperature ?? 0.9,
          max_tokens: 500,
          // Low effort keeps a texting-style reply a quick round trip; the model
          // is not being asked to reason its way through anything.
          reasoning_effort: "low",
        }),
      });
    } catch (error) {
      fail({
        code: "unavailable",
        message:
          "Groq couldn't be reached just now. " +
          (error instanceof Error ? error.message : ""),
      });
    }

    if (!response.ok) await readFailure(response);

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = payload.choices?.[0]?.message?.content ?? "";
    if (!reply.trim()) {
      fail({
        code: "unavailable",
        message: "Groq sent back an empty reply.",
      });
    }
    return reply.trim();
  },
});

/**
 * One of her lines rendered as audio, ready to be stored on the message.
 *
 * Voice is a nice-to-have: if Groq's audio endpoint refuses — an unavailable
 * voice, no entitlement, a bad minute — this reports no audio rather than
 * failing, and the client reads the line with the browser's own voice instead.
 * A message that is spoken plainly is a much smaller problem than one that
 * cannot be read at all.
 */
export const speak = internalAction({
  args: { text: v.string() },
  handler: async (
    ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
    { text }: { text: string },
  ): Promise<Id<"_storage"> | null> => {
    const key = groqApiKey();
    if (!key || !text.trim()) return null;

    try {
      const response = await fetch(SPEECH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: SPEECH_MODEL,
          voice: SPEECH_VOICE,
          // Orpheus renders short bursts; her lines are one or two sentences and
          // anything longer is trimmed rather than rejected outright.
          input: text.slice(0, 400),
          response_format: "wav",
        }),
      });

      if (!response.ok) return null;

      const audio = new Uint8Array(await response.arrayBuffer());
      if (audio.byteLength === 0) return null;

      return await ctx.storage.store(new Blob([audio], { type: "audio/wav" }));
    } catch {
      return null;
    }
  },
});
