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
