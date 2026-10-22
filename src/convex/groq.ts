"use node";

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { groqApiKey } from "./config";
import { ADULT_ADDENDUM, isRefusal } from "./mature";

/**
 * Felicia's words and her voice, on Groq.
 *
 * Chat and text-to-speech both run against `api.groq.com` with the one Groq
 * key, so her replies, the memories she writes out of the conversation, the
 * journal chapters and her spoken lines all come from the same provider. Her
 * photos and her eyes stay on Venice, which is the only place that has image
 * and vision models.
 *
 * Groq is OpenAI-shaped, so the request bodies are the ones any OpenAI client
 * would send.
 */

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_SPEECH_URL = "https://api.groq.com/openai/v1/audio/speech";

/**
 * The models behind her everyday and intimate words, best first.
 *
 * `gpt-oss-120b` is the strongest model on the key; the Qwen build and
 * `gpt-oss-20b` sit behind it in case the first is rate-limited. Groq retires
 * model ids regularly, so this list is tried in order and a `model_not_found`
 * simply moves on to the next one.
 */
const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
];

/**
 * Her spoken voice: Groq's Orpheus TTS.
 *
 * `hannah` is the warm female voice she uses, with `diana` and `autumn` behind
 * it. The endpoint answers with audio bytes (WAV).
 */
const GROQ_SPEECH_MODEL = "canopylabs/orpheus-v1-english";
const GROQ_VOICES = ["hannah", "diana", "autumn"];

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
  "Every Groq model refused that one. Nothing was saved — say it a different " +
  "way, or check the key in this project's Keys settings.";

/** Turn an HTTP failure into something worth showing a person. */
async function failure(response: Response, what: string): Promise<Error> {
  let detail = "";
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    // The body is only ever used to make the message more useful.
  }

  if (response.status === 401 || response.status === 403) {
    return new Error(
      `Groq rejected the API key — re-add it in this project's Keys ` +
        `settings.${detail ? ` ${detail}` : ""}`,
    );
  }
  if (response.status === 429) {
    return new Error(
      "Groq is rate-limiting this key — give it a minute and try again.",
    );
  }
  if (response.status === 404) {
    return new Error(
      `Groq doesn't offer that model on this key.${detail ? ` ${detail}` : ""}`,
    );
  }

  return new Error(
    `Groq rejected the ${what} request (${response.status} ${
      response.statusText
    }).${detail ? ` ${detail}` : ""}`,
  );
}

/** An OpenAI-shaped completion against Groq. */
async function groqChat(
  key: string,
  model: string,
  messages: ChatMessage[],
  temperature?: number,
): Promise<string> {
  const response = await fetch(GROQ_CHAT_URL, {
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
  if (!reply.trim()) throw new Error("Groq sent back an empty reply.");
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

    const key = groqApiKey();
    if (!key) {
      throw new Error(
        "Groq isn't connected on this deployment. Add GROQ_API_KEY in this " +
          "project's Keys settings and she'll start answering.",
      );
    }

    let refused = false;
    let lastError: unknown = null;

    for (const model of GROQ_MODELS) {
      try {
        const reply = await groqChat(key, model, prompt, temperature);
        if (isRefusal(reply)) {
          refused = true;
          continue;
        }
        return reply;
      } catch (error) {
        lastError = error;
        // A rejected key is the same for every model, so stop retrying.
        if (error instanceof Error && /rejected the API key/i.test(error.message)) {
          throw error;
        }
      }
    }

    if (refused) throw new Error(ALL_REFUSED);
    if (lastError instanceof Error) throw lastError;
    throw new Error("Groq didn't answer. Try that again in a moment.");
  },
});

/**
 * One of her lines rendered by Groq's Orpheus TTS.
 *
 * Tries the warm female voice first, then two more. The endpoint answers with
 * audio bytes (WAV) and stores them as a Convex file. Returns null rather than
 * throwing: a silent line is better than a message that cannot be read at all.
 */
async function groqSpeak(
  key: string,
  text: string,
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
): Promise<Id<"_storage"> | null> {
  const safeText = text.slice(0, 600);
  if (!safeText.trim()) return null;

  for (const voice of GROQ_VOICES) {
    let response: Response;
    try {
      response = await fetch(GROQ_SPEECH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_SPEECH_MODEL,
          input: safeText,
          voice,
          response_format: "wav",
        }),
      });
    } catch {
      return null;
    }

    if (!response.ok) {
      // A rejected key will not change on the next voice.
      if (response.status === 401 || response.status === 403) return null;
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    let bytes: Uint8Array;
    let mimeType = "audio/wav";

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
      if (contentType.includes("mpeg")) mimeType = "audio/mpeg";
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
 * Groq is the only voice backend. Returns null when it can't render — no key
 * or a rejected request — and the client reads the line with the device voice
 * instead of sitting in silence.
 */
/**
 * The one line she sends a beat after her reply.
 *
 * A double text is not the same thought continued — it is what she thought of
 * after she pressed send, which is why it is written separately instead of
 * split out of the first reply. Returns null when there is genuinely nothing
 * to add, so a second message only ever appears when it sounds like a person.
 */
export const followUp = internalAction({
  args: { reply: v.string(), context: v.string() },
  handler: async (
    _ctx: unknown,
    { reply, context }: { reply: string; context: string },
  ): Promise<string | null> => {
    const key = groqApiKey();
    if (!key) return null;

    try {
      const raw = await groqChat(
        key,
        GROQ_MODELS[0],
        [
          {
            role: "system",
            content:
              "You are Felicia, a 28-year-old woman texting a man she is seeing. " +
              "You have already sent the message below. Write the one short line " +
              "you would send right after it: an afterthought, a tease you could " +
              "not leave alone, a question you forgot, something you noticed " +
              "after pressing send. 3 to 15 words, casual and in the same voice, " +
              "no narration, no quotes, at most one emoji. Reply with that line " +
              "and nothing else. If nothing natural comes to mind, reply exactly NONE.",
          },
          {
            role: "user",
            content: `Your message: ${reply}\nTheir message: ${context}`,
          },
        ],
        1.0,
      );

      const line = raw
        .replace(/^["'“”]+|["'“”]+$/g, "")
        .replace(/\s+/g, " ")
        .replace(/\[\[[\s\S]*?\]\]/g, "")
        .trim();

      if (!line || /^(none|nothing)\b/i.test(line)) return null;
      return line.slice(0, 220);
    } catch {
      return null;
    }
  },
});

export const speak = internalAction({
  args: { text: v.string() },
  handler: async (
    ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
    { text }: { text: string },
  ): Promise<Id<"_storage"> | null> => {
    if (!text.trim()) return null;

    const key = groqApiKey();
    if (!key) return null;

    return await groqSpeak(key, text, ctx).catch(() => null);
  },
});
