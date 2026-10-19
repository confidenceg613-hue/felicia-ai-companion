"use node";

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { veniceApiKey } from "./config";

/**
 * Taking a new photo of Felicia.
 *
 * Venice is her only photographer, and that is deliberate rather than a
 * fallback that got left behind. Every other backend tried here had the same
 * failure: a square frame that cropped her at the waist, and a safety-tuned
 * model that would not photograph her the way her boyfriend asks. Venice takes
 * real pixel dimensions — so a standing figure fits in a tall 2:3 frame — and
 * hosts an uncensored photoreal model built for exactly this.
 *
 * There is no silent second choice. If Venice cannot deliver, this says so in
 * one useful sentence instead of quietly handing over somebody else's picture
 * of a different woman.
 */

/**
 * Venice's image endpoint, and the frame her photos are taken in.
 *
 * 832×1216 is 2:3 — the tallest frame Venice accepts (height caps at 1280) and
 * both dimensions divide cleanly by 16, which its models require. A square
 * frame is what was turning every "full body" request into a headshot: the
 * model filled the frame with her face and cropped the rest. A frame this tall
 * leaves room to stand in.
 */
const VENICE_IMAGE_URL = "https://api.venice.ai/api/v1/image/generate";
const VENICE_WIDTH = 832;
const VENICE_HEIGHT = 1216;
/** The same 2:3 frame, in the form the Qwen family wants to be told. */
const VENICE_ASPECT_RATIO = "2:3";

/**
 * Her photographer, in order of preference.
 *
 * qwen-image-3-pro is asked for first: it is the model chosen for her, and it
 * is the one that holds a description together — body, hair, outfit and room
 * all come back the way the prompt asked. lustify-v8 and venice-sd35 sit
 * behind it in case the first is ever retired or rate-limited.
 *
 * The two families frame themselves differently, which is not optional:
 * Venice's Qwen models reject `width`/`height` with a 400 and want an
 * `aspect_ratio`, while the SDXL-family models take pixels and divide by 8/16.
 * Sending one family the other's sizing is the mistake that used to 400 a
 * request that had nothing else wrong with it.
 */
const VENICE_IMAGE_MODELS: Array<{
  id: string;
  aspectRatio: boolean;
}> = [
  { id: "qwen-image-3-pro", aspectRatio: true },
  { id: "lustify-v8", aspectRatio: false },
  { id: "venice-sd35", aspectRatio: false },
];

/**
 * What is kept out of her photos.
 *
 * The framing words matter as much as the prompt: without them a "full body"
 * prompt still comes back as a cropped portrait, because a headshot is the
 * most common photograph of a person in the training data. The second half
 * keeps her out of the retouched-glamour look that reads as generated.
 */
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
  handler: async (
    ctx: StorageCtx,
    { prompt }: { prompt: string },
  ): Promise<{ storageId: Id<"_storage"> }> => {
    const trimmed = prompt.trim();
    if (!trimmed) throw new Error("A photo needs a scene to describe.");

    const key = veniceApiKey();
    if (!key) {
      throw new Error(
        "Her photos are taken by Venice, and this deployment has no VENICE_API_KEY. " +
          "Add it in this project's Keys settings (from venice.ai/settings/api) and " +
          "she'll start shooting again.",
      );
    }

    return { storageId: await viaVenice(key, trimmed, ctx) };
  },
});

/**
 * One round trip to Venice, stored as a Convex file.
 *
 * `safe_mode: false` is what stops adult photos being returned blurred, and
 * `hide_watermark` keeps the picture looking like something she took rather
 * than something she bought. Both are accepted by every image model here.
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
        // Qwen asks for a ratio and its own resolution tier and answers png;
        // the SDXL-family models take pixels, steps and a style preset.
        ...(model.aspectRatio
          ? {
              aspect_ratio: VENICE_ASPECT_RATIO,
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
      failures.push(`${model}: finished with no image`);
      continue;
    }
    return await storeBase64(stripDataUrl(base64), ctx, model.aspectRatio ? "image/png" : "image/webp");
  }

  throw new Error(`Venice couldn't take that photo. ${failures.join(" · ")}`);
}

/** `data:image/webp;base64,…` → the base64 part only. */
function stripDataUrl(img: string): string {
  const comma = img.indexOf(",");
  return img.startsWith("data:") && comma !== -1 ? img.slice(comma + 1) : img;
}

async function storeBase64(
  base64: string,
  ctx: StorageCtx,
  mimeType = "image/png",
): Promise<Id<"_storage">> {
  const bytes = fromBase64(base64);
  if (bytes.byteLength === 0) throw new Error("decoded an empty image");
  // Sliced out of the decoded buffer so the blob owns an exact-length
  // ArrayBuffer, which is what BlobPart expects.
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return await ctx.storage.store(new Blob([buffer], { type: mimeType }));
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
