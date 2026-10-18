"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

export const captionImage = action({
  args: {
    url: v.string(),
  },
  handler: async (_ctx, { url }) => {
    const result = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/images/v1/generate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
        body: JSON.stringify({
          prompt: `Write a very concise, factual, caption of this image in one sentence. Name only what is visibly present — person, setting, clothing, colours, object, activity, lighting — nothing speculative, nothing you cannot see.`,
          image: url,
        }),
      }
    );

    if (!result.ok) {
      return { ok: false as const, error: `status ${result.status}` };
    }

    const json = (await result.json()) as { result?: { description?: string } };
    const text =
      json.result?.description?.trim() ||
      "A photo of Felicia";

    return { ok: true as const, caption: text };
  },
});
