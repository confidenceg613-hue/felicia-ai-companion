import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { cloudflareAccountId, cloudflareToken } from "./config";

/** Temporary: what Workers AI says to each image model, verbatim. */
export const models = internalAction({
  args: { prompt: v.optional(v.string()) },
  handler: async (_ctx, { prompt }) => {
    const token = cloudflareToken();
    const account = cloudflareAccountId();
    if (!token || !account) return { configured: false };
    const out: Record<string, string> = {};
    for (const model of [
      "@cf/black-forest-labs/flux-1-schnell",
      "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    ]) {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: prompt ?? "a lighthouse at dusk",
            steps: 6,
          }),
        },
      );
      const type = response.headers.get("content-type") ?? "";
      const body = await response.text();
      let note: string;
      if (type.includes("json")) {
        const parsed = JSON.parse(body) as {
          result?: { image?: string };
          success?: boolean;
          errors?: unknown;
        };
        note = `image:${Boolean(parsed.result?.image)} success:${parsed.success} errors:${JSON.stringify(parsed.errors)?.slice(0, 180)}`;
      } else {
        note = `bytes:${body.length}`;
      }
      out[model] = `${response.status} ${type} ${note}`;
    }
    return { configured: true, out };
  },
});

/** Temporary: type and size of a stored file, for checking photo generation. */
export const file = internalAction({
  args: { id: v.id("_storage") },
  handler: async (ctx, { id }) => {
    const url = await ctx.storage.getUrl(id);
    if (!url) return { ok: false, reason: "no url" };
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    return {
      ok: response.ok,
      type: response.headers.get("content-type"),
      bytes: bytes.byteLength,
    };
  },
});
