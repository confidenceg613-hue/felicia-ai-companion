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
 * `gpt-oss-120b` is the strongest model on the key; `gpt-oss-20b` sits behind
 * it for when the first is rate-limited. Groq retires model ids regularly, so
 * the list is tried in order and a missing one simply moves on.
 */
const GROQ_MODELS = [
  "openai/gpt-oss-120b",
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

/**
 * Why a request failed.
 *
 * `key` is the only kind worth giving up on: it fails identically for every
 * model. `model` (this project has that model switched off, or it was retired)
 * and `rate` (this model's per-minute budget is spent) both mean "ask the next
 * one" — treating them as key failures used to abort a reply that the next
 * model would have answered, and surfaced a misleading "key rejected" error.
 */
type FailureKind = "key" | "model" | "rate" | "other";
type GroqFailure = Error & { kind?: FailureKind };

function tagged(message: string, kind: FailureKind): GroqFailure {
  return Object.assign(new Error(message), { kind });
}

/** Turn an HTTP failure into something worth showing a person. */
async function failure(response: Response, what: string): Promise<Error> {
  let detail = "";
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    // The body is only ever used to make the message more useful.
  }

  // Groq answers a blocked model with 403 and a body naming the model. The key
  // is fine; only this deployment's model list is not.
  if (
    response.status === 403 &&
    /model/i.test(detail) &&
    /permission|blocked|restricted|not (?:enabled|allowed)/i.test(detail)
  ) {
    return tagged(
      `That model isn't enabled on this Groq project.${detail ? ` ${detail}` : ""}`,
      "model",
    );
  }
  if (response.status === 401 || response.status === 403) {
    return tagged(
      `Groq rejected the API key — re-add it in this project's Keys ` +
        `settings.${detail ? ` ${detail}` : ""}`,
      "key",
    );
  }
  if (response.status === 429) {
    return tagged(
      "Groq is rate-limiting this key — give it a minute and try again.",
      "rate",
    );
  }
  if (response.status === 404) {
    return tagged(
      `Groq doesn't offer that model on this key.${detail ? ` ${detail}` : ""}`,
      "model",
    );
  }

  return tagged(
    `Groq rejected the ${what} request (${response.status} ${
      response.statusText
    }).${detail ? ` ${detail}` : ""}`,
    "other",
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
      // The `gpt-oss` models think before they answer, and those thoughts are
      // billed against the same token budget. Low effort keeps the reasoning
      // short, so the budget goes to her actual words — a long think used to
      // spend all 500 tokens and come back with an empty reply.
      ...(model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
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
        // A rejected key is the same for every model, so stop retrying. Every
        // other failure — a model this project has blocked, a retired model, a
        // rate-limited model — is worth trying against the next one.
        if ((error as GroqFailure).kind === "key") throw error;
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
  // Emoji are punctuation for the eye, not the voice: a speech model that is
  // handed them either reads a character name or stalls on it. They come out
  // before the line is spoken, so her mood still shows in the chat and the
  // call stays a sentence.
  const safeText = text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, " ")
    // Variation selectors and joiners left behind by a stripped glyph.
    .replace(/\uFE0F|\u200D/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
  if (!safeText) return null;

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
              "no narration, no quotes, and one emoji if it carries how you feel. " +
              "Reply with that line " +
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
