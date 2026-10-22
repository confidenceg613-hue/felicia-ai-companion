"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { cloudflareAccountId, cloudflareToken } from "./config";

/**
 * Her eyes, on Cloudflare Workers AI.
 *
 * Everything Felicia is shown — the pictures in her own gallery, the ones she
 * sends, and the ones the user shares — goes through a vision model before she
 * talks about it, so she reacts to what is actually in the frame instead of to
 * the fact that a picture arrived.
 *
 * Workers AI takes the image as raw bytes rather than a URL, so the picture is
 * downloaded here first and posted inline. The key is the same Cloudflare
 * account the rest of this project already has, and it needs no per-image
 * billing beyond the account's Workers AI allowance.
 */

/**
 * The vision models to try, best first.
 *
 * `llama-3.2-11b-vision-instruct` writes full, specific descriptions; LLaVA
 * answers with a short caption, which is still enough for her to react to and
 * is there in case Meta's model is ever retired.
 */
const VISION_MODELS = [
  "@cf/meta/llama-3.2-11b-vision-instruct",
  "@cf/llava-hf/llava-1.5-7b-hf",
];

/** Workers AI rejects a single upload that is too large; keep one image sane. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const VISION_PROMPT =
  "Describe this photograph precisely and plainly, in 2 to 4 sentences. " +
  "Say what kind of image it is (photo, screenshot, drawing), the setting, " +
  "who or what is in it, what they are wearing and doing, the pose, the " +
  "colours, the lighting, and the mood. If there is text in the image, quote " +
  "the important parts. Do not invent people or events that are not visible " +
  "and do not speculate about who anyone is. No preamble, just the description.";

export type VisionResult = {
  /** Her plain-language description, or null when nothing could be read. */
  text: string | null;
  /** Which provider and model answered, when one did. */
  model: string | null;
  /** The last failure, when none did. */
  error: string | null;
};

/** The two shapes Workers AI returns text in, depending on the model. */
type CloudflareResult = {
  result?: { response?: string; description?: string };
  success?: boolean;
  errors?: Array<{ message?: string }>;
};

/**
 * One description, with the model ladder and no exceptions.
 *
 * A missing key or an unreachable model is reported in the result rather than
 * thrown: chat has to keep working even when her eyes do not, so every caller
 * treats a null `text` as "she could not see it" and carries on.
 */
export async function describeImage(
  url: string,
  hint?: string,
): Promise<VisionResult> {
  const token = cloudflareToken();
  const account = cloudflareAccountId();
  if (!token || !account) {
    return {
      text: null,
      model: null,
      error:
        "No Cloudflare key on this deployment — add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the Keys tab.",
    };
  }

  let bytes: number[];
  try {
    const image = await fetch(url);
    if (!image.ok) {
      return {
        text: null,
        model: null,
        error: `Couldn't download the picture (${image.status}).`,
      };
    }
    const buffer = await image.arrayBuffer();
    if (buffer.byteLength === 0) {
      return { text: null, model: null, error: "The picture was empty." };
    }
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return {
        text: null,
        model: null,
        error: "The picture is too large for the vision model.",
      };
    }
    bytes = Array.from(new Uint8Array(buffer));
  } catch (error) {
    return {
      text: null,
      model: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const prompt = hint ? `${VISION_PROMPT}\n\nContext: ${hint}` : VISION_PROMPT;
  const failures: string[] = [];

  for (const model of VISION_MODELS) {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt,
            image: bytes,
            max_tokens: 320,
          }),
        },
      );

      const raw = await response.text();

      if (!response.ok) {
        failures.push(`${model} (${response.status}) ${raw.slice(0, 200)}`);
        // A rejected key is the same for every model.
        if (response.status === 401 || response.status === 403) break;
        continue;
      }

      let payload: CloudflareResult;
      try {
        payload = JSON.parse(raw) as CloudflareResult;
      } catch {
        failures.push(`${model}: unreadable response`);
        continue;
      }

      const text = (
        payload.result?.response ??
        payload.result?.description ??
        ""
      ).trim();
      if (text) return { text, model, error: null };

      failures.push(
        `${model}: ${payload.errors?.[0]?.message ?? "empty description"}`,
      );
    } catch (error) {
      failures.push(
        `${model}: ${error instanceof Error ? error.message : String(error)}`,
      );
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
 * Runs a few at a time rather than all at once: Workers AI rate-limits per
 * account, and a batch that trips the limiter halfway through is less useful
 * than one that finishes slowly.
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
