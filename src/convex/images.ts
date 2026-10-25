"use node";

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  bflApiKey,
  cloudflareAccountId,
  cloudflareToken,
  veniceApiKey,
} from "./config";

/**
 * Telling a retry from a cause worth reporting.
 */
export function isRetryablePhotoFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /time|stall|empty|unreadable|not finish|terminated|429/i.test(message);
}

// ---------------------------------------------------------------------------
// Cloudflare Workers AI — her photographer
// ---------------------------------------------------------------------------

/** The endpoint is one path per model, on the account the key belongs to. */
function cloudflareRun(accountId: string, model: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

/**
 * FLUX.2 [dev] is asked for first: it is the most realistic of the models on
 * Workers AI, and unlike the smaller one it takes an explicit width and height,
 * so she is framed the tall way her gallery is.
 *
 * It is a partner model, and its request is form-data rather than JSON — the
 * prompt and the size are fields, not properties.
 */
const FLUX2_MODEL = "@cf/black-forest-labs/flux-2-dev";

/**
 * FLUX.1 [schnell] is the fast one, kept behind it: it answers with the photo
 * as base64 in JSON in about a second, on a fixed square frame.
 */
const FLUX_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/**
 * SDXL base is the second shot: it takes a negative prompt and an explicit
 * width and height, so it can frame her the tall way her gallery uses.
 */
const SDXL_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

/** Tall framing, the way her roll is shot. */
const PHOTO_WIDTH = 832;
const PHOTO_HEIGHT = 1216;

/** What is kept out of her photos. */
const NEGATIVE_PROMPT =
  "close-up, headshot, cropped, cut off, portrait crop, bust shot, " +
  "out of frame, cropped legs, cropped feet, deformed, extra limbs, " +
  "digital art, illustration, painting, cgi, 3d render, plastic airbrushed " +
  "skin, doll, glamour retouch, oversaturated";

/** The only part of an action context this file needs. */
type StorageCtx = {
  storage: { store: (blob: Blob) => Promise<Id<"_storage">> };
};

/**
 * Who she is, in the words the reference image cannot say.
 *
 * Both providers can be handed pictures to work from, and each addresses them
 * differently — Workers AI numbers them ("image 0"), Black Forest Labs takes a
 * list and has the model read it as "the reference photo" — so the wording is
 * built per provider rather than hardcoded once. Without it the model renders
 * a beautiful stranger every time, and her album looks like a stock library
 * instead of one person's roll.
 */
function identity(ref: string): string {
  return (
    `The woman in ${ref} — exactly the same person: identical face, features, ` +
    "skin tone, hair and body. Photograph her again, not a lookalike. "
  );
}

export const generate = internalAction({
  args: {
    prompt: v.string(),
    /**
     * Her portrait, as a picture the model can hold her identity to.
     *
     * Passed in by the caller because it is the account's own choice of
     * picture — the one on her profile — rather than something this file could
     * know on its own.
     */
    referenceUrl: v.optional(v.string()),
  },
  handler: async (
    ctx: StorageCtx,
    { prompt, referenceUrl }: { prompt: string; referenceUrl?: string | null },
  ): Promise<{
    storageId: Id<"_storage">;
  }> => {
    const trimmed = prompt.trim();
    if (!trimmed) throw new Error("A photo needs a scene to describe.");

    const token = cloudflareToken();
    const account = cloudflareAccountId();
    const venice = veniceApiKey();
    const bfl = bflApiKey();
    const problems: string[] = [];

    // FLUX 3 first when there is a Black Forest Labs key: it is the newest of
    // the FLUX family and the most realistic of them, and it takes her profile
    // picture as a reference so the same woman comes back. Workers AI does not
    // publish FLUX 3 — this is the only route to it. A key with no credits on
    // it is not a failure of the app: the photo simply falls through to
    // Cloudflare, which is where every photo was taken before this.
    if (bfl) {
      try {
        return {
          storageId: await viaBlackForest(
            bfl,
            trimmed,
            ctx,
            referenceUrl ?? null,
          ),
        };
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (token && account) {
      try {
        return {
          storageId: await viaCloudflare(
            token,
            account,
            trimmed,
            ctx,
            referenceUrl ?? null,
          ),
        };
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
        // A missing key or an exhausted quota is the same for every model, so
        // there is no point trying the same provider again.
        if (/rejected|no balance|not configured/i.test(problems.join(" "))) {
          throw new Error(problems.join(" · "));
        }
      }
    }

    if (venice) {
      try {
        return { storageId: await viaVenice(venice, trimmed, ctx) };
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (problems.length === 0) {
      throw new Error(
        "Her photos need CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in " +
          "this project's Keys settings — the same pair her eyes use.",
      );
    }
    throw new Error(`Couldn't take that photo. ${problems.join(" · ")}`);
  },
});

/**
 * One round trip to Workers AI, stored as a Convex file.
 *
 * Two models, because they fail in different ways: FLUX answers JSON with the
 * photo inline, SDXL streams the bytes back. Both are handled here so the
 * caller never has to know which one actually took the picture.
 */
async function viaCloudflare(
  token: string,
  account: string,
  prompt: string,
  ctx: StorageCtx,
  referenceUrl: string | null,
): Promise<Id<"_storage">> {
  const failures: string[] = [];

  // 1. FLUX.2 [dev] — the best-looking of the three, on a tall frame, and the
  // only one that can be shown a picture of the woman it is drawing.
  const form = new FormData();
  form.set("prompt", referenceUrl ? `${identity("image 0")}${prompt}` : prompt);
  form.set("width", String(PHOTO_WIDTH));
  form.set("height", String(PHOTO_HEIGHT));
  form.set("steps", "6");

  const reference = referenceUrl ? await fetchPortrait(referenceUrl) : null;
  if (reference) form.set("input_image_0", reference, "her.png");

  const flux2 = await fetch(cloudflareRun(account, FLUX2_MODEL), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (flux2.ok) {
    const payload = (await flux2.json()) as {
      result?: { image?: string };
      success?: boolean;
      errors?: Array<{ message?: string }>;
    };
    const base64 = payload.result?.image;
    if (base64) return await storeBase64(base64, ctx, "image/jpeg");
    failures.push(
      `FLUX.2 [dev]: ${payload.errors?.[0]?.message ?? "answered without an image"}`,
    );
  } else {
    const detail = (await flux2.text()).slice(0, 200);
    failures.push(`FLUX.2 [dev] (${flux2.status}) ${detail}`);
    if (flux2.status === 401 || flux2.status === 403) {
      throw new Error(
        `Cloudflare rejected the API token — re-add CLOUDFLARE_API_TOKEN in ` +
          `this project's Keys settings. ${detail}`,
      );
    }
  }

  // 2. FLUX.1 [schnell] — JSON too, and much faster, but locked to a square.
  const flux = await fetch(cloudflareRun(account, FLUX_MODEL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Framing is not a parameter on this model, so it is asked for in words:
      // without it the frame is square and her feet are what get cropped.
      prompt: `${prompt} Vertical portrait framing, 3:4 frame, her whole figure in shot.`,
      // Only `prompt` and `steps` are accepted here: this model rejects any
      // other property outright with a 400, so a seed cannot be passed.
      steps: 6,
    }),
  });

  if (flux.ok) {
    const payload = (await flux.json()) as {
      result?: { image?: string };
      success?: boolean;
      errors?: Array<{ message?: string }>;
    };
    const base64 = payload.result?.image;
    if (base64) return await storeBase64(base64, ctx, "image/jpeg");
    const detail = payload.errors?.[0]?.message ?? "answered without an image";
    failures.push(`FLUX.1 schnell: ${detail}`);
  } else {
    const detail = (await flux.text()).slice(0, 200);
    failures.push(`FLUX.1 schnell (${flux.status}) ${detail}`);
    if (flux.status === 401 || flux.status === 403) {
      throw new Error(
        `Cloudflare rejected the API token — re-add CLOUDFLARE_API_TOKEN in ` +
          `this project's Keys settings. ${detail}`,
      );
    }
  }

  // 3. SDXL — streams the bytes back and takes a negative prompt.
  const sdxl = await fetch(cloudflareRun(account, SDXL_MODEL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      negative_prompt: NEGATIVE_PROMPT,
      width: PHOTO_WIDTH,
      height: PHOTO_HEIGHT,
      num_steps: 20,
      guidance: 7.5,
      seed: Math.floor(Math.random() * 2 ** 31),
    }),
  });

  if (sdxl.ok) {
    const bytes = await sdxl.arrayBuffer();
    if (bytes.byteLength === 0) {
      failures.push("SDXL: finished with no image");
    } else {
      const type = sdxl.headers.get("content-type") ?? "image/png";
      return await ctx.storage.store(
        new Blob([bytes], { type: type.startsWith("image/") ? type : "image/png" }),
      );
    }
  } else {
    failures.push(`SDXL (${sdxl.status}) ${(await sdxl.text()).slice(0, 200)}`);
  }

  throw new Error(`Cloudflare couldn't take that photo. ${failures.join(" · ")}`);
}

/**
 * The portraits already downloaded, so one photo does not pay for the last.
 *
 * Her profile picture is a couple of megabytes; a call to her photo studio is
 * one request, but a few in a row would otherwise re-download the same file
 * every time. Capped so a long-lived instance cannot grow without bound.
 */
const portraitCache = new Map<string, Blob>();
const PORTRAIT_CACHE_LIMIT = 4;

/**
 * Her portrait, as bytes the model can read.
 *
 * A reference that will not load is not a failure: the words in the prompt
 * still describe her, so the photo is simply taken without the picture — which
 * is what every photo did before this existed.
 */
async function fetchPortrait(url: string): Promise<Blob | null> {
  const cached = portraitCache.get(url);
  if (cached) return cached;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) return null;
    const blob = new Blob([bytes], {
      type: response.headers.get("content-type") ?? "image/png",
    });
    if (portraitCache.size >= PORTRAIT_CACHE_LIMIT) {
      const oldest = portraitCache.keys().next().value;
      if (oldest) portraitCache.delete(oldest);
    }
    portraitCache.set(url, blob);
    return blob;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Black Forest Labs — FLUX 3, the best of the family
// ---------------------------------------------------------------------------

const BFL_IMAGE_URL = "https://api.bfl.ai/v1/flux-3-image";
/** 2:3 is in FLUX 3's own list of ratios, and matches her tall gallery frame. */
const BFL_ASPECT_RATIO = "2:3";
/** `1k` is the default pixel tier; `2k` costs more and is not needed here. */
const BFL_RESOLUTION = "1k";
/** How long one photo may take before it is called a failure. */
const BFL_TIMEOUT_MS = 90_000;
const BFL_POLL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One FLUX 3 photo, start to finish.
 *
 * The API is asynchronous: a request comes back with a `polling_url`, and the
 * image only exists once that URL reports `Ready` with a signed sample URL.
 * Both halves are here so the caller still gets one stored file back.
 *
 * Her profile picture goes in as a reference image, which is what keeps the
 * same face, hair and body across the album; the prompt calls it out in words
 * as well, because a model given an unlabelled picture will happily draw the
 * room around it and put somebody else in it.
 */
async function viaBlackForest(
  key: string,
  prompt: string,
  ctx: StorageCtx,
  referenceUrl: string | null,
): Promise<Id<"_storage">> {
  const submit = await fetch(BFL_IMAGE_URL, {
    method: "POST",
    headers: {
      "x-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: referenceUrl ? `${identity("the reference photo")}${prompt}` : prompt,
      ...(referenceUrl ? { images: [referenceUrl] } : {}),
      aspect_ratio: BFL_ASPECT_RATIO,
      resolution: BFL_RESOLUTION,
      // Web grounding is on by default and would drag stock photography of
      // real places into a personal photo of her, so it is turned off.
      grounding: false,
    }),
  });

  if (!submit.ok) {
    const detail = (await submit.text()).slice(0, 300);
    throw new Error(`FLUX 3 (${submit.status}) ${detail}`);
  }

  const queued = (await submit.json()) as { polling_url?: string };
  const pollingUrl = queued.polling_url;
  if (!pollingUrl) throw new Error("FLUX 3 accepted the request but sent no polling URL");

  const deadline = Date.now() + BFL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(BFL_POLL_MS);
    const polled = await fetch(pollingUrl, { headers: { "x-key": key } });
    if (!polled.ok) {
      // A 404 on the polling URL is the task not existing yet rather than a
      // rejection, so it is waited out like any other not-ready answer.
      if (polled.status === 404) continue;
      const detail = (await polled.text()).slice(0, 200);
      throw new Error(`FLUX 3 poll (${polled.status}) ${detail}`);
    }

    const state = (await polled.json()) as {
      status?: string;
      result?: { sample?: string } | null;
    };
    const status = state.status ?? "";
    if (status === "Ready") {
      const sample = state.result?.sample;
      if (!sample) throw new Error("FLUX 3 finished without an image");
      const image = await fetch(sample);
      if (!image.ok) throw new Error("FLUX 3's image link could not be opened");
      const bytes = await image.arrayBuffer();
      if (bytes.byteLength === 0) throw new Error("FLUX 3 returned an empty image");
      const type = image.headers.get("content-type") ?? "image/jpeg";
      return await ctx.storage.store(
        new Blob([bytes], { type: type.startsWith("image/") ? type : "image/jpeg" }),
      );
    }
    if (/moderat|error|failed|not found|no card/i.test(status)) {
      throw new Error(`FLUX 3 ${status.toLowerCase()}`);
    }
  }

  throw new Error("FLUX 3 timed out before the photo was finished");
}

// ---------------------------------------------------------------------------
// Venice — kept as the last resort
// ---------------------------------------------------------------------------

const VENICE_IMAGE_URL = "https://api.venice.ai/api/v1/image/generate";
const VENICE_WIDTH = 832;
const VENICE_HEIGHT = 1216;
const QV_ASPECT_RATIO = "2:3";

/**
 * Venice's own models, tried in order.
 *
 * qwen-image-3-pro holds a description together — body, hair, outfit and room
 * all come back the way the prompt asked. The SDXL family behind it takes
 * pixels, steps and a style preset instead of a ratio, which is why each entry
 * carries how it wants to be sized.
 */
const VENICE_IMAGE_MODELS: Array<{
  id: string;
  aspectRatio: boolean;
}> = [
  { id: "qwen-image-3-pro", aspectRatio: true },
  { id: "lustify-v8", aspectRatio: false },
  { id: "venice-sd35", aspectRatio: false },
];

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
        negative_prompt: NEGATIVE_PROMPT,
        safe_mode: false,
        hide_watermark: true,
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
            ? "Venice has no balance on this account."
            : `Venice rejected the API key. ${detail}`,
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

  throw new Error(`Venice couldn't take that photo. ${failures.join(" · ")}`);
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** `data:image/...;base64,...` → the base64 part only. */
function stripDataUrl(img: string): string {
  const comma = img.indexOf(",");
  return img.startsWith("data:") && comma !== -1 ? img.slice(comma + 1) : img;
}

/** base64 to bytes, without assuming Buffer is available. */
function fromBase64(base64: string): Uint8Array {
  const binary = atob(stripDataUrl(base64));
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
