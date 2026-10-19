"use node";

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { aiDashScopeApiKey, veniceApiKey } from "./config";

/** Whether a retry is worth another attempt rather than a cause worth reporting. */
export function isRetryablePhotoFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /time|stall|empty|unreadable|not finish|terminated|429/i.test(message);
}

/**
 * Taking a new photo of Felicia.
 *
 * Her photographers, in order of preference:
 *
 *   1. Alibaba Qwen Image 3 (DASHSCOPE_API_KEY) — free for the first 10 images
 *      per new user (Free Quota Only), no card needed in some regions. This is
 *      her default: it fits her look, it is free, and it is hers.
 *   2. Venice, when VENICE_API_KEY is set. It has to pay for every shot, but
 *      it is her second photographer and she already has a key on this
 *      deployment.
 *
 * Every backend that fails is skipped, and the errors are collected so a real
 * outage reads as one useful sentence instead of a silent no.
 */

/** The same 2:3 frame, in the form the Qwen family wants to be told. */
const QV_ASPECT_RATIO = "2:3";

/**
 * Her photographers, in order of preference.
 *
 * qwen-image-3-pro is asked for first: it holds a description together — body,
 * hair, outfit and room all come back the way the prompt asked. lustify-v8 and
 * venice-sd35 sit behind it in case the first is ever retired or rate-limited.
 *
 * The two families frame themselves differently, which is not optional: Qwen
 * Image wants an aspect ratio and answers png, and the SDXL family takes
 * pixels, steps and a style preset. Sending one family the other's sizing is
 * the mistake that 400s a request that had nothing else wrong with it.
 */
const VENICE_IMAGE_MODELS: Array<{
  id: string;
  aspectRatio: boolean;
}> = [
  { id: "qwen-image-3-pro", aspectRatio: true },
  { id: "lustify-v8", aspectRatio: false },
  { id: "venice-sd35", aspectRatio: false },
];

/** What is kept out of her photos. */
const VENICE_NEGATIVE =
  "close-up, headshot, cropped, cut off, portrait crop, bust shot, " +
  "out of frame, cropped legs, cropped feet, deformed, extra limbs, " +
  "digital art, illustration, painting, cgi, 3d render, plastic airbrushed " +
  "skin, doll, glamour retouch, oversaturated";

/** The only part of an action context this file needs. */
type StorageCtx = {
  storage: { store: (blob: Blob) => Promise<Id<"_storage">> };
};

export const generate = internalAction({
  args: { prompt: v.string() },
  handler: async (ctx: StorageCtx, { prompt }: { prompt: string }): Promise<{
    storageId: Id<"_storage">;
  }> => {
    const trimmed = prompt.trim();
    if (!trimmed) throw new Error("A photo needs a scene to describe.");

    const key = aiDashScopeApiKey();
    if (key) {
      try {
        return { storageId: await viaQwen(key, trimmed, ctx) };
      } catch (error) {
        // A transient rejection becomes a retry hint; a key problem is kept.
        if (!isRetryablePhotoFailure(error)) throw error;
      }
    }

    const venice = veniceApiKey();
    if (venice) {
      try {
        return { storageId: await viaVenice(venice, trimmed, ctx) };
      } catch (error) {
        if (!isRetryablePhotoFailure(error)) throw error;
      }
    }

    throw new Error(
      "Her photos are taken by Alibaba's Qwen Image (free for the first 10) " +
        "or Venice. Neither is set up on this deployment — add the key in the " +
        "Keys tab, or top up Venice, and she starts shooting again.",
    );
  },
});

/**
 * One round trip to Alibaba Qwen Image, stored as a Convex file.
 *
 * `safe_mode` and `hide_watermark` are accepted here even though Qwen ignores
 * them, so the request body is identical except for the model-specific
 * sizing. The 1K resolution tier keeps the first 10 images cheap; 2K is
 * available later if the free quota runs out.
 */
async function viaQwen(
  key: string,
  prompt: string,
  ctx: StorageCtx,
): Promise<Id<"_storage">> {
  const failures: string[] = [];

  for (const model of VENICE_IMAGE_MODELS) {
    const response = await fetch(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model.id,
          prompt,
          // Qwen's family rejects width/height with a 400 and wants an aspect
          // ratio plus its own resolution tier; it answers with a png.
          aspect_ratio: model.aspectRatio ? QV_ASPECT_RATIO : undefined,
          resolution: model.aspectRatio ? "1K" : undefined,
          response_format: "png",
          output_format: "png",
          negative_prompt: VENICE_NEGATIVE,
          // Qwen accepts `safe_mode` and `hide_watermark` as harmless hints,
          // so keep the same personal-photo flags as her Venice shoots.
          safe_mode: false,
          hide_watermark: true,
        }),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      failures.push(`${model.id} (${response.status}) ${detail}`);

      // An empty balance or a rejected key is the same for every model, so it
      // is reported straight away rather than retried against a dead account.
      if (response.status === 401 || response.status === 402) {
        throw new Error(
          response.status === 402
            ? "Alibaba's free Qwen Image trial is out of quota — add a key to " +
              "any Qwen Image plan in the Keys tab, and she takes photos again."
            : `Alibaba rejected the API key — re-add it in this project's Keys ` +
              `settings. ${detail}`,
        );
      }
      continue;
    }

    const payload = (await response.json()) as {
      output?: { kind: string; images?: Array<{ base64?: string }> };
      error?: { message: string };
    };

    if (payload.output?.kind === "success" && payload.output.images?.[0]?.base64) {
      const base64 = payload.output.images[0].base64;
      if (base64) {
        return await storeBase64(stripDataUrl(base64), ctx, "image/png");
      }
    }

    if (payload.error?.message) {
      failures.push(`${model.id}: ${payload.error.message}`);
    } else {
      failures.push(
        `${model.id}: finished with no image (${JSON.stringify(payload).slice(0, 200)})`,
      );
    }
  }

  throw new Error(
    `Alibaba couldn't take that photo. ${failures.join(" · ")} — add a key to any Qwen Image plan in the project's Keys settings`,
  );
}

/** One round trip to Venice, stored as a Convex file (second photographer). */
async function viaVenice(
  key: string,
  prompt: string,
  ctx: StorageCtx,
): Promise<Id<"_storage">> {
  const failures: string[] = [];

  for (const model of VENICE_IMAGE_MODELS) {
    const response = await fetch(VENICE_IMAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.id,
        prompt,
        negative_prompt: VENICE_NEGATIVE,
        safe_mode: false,
        hide_watermark: true,
        // Qwen asks for a ratio and its own resolution tier, and answers png;
        // the SDXL-family models take pixels, steps and a style preset.
        ...(model.aspectRatio
          ? {
              aspect_ratio: QV_ASPECT_RATIO,
              resolution: "1K",
              format: "png",
            }
          : {
              width: VENICE_WIDTH,
              height: VENICE_HEIGHT,
              steps: 30,
              cfg_scale: 7,
              // Hyperrealism, not "Photographic": the preset steers the model
              // away from the retouched-glamour look that reads as generated.
              style_preset: "Hyperrealism",
              format: "webp",
            }),
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      failures.push(`${model.id} (${response.status}) ${detail}`);

      // An empty wallet or a rejected key is the same for every model, so it
      // is reported straight away rather than retried against a dead account.
      if (response.status === 401 || response.status === 402) {
        throw new Error(
          response.status === 402
            ? "Venice has no balance on this account — add a little credit at " +
              "venice.ai/settings/api and she takes photos again."
            : `Venice rejected the API key — re-add it in this project's Keys ` +
              `settings. ${detail}`,
        );
      }
      continue;
    }

    const payload = (await response.json()) as { images?: string[] };
    const base64 = payload.images?.[0];
    if (!base64) {
      failures.push(`${model.id}: finished with no image`);
      continue;
    }
    return await storeBase64(stripDataUrl(base64), ctx, model.aspectRatio ? "image/png" : "image/webp");
  }

  throw new Error(
    `Venice couldn't take that photo. ${failures.join(" · ")} — add a key in the project's Keys settings`,
  );
}
