"use node";

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { vly } from "../lib/vly-integrations";
import {
  openRouterApiKey,
  veniceApiKey,
} from "./config";
import { ADULT_ADDENDUM, isRefusal } from "./mature";

/**
 * Her words, as Felicia uses them.
 *
 * Two things go wrong with a single general model: it is fast and cheap but
 * safety-tuned, so it drops out of character the moment the conversation turns
 * sexual; and any refusal it produces used to be saved as one of her messages
 * and replayed in the next prompt, which taught it to keep refusing.
 *
 * So replies are routed. Ordinary chat stays on Groq. When the conversation is
 * intimate — or when Groq refuses anyway — she is generated on an uncensored
 * roleplay model (Venice, then OpenRouter) with an explicit consent addendum,
 * and a refusal is never returned as her line.
 *
 * Groq's API is OpenAI-shaped, so the request bodies are the ones any OpenAI
 * client would send.
 */

const VENICE_URL = "https://api.venice.ai/api/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** The models behind her everyday and intimate words.
 *
 * Both are Venice's own uncensored builds; the role-play one is first because
 * it is tuned for exactly this, and the general uncensored model is there in
 * case the role-play endpoint is retired.
 */
const VENICE_MODELS = ["venice-uncensored-role-play", "venice-uncensored-1-2"];
const OPENROUTER_MODEL = "sao10k/l3.1-euryale-70b";

/**
 * Her spoken voice on Groq's Orpheus TTS.
 *
 * This deployment now lets Felicia speak with Groq's TTS model instead of
 * Venice. Chat is still Venice only.
 *
 * Orpheus is the only TTS model Groq exposes here; `hannah` is the female
 * voice and is tried first, with `diana` and `autumn` as warm feminine
 * fallbacks.
 *
 * Note: Groq TTS returns WAV by default and the input is short; if a request
 * fails for balance or key reasons, this action returns null and the client
 * can fall back to the on-device voice.
 */
const GROQ_SPEECH_URL = "https://api.groq.com/openai/v1/audio/speech";
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
  "Every model she can reach refused that one. Add VENICE_API_KEY in this " +
  "project's Keys settings (venice.ai/settings/api) and top up its balance — " +
  "that is the key that lets her be herself when the conversation is explicit.";

/**
 * Turn an HTTP failure into something worth showing a person.
 *
 * A dead key and an empty wallet are the two failures that actually happen,
 * and neither is legible as "402" in a toast — so each gets said plainly.
 */
async function failure(
  response: Response,
  provider: string,
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
      `${provider} has no balance on this account — add a little credit` +
        `${provider === "Venice" ? " at venice.ai/settings/api" : ""}` +
        ` and she answers explicit turns again.`,
    );
  }
  if (response.status === 401 || response.status === 403) {
    return new Error(
      `${provider} rejected the API key — re-add it in this project's Keys ` +
        `settings.${detail ? ` ${detail}` : ""}`,
    );
  }

  return new Error(
    `${provider} rejected the ${what} request (${response.status} ${
      response.statusText
    }).${detail ? ` ${detail}` : ""}`,
  );
}


/** An OpenAI-shaped completion against a roleplay provider. */
async function roleplayChat(
  url: string,
  key: string,
  model: string,
  messages: ChatMessage[],
  temperature?: number,
  provider = "Roleplay model",
): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // OpenRouter uses these for attribution; harmless everywhere else.
      "HTTP-Referer": "https://felicia.app",
      "X-Title": "Felicia",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.95,
      max_tokens: 500,
    }),
  });

  if (!response.ok) throw await failure(response, provider, "roleplay");

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = payload.choices?.[0]?.message?.content ?? "";
  if (!reply.trim()) throw new Error("The roleplay model sent back nothing.");
  return reply.trim();
}

/**
 * One of her replies.
 *
 * This deployment only talks to Venice for Felicia's words. Every route is
 * tried before giving up, a refusal from any of them is discarded rather than
 * returned, and `intimate` only adds the consent addendum to the prompt.
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

    const veniceKey = veniceApiKey();
    const openRouterKey = openRouterApiKey();

    const routes: Array<() => Promise<string | null>> = [];

    if (veniceKey) {
      for (const model of VENICE_MODELS) {
        routes.push(() =>
          roleplayChat(
            VENICE_URL,
            veniceKey,
            model,
            prompt,
            temperature,
            "Venice",
          ),
        );
      }
    }

    if (openRouterKey) {
      routes.push(() =>
        roleplayChat(
          OPENROUTER_URL,
          openRouterKey,
          OPENROUTER_MODEL,
          prompt,
          temperature,
          "OpenRouter",
        ),
      );
    }

    // The integration gateway is the last resort.
    routes.push(() => fallbackReply(prompt, temperature));

    let refused = false;
    let lastError: unknown = null;
    let creditError: Error | null = null;

    for (const route of routes) {
      try {
        const reply = await route();
        if (!reply) continue;
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
    throw new Error(
      "Venice isn't connected on this deployment. Add VENICE_API_KEY in this " +
        "project's Keys settings (venice.ai/settings/api) and she'll start " +
        "answering.",
    );
  },
});

/**
 * The backstop model, used when no configured provider answered.
 *
 * Returns null rather than throwing, so the caller can decide whether the
 * original failure or a successful fallback is the more useful outcome.
 */
async function fallbackReply(
  messages: ChatMessage[],
  temperature?: number,
): Promise<string | null> {
  if (!process.env.VLY_INTEGRATION_KEY) return null;

  try {
    const result = await vly.ai.completion({
      model: "gpt-4o-mini",
      messages: messages.map((message) => ({
        role: toChatRole(message.role),
        content: message.content,
      })),
      temperature: temperature ?? 0.9,
      maxTokens: 400,
    });

    if (!result.success) return null;
    return result.data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/** The three roles the fallback's request type accepts. */
function toChatRole(role: string): "system" | "user" | "assistant" {
  if (role === "system") return "system";
  if (role === "assistant" || role === "felicia") return "assistant";
  return "user";
}



/**
 * One of her lines rendered by Groq Orpheus TTS.
 *
 * Tries the female voice first, then the two warm feminine fallbacks. The
 * endpoint answers with audio bytes and Groq returns WAV. Returns null rather
 * than throwing: a silent line is better than a message that cannot be read at
 * all.
 */
async function groqSpeak(
  key: string,
  text: string,
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
): Promise<Id<"_storage"> | null> {
  const safeText = text.slice(0, 200);
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
      // An empty balance or a rejected key will not change on the next voice.
      if (response.status === 401 || response.status === 402) return null;
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    let bytes: Uint8Array;

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
    }

    if (bytes.byteLength === 0) continue;

    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return await ctx.storage.store(new Blob([buffer], { type: "audio/wav" }));
  }

  return null;
}

/** base64 to bytes, without assuming Buffer is available. */
function fromBase64(base64: string): Uint8Array {
  const payload = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
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
 * This deployment uses Groq Orpheus for voice while chat stays on Venice.
 * It always tries Groq first and only returns audio when that succeeds; there
 * is no on-device or browser voice fallback inside this action — the client
 * picks a fallback only after this returns null.
 */
export const speak = internalAction({
  args: { text: v.string() },
  handler: async (
    ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
    { text }: { text: string },
  ): Promise<Id<"_storage"> | null> => {
    if (!text.trim()) return null;

    const groq = process.env.GROQ_API_KEY;
    if (groq) {
      const spoken = await groqSpeak(groq, text, ctx).catch(() => null);
      if (spoken) return spoken;
    }

    return null;
  },
});
