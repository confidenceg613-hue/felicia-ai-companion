"use node";

import { v } from "convex/values";
import { vly } from "../lib/vly-integrations";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  groqApiKey,
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

const CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const SPEECH_URL = "https://api.groq.com/openai/v1/audio/speech";
const VENICE_URL = "https://api.venice.ai/api/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** The model behind her everyday words. */
const CHAT_MODEL = "openai/gpt-oss-120b";
/**
 * Her second Groq model, used first on intimate turns.
 *
 * gpt-oss is safety-tuned and will refuse explicit adult play; the Qwen instruct
 * model on the same account is far more willing to stay in a consenting adult
 * character. It is a preview model, so a 400/404 here is expected to happen
 * eventually — the route simply falls through to the next one.
 */
const GROQ_ROLEPLAY_MODEL = "qwen/qwen3.8-27b";
/** The model behind her intimate words. */
const VENICE_MODEL = "venice-uncensored-role-play";
const OPENROUTER_MODEL = "sao10k/l3.1-euryale-70b";

/** The voice she speaks with. */
const SPEECH_MODEL = "canopylabs/orpheus-v1-english";
const SPEECH_VOICE = "autumn";

/** A message as the chat endpoint wants it. */
const messageValidator = v.object({
  role: v.string(),
  content: v.string(),
});

type ChatMessage = { role: string; content: string };

const MISSING_KEY =
  "Groq isn't connected on this deployment. Add GROQ_API_KEY in this " +
  "project's Keys settings and she'll start answering.";

/**
 * What to say when every model refused.
 *
 * Naming the missing key is the only useful outcome: pretending she is out of
 * words would leave the same thing happening on the next message.
 */
const ALL_REFUSED =
  "Every model refused that one. Add VENICE_API_KEY (or OPENROUTER_API_KEY) " +
  "in this project's Keys settings — that is the key that lets her be herself " +
  "when the conversation gets explicit.";

/** Turn an HTTP failure into something worth showing a person. */
async function failure(response: Response, what: string): Promise<Error> {
  let detail = "";
  try {
    detail = (await response.text()).slice(0, 400);
  } catch {
    // The body is only ever used to make the message more useful.
  }
  return new Error(
    `Groq rejected the ${what} request (${response.status} ${
      response.statusText
    }).${detail ? ` ${detail}` : ""}`,
  );
}

/**
 * One completion from Groq.
 *
 * Throws on anything that is not a usable reply, so the caller can move on to
 * the next provider instead of writing an empty message.
 */
async function groqChat(
  messages: ChatMessage[],
  temperature?: number,
  model: string = CHAT_MODEL,
): Promise<string> {
  const key = groqApiKey();
  if (!key) throw new Error(MISSING_KEY);

  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.9,
      max_tokens: 500,
      // Low effort keeps a texting-style reply a quick round trip; the model
      // is not being asked to reason its way through anything. Only the
      // gpt-oss family accepts the parameter.
      ...(model === CHAT_MODEL ? { reasoning_effort: "low" } : {}),
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

/** An OpenAI-shaped completion against a roleplay provider. */
async function roleplayChat(
  url: string,
  key: string,
  model: string,
  messages: ChatMessage[],
  temperature?: number,
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

  if (!response.ok) throw await failure(response, "roleplay");

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
 * The provider order depends on what is being said. Intimate turns go to the
 * uncensored model first; everything else goes to Groq first. Every route is
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

    const roleplayRoutes: Array<() => Promise<string>> = [];
    if (veniceKey) {
      roleplayRoutes.push(() =>
        roleplayChat(VENICE_URL, veniceKey, VENICE_MODEL, prompt, temperature),
      );
    }
    if (openRouterKey) {
      roleplayRoutes.push(() =>
        roleplayChat(
          OPENROUTER_URL,
          openRouterKey,
          OPENROUTER_MODEL,
          prompt,
          temperature,
        ),
      );
    }

    // On an intimate turn the Qwen model gets the first word: it is already on
    // the same Groq account, and it stays in character where gpt-oss balks.
    const groqRoutes: Array<() => Promise<string>> = adult
      ? [
          () => groqChat(prompt, temperature, GROQ_ROLEPLAY_MODEL),
          () => groqChat(prompt, temperature),
        ]
      : [
          () => groqChat(prompt, temperature),
          () => groqChat(prompt, temperature, GROQ_ROLEPLAY_MODEL),
        ];

    const routes: Array<() => Promise<string | null>> = [
      ...groqRoutes,
      ...roleplayRoutes,
    ];

    // The integration gateway is the last resort, as it always was when Groq's
    // daily ceiling had been hit.
    routes.push(() => fallbackReply(prompt, temperature));

    let refused = false;
    let lastError: unknown = null;

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
      }
    }

    // A refusal is not an answer, and it must never be stored as one of hers.
    if (refused) throw new Error(ALL_REFUSED);
    if (lastError instanceof Error) throw lastError;
    throw new Error(MISSING_KEY);
  },
});

/**
 * The backstop model, used when Groq refuses or is unreachable.
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
