"use node";

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { veniceApiKey } from "./config";
import { ADULT_ADDENDUM, isRefusal } from "./mature";

/**
 * Felicia's mind and her voice, both on Venice.
 *
 * This deployment talks to one provider and one key. Her replies, the memories
 * she writes out of the conversation, the journal chapters, her spoken lines
 * and her eyes all go to `api.venice.ai`, so a single key on the account is all
 * the app needs.
 *
 * Venice is OpenAI-shaped, so the request bodies are the ones any OpenAI client
 * would send; only the base URL, key and model ids are Venice's.
 */

const VENICE_BASE = "https://api.venice.ai/api/v1";
const VENICE_CHAT_URL = `${VENICE_BASE}/chat/completions`;
const VENICE_SPEECH_URL = `${VENICE_BASE}/audio/speech`;

/**
 * The models behind her everyday and intimate words, best first.
 *
 * The role-play build is first because it is tuned for exactly this; the
 * general uncensored build and a plain instruct model stand behind it in case
 * one is ever retired or rate-limited.
 */
const VENICE_MODELS = [
  "venice-uncensored-role-play",
  "venice-uncensored-1-2",
  "zai-org-glm-5-1",
];

/**
 * Her spoken voice: Venice's Kokoro text-to-speech.
 *
 * `af_sky` is the warm, breathy female voice she uses; the other two are
 * fallbacks if a model is retired. `tts-kokoro` answers with MP3 bytes.
 */
const VENICE_SPEECH_MODEL = "tts-kokoro";
const VENICE_VOICES = ["af_sky", "af_heart", "af_bella"];

/** A message as the chat endpoint wants it. */
const messageValidator = v.object({
  role: v.string(),
  content: v.string(),
});

type ChatMessage = { role: string; content: string };

/**
 * What to say when every model refused.
 *
 * Naming the actual cause is the only useful outcome: pretending she is out of
 * words would leave the same thing happening on the next message.
 */
const ALL_REFUSED =
  "Venice refused that one on every model. Nothing was saved — say it a " +
  "different way, or check that the key in this project's Keys settings is " +
  "the one on your venice.ai/settings/api page.";

/**
 * Turn an HTTP failure into something worth showing a person.
 *
 * A dead key and an empty wallet are the two failures that actually happen,
 * and neither is legible as "402" in a toast — so each gets said plainly.
 */
async function failure(
  response: Response,
  what: string,
): Promise<Error> {
  let detail = "";
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    // The body is only ever used to make the message more useful.
  }

  if (response.status === 402) {
    return new Error(
      "Venice has no balance on this account — add credit at " +
        "venice.ai/settings/api and she answers again. Everything in the app " +
        "(chat, memory, voice and photos) is billed to that one key.",
    );
  }
  if (response.status === 401 || response.status === 403) {
    return new Error(
      `Venice rejected the API key — re-add it in this project's Keys ` +
        `settings.${detail ? ` ${detail}` : ""}`,
    );
  }
  if (response.status === 429) {
    return new Error(
      "Venice is rate-limiting this key — give it a minute and try again.",
    );
  }

  return new Error(
    `Venice rejected the ${what} request (${response.status} ${
      response.statusText
    }).${detail ? ` ${detail}` : ""}`,
  );
}

/** An OpenAI-shaped completion against Venice. */
async function veniceChat(
  key: string,
  model: string,
  messages: ChatMessage[],
  temperature?: number,
): Promise<string> {
  const response = await fetch(VENICE_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.95,
      max_tokens: 500,
    }),
  });

  if (!response.ok) throw await failure(response, "chat");

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = payload.choices?.[0]?.message?.content ?? "";
  if (!reply.trim()) throw new Error("Venice sent back an empty reply.");
  return reply.trim();
}

/**
 * One of her replies.
 *
 * Every model is tried before giving up, a refusal from any of them is
 * discarded rather than returned, and `intimate` only adds the consent
 * addendum to the prompt.
 */
export const chat = internalAction({
  args: {
    messages: v.array(messageValidator),
    temperature: v.optional(v.number()),
    intimate: v.optional(v.boolean()),
  },
  handler: async (
    _ctx: unknown,
    {
      messages,
      temperature,
      intimate,
    }: {
      messages: ChatMessage[];
      temperature?: number;
      intimate?: boolean;
    },
  ): Promise<string> => {
    const adult = Boolean(intimate);
    const prompt: ChatMessage[] = adult
      ? [...messages, { role: "system", content: ADULT_ADDENDUM }]
      : messages;

    const key = veniceApiKey();
    if (!key) {
      throw new Error(
        "Venice isn't connected on this deployment. Add the key in this " +
          "project's Keys settings (venice.ai/settings/api) and she'll start " +
          "answering.",
      );
    }

    let refused = false;
    let lastError: unknown = null;
    let creditError: Error | null = null;

    for (const model of VENICE_MODELS) {
      try {
        const reply = await veniceChat(key, model, prompt, temperature);
        if (isRefusal(reply)) {
          refused = true;
          continue;
        }
        return reply;
      } catch (error) {
        lastError = error;
        if (error instanceof Error && /no balance/i.test(error.message)) {
          creditError = error;
        }
      }
    }

    if (creditError) throw creditError;
    if (refused) throw new Error(ALL_REFUSED);
    if (lastError instanceof Error) throw lastError;
    throw new Error("Venice didn't answer. Try that again in a moment.");
  },
});

/**
 * One of her lines rendered by Venice's text-to-speech.
 *
 * Tries the warm female voice first, then two more. The endpoint answers with
 * audio bytes (MP3) and stores them as a Convex file. Returns null rather than
 * throwing: a silent line is better than a message that cannot be read at all.
 */
async function veniceSpeak(
  key: string,
  text: string,
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
): Promise<Id<"_storage"> | null> {
  // TTS bills per character and the caller reads a chat line, so anything long
  // is trimmed rather than sent — a whole paragraph read aloud is the wrong
  // shape for a phone call anyway.
  const safeText = text.slice(0, 600);
  if (!safeText.trim()) return null;

  for (const voice of VENICE_VOICES) {
    let response: Response;
    try {
      response = await fetch(VENICE_SPEECH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: VENICE_SPEECH_MODEL,
          input: safeText,
          voice,
          response_format: "mp3",
        }),
      });
    } catch {
      return null;
    }

    if (!response.ok) {
      // An empty balance or a rejected key will not change on the next voice.
      if (
        response.status === 401 ||
        response.status === 402 ||
        response.status === 403
      ) {
        return null;
      }
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    let bytes: Uint8Array;
    let mimeType = "audio/mpeg";

    if (contentType.includes("json")) {
      const payload = (await response.json()) as
        | string
        | { audio?: string; audio_base64?: string; data?: string };
      const base64 =
        typeof payload === "string"
          ? payload
          : payload.audio ?? payload.audio_base64 ?? payload.data;
      if (!base64) continue;
      bytes = fromBase64(base64);
    } else {
      bytes = new Uint8Array(await response.arrayBuffer());
      if (contentType.includes("wav")) mimeType = "audio/wav";
    }

    if (bytes.byteLength === 0) continue;

    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return await ctx.storage.store(new Blob([buffer], { type: mimeType }));
  }

  return null;
}

/** base64 to bytes, without assuming Buffer is available. */
function fromBase64(base64: string): Uint8Array {
  const payload = base64.includes(",")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * One of her lines rendered as audio, ready to be stored on the message.
 *
 * Venice is the only voice backend. Returns null when it can't render — no key,
 * an empty balance, or a rejected request — and the client reads the line with
 * the device voice instead of sitting in silence.
 */
export const speak = internalAction({
  args: { text: v.string() },
  handler: async (
    ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
    { text }: { text: string },
  ): Promise<Id<"_storage"> | null> => {
    if (!text.trim()) return null;

    const key = veniceApiKey();
    if (!key) return null;

    return await veniceSpeak(key, text, ctx).catch(() => null);
  },
});
