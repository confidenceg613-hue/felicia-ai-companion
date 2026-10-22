"use node";

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { veniceApiKey } from "./config";

/**
 * Telling a retry from a cause worth reporting.
 */
export function isRetryablePhotoFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /time|stall|empty|unreadable|not finish|terminated|429/i.test(message);
}

const VENICE_IMAGE_URL = "https://api.venice.ai/api/v1/image/generate";
const VENICE_WIDTH = 832;
const VENICE_HEIGHT = 1216;
const QV_ASPECT_RATIO = "2:3";

/**
 * Her photographers, in order of preference.
 *
 * All three are Venice image models reached with the same key as her words and
 * her voice. qwen-image-3-pro is asked for first: it holds a description
 * together — body, hair, outfit and room all come back the way the prompt
 * asked. lustify-v8 and venice-sd35 sit behind it in case the first is ever
 * retired or rate-limited.
 *
 * The two families frame themselves differently, which is not optional: the
 * Qwen family wants an aspect ratio and answers png, and the SDXL family takes
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

    const key = veniceApiKey();
    if (!key) {
      throw new Error(
        "Her photos are taken by Venice, the same key as her chat — add it in " +
          "this project's Keys settings and she starts shooting again.",
      );
    }

    return { storageId: await viaVenice(key, trimmed, ctx) };
  },
});

/**
 * One round trip to Venice, stored as a Convex file.
 */
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
        // The Qwen family asks for a ratio and its own resolution tier, and
        // answers png; the SDXL family takes pixels, steps and a style preset.
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
    return await storeBase64(
      stripDataUrl(base64),
      ctx,
      model.aspectRatio ? "image/png" : "image/webp",
    );
  }

  throw new Error(
    `Venice couldn't take that photo. ${failures.join(" · ")} — add a key in the project's Keys settings`,
  );
}

/** `data:image/...;base64,...` → the base64 part only. */
function stripDataUrl(img: string): string {
  const comma = img.indexOf(",");
  return img.startsWith("data:") && comma !== -1 ? img.slice(comma + 1) : img;
}

/** base64 to bytes, without assuming Buffer is available. */
function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function storeBase64(
  base64: string,
  ctx: StorageCtx,
  mimeType: string,
): Promise<Id<"_storage">> {
  const bytes = fromBase64(base64);
  if (bytes.byteLength === 0) throw new Error("decoded an empty image");
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return await ctx.storage.store(new Blob([buffer], { type: mimeType }));
}
