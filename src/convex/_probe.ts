import { action } from "./_generated/server";
import { v } from "convex/values";
import { veniceApiKey } from "./config";

/**
 * Temporary probe: can this account take a FLUX 3 photo, both from words and
 * from her portrait? Reports status and the shape of each answer, not the
 * image, so the real call in images.ts can be written from facts.
 */
export const flux3 = action({
  args: { prompt: v.string(), referenceUrl: v.optional(v.string()) },
  handler: async (_ctx, { prompt, referenceUrl }) => {
    const key = veniceApiKey();
    if (!key) return { error: "venice not configured" };

    const summary = async (label: string, response: Response) => {
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok) {
        return {
          label,
          status: response.status,
          error: (await response.text()).slice(0, 400),
        };
      }
      if (!type.includes("json")) {
        const bytes = await response.arrayBuffer();
        return { label, status: response.status, type, bytes: bytes.byteLength };
      }
      const body = (await response.json()) as {
        images?: string[];
        image?: string;
      };
      const first = body.images?.[0] ?? body.image ?? null;
      return {
        label,
        status: response.status,
        type,
        keys: Object.keys(body),
        imageLength: first?.length ?? 0,
        imagePrefix: first?.slice(0, 20) ?? null,
      };
    };

    const headers = {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    };

    // 1. Text to image, FLUX 3.
    const generate = await fetch("https://api.venice.ai/api/v1/image/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "flux-3-image",
        prompt,
        negative_prompt: "illustration, cgi, plastic skin",
        aspect_ratio: "2:3",
        resolution: "1K",
        format: "png",
        safe_mode: false,
        hide_watermark: true,
      }),
    });

    // 2. Image to image from her portrait, FLUX 3.
    let edit: unknown = { skipped: "no reference url" };
    if (referenceUrl) {
      const response = await fetch("https://api.venice.ai/api/v1/image/edit", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "flux-3-image-edit",
          prompt,
          image: referenceUrl,
          aspect_ratio: "2:3",
          resolution: "1K",
          output_format: "png",
          safe_mode: false,
        }),
      });
      edit = await summary("edit flux-3-image-edit", response);
    }

    return {
      generate: await summary("generate flux-3-image", generate),
      edit,
    };
  },
});
