"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { aiDashScopeApiKey, veniceApiKey } from "./config";

/**
 * Her eyes.
 *
 * Everything Felicia is shown — the pictures in her own gallery, the ones she
 * sends, and the ones the user shares — goes through Qwen's vision model before
 * she talks about it, so she reacts to what is actually in the frame instead of
 * to the fact that a picture arrived.
 *
 * Qwen-VL is reached on whichever account this deployment already has. Venice
 * hosts `qwen3-vl-235b-a22b`, which is the same model the chat backend is
 * already billed against, and Alibaba's own DashScope endpoint is used first
 * whenever `DASHSCOPE_API_KEY` is present. Both speak the OpenAI chat format, so
 * the request body is identical and only the base URL, key and model id differ.
 */
type VisionProvider = {
  name: string;
  url: string;
  key: string;
  models: string[];
};

const VISION_PROMPT =
  "Describe this photograph precisely and plainly, in 2 to 4 sentences. " +
  "Say what kind of image it is (photo, screenshot, drawing), the setting, " +
  "who or what is in it, what they are wearing and doing, the pose, the " +
  "colours, the lighting, and the mood. If there is text in the image, quote " +
  "the important parts. Do not invent people or events that are not visible " +
  "and do not speculate about who anyone is. No preamble, just the description.";

/** Every vision backend this deployment can actually reach, best first. */
function providers(): VisionProvider[] {
  const list: VisionProvider[] = [];

  // The deployment's own AI gateway, which needs no extra account and already
  // serves Qwen3-VL (`qwen/qwen3-vl-235b-a22b-instruct`). This is the default
  // pair of eyes; the direct Qwen accounts below are only used if it is absent.
  const gateway = process.env.VLY_INTEGRATION_KEY;
  if (gateway) {
    list.push({
      name: "gateway",
      url: "https://integrations.vly.ai/v1/llm/chat/completions",
      key: gateway,
      models: ["alibaba/qwen3-vl-instruct"],
    });
  }

  const dashscope = aiDashScopeApiKey();
  if (dashscope) {
    list.push({
      name: "dashscope",
      url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
      key: dashscope,
      models: [
        "qwen3-vl-plus",
        "qwen-vl-max-latest",
        "qwen-vl-plus",
        "qwen2.5-vl-72b-instruct",
      ],
    });
  }

  const venice = veniceApiKey();
  if (venice) {
    list.push({
      name: "venice",
      url: "https://api.venice.ai/api/v1/chat/completions",
      key: venice,
      // Qwen3-VL on Venice. The smaller Qwen vision model behind the encrypted
      // endpoint is the fallback if the big one is ever pulled from the catalog.
      models: ["qwen3-vl-235b-a22b", "e2ee-qwen3-vl-30b-a3b-p"],
    });
  }

  return list;
}

export type VisionResult = {
  /** Her plain-language description, or null when nothing could be read. */
  text: string | null;
  /** Which provider and model answered, when one did. */
  model: string | null;
  /** The last failure, when none did. */
  error: string | null;
};

type ChatContent =
  | string
  | Array<{ type?: string; text?: string }>
  | null
  | undefined;

/** Read the assistant's text whether it came back as a string or as parts. */
function messageText(content: ChatContent): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join(" ")
    .trim();
}

/**
 * One description, with the provider/model ladder and no exceptions.
 *
 * A missing key or an unreachable model is reported in the result rather than
 * thrown: chat has to keep working even when her eyes do not, so every caller
 * treats a null `text` as "she could not see it" and carries on.
 */
export async function describeImage(
  url: string,
  hint?: string,
): Promise<VisionResult> {
  const backends = providers();
  if (backends.length === 0) {
    return {
      text: null,
      model: null,
      error:
        "No vision key on this deployment — add DASHSCOPE_API_KEY or VENICE_API_KEY.",
    };
  }

  const prompt = hint ? `${VISION_PROMPT}\n\nContext: ${hint}` : VISION_PROMPT;
  const failures: string[] = [];

  for (const backend of backends) {
    for (const model of backend.models) {
      try {
        const response = await fetch(backend.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${backend.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url } },
                ],
              },
            ],
            max_tokens: 320,
            temperature: 0.2,
          }),
        });

        if (!response.ok) {
          const detail = (await response.text()).slice(0, 240);
          failures.push(`${model} (${response.status}) ${detail}`);
          // A rejected key is the same for every model on that backend, and a
          // missing / unreadable image is the same for every backend.
          if (response.status === 401 || response.status === 403) break;
          continue;
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: ChatContent } }>;
        };
        const text = messageText(payload.choices?.[0]?.message?.content);
        if (text) return { text, model, error: null };

        failures.push(`${model}: empty description`);
      } catch (error) {
        failures.push(
          `${model}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return {
    text: null,
    model: null,
    error: failures.join(" · ") || "No vision model answered.",
  };
}

/** Her description of one photo, for the chat and photo pipelines. */
export const describe = internalAction({
  args: {
    url: v.string(),
    /** Optional line about where the picture came from, to steer the read. */
    hint: v.optional(v.string()),
  },
  handler: async (
    _ctx: unknown,
    { url, hint }: { url: string; hint?: string },
  ): Promise<VisionResult> => {
    return await describeImage(url, hint);
  },
});

/**
 * A batch read, used when her gallery is checked against the vision model.
 *
 * Runs a few at a time rather than all at once: both backends rate-limit per
 * key, and a batch that trips the limiter halfway through is less useful than
 * one that finishes slowly.
 */
export const describeMany = internalAction({
  args: { urls: v.array(v.string()), hint: v.optional(v.string()) },
  handler: async (
    _ctx: unknown,
    { urls, hint }: { urls: string[]; hint?: string },
  ): Promise<Array<{ url: string } & VisionResult>> => {
    const results: Array<{ url: string } & VisionResult> = [];
    const CONCURRENCY = 3;

    for (let start = 0; start < urls.length; start += CONCURRENCY) {
      const slice = urls.slice(start, start + CONCURRENCY);
      const described = await Promise.all(
        slice.map(async (url: string) => ({
          url,
          ...(await describeImage(url, hint)),
        })),
      );
      results.push(...described);
    }

    return results;
  },
});
