"use node";

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  aiHordeApiKey,
  cloudflareAccountId,
  cloudflareToken,
  veniceApiKey,
} from "./config";

/**
 * Taking a new photo of Felicia.
 *
 * Three backends, in the order that gives the best picture:
 *
 *   1. Venice, when VENICE_API_KEY is set. It is the only one that can frame a
 *      standing figure — it takes real pixel width/height, so a phone-shaped
 *      2:3 frame is generated rather than a square that crops her at the waist.
 *      Its uncensored model is also the one that will photograph her the way
 *      her boyfriend is asking her to.
 *   2. Cloudflare Workers AI, when the account's token and account id are
 *      present. One round trip, usually a few seconds, but square only.
 *   3. The AI Horde, a volunteer network that needs no key of its own and
 *      costs nothing, at the price of queueing.
 *
 * Every backend that fails is skipped, and the errors are collected so a real
 * outage reads as one useful sentence instead of a silent no.
 */

/** Fast text-to-image model on Cloudflare Workers AI. */
const CLOUDFLARE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/**
 * The one Cloudflare model that takes a real frame size.
 *
 * flux-1-schnell only makes squares, which is why every "full body" photo came
 * back as a headshot. SDXL accepts width and height, so it can shoot her in the
 * same tall 2:3 frame Venice uses — and it works without a Venice balance.
 */
const CLOUDFLARE_SDXL_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";

/** How long to wait on the Horde before giving up on it. */
const HORDE_TIMEOUT_MS = 150_000;
/** How often the Horde is asked whether the job is finished. */
const HORDE_POLL_MS = 5_000;

/** The photo is portrait-shaped, the way her shots are framed. */
const HORDE_WIDTH = 512;
const HORDE_HEIGHT = 768;

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

/**
 * Her photographer: the uncensored model first, then the general one.
 *
 * lustify is a photoreal SDXL build with no content filter; venice-sd35 is the
 * house model and catches the run if the first is unavailable.
 */
const VENICE_IMAGE_MODELS = ["lustify-v8", "venice-sd35"];

/**
 * What is kept out of her photos.
 *
 * The framing words matter as much as the prompt: without them a "full body"
 * prompt still comes back as a cropped portrait, because a headshot is the
 * most common photograph of a person in the training data.
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

    const failures: string[] = [];

    const venice = veniceApiKey();
    if (venice) {
      try {
        return {
          storageId: await viaVenice(venice, trimmed, ctx),
        };
      } catch (error) {
        failures.push(
          `Venice: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const token = cloudflareToken();
    const account = cloudflareAccountId();
    if (token && account) {
      // Tall frame first: this is the one that can actually show her standing.
      try {
        return {
          storageId: await viaCloudflareTall(token, account, trimmed, ctx),
        };
      } catch (error) {
        failures.push(
          `Cloudflare SDXL: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      try {
        return { storageId: await viaCloudflare(token, account, trimmed, ctx) };
      } catch (error) {
        failures.push(
          `Cloudflare: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      failures.push("Cloudflare: no API token or account id on this deployment");
    }

    try {
      return { storageId: await viaHorde(trimmed, ctx) };
    } catch (error) {
      failures.push(
        `AI Horde: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    throw new Error(
      `Couldn't take that photo. ${failures.join(" · ")}`,
    );
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
  let lastError: Error | null = null;

  for (const model of VENICE_IMAGE_MODELS) {
    const response = await fetch(VENICE_IMAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        negative_prompt: VENICE_NEGATIVE,
        width: VENICE_WIDTH,
        height: VENICE_HEIGHT,
        steps: 30,
        cfg_scale: 7,
        // Hyperrealism, not "Photographic": the preset steers the model away
        // from the retouched-glamour look that reads as generated.
        style_preset: "Hyperrealism",
        safe_mode: false,
        hide_watermark: true,
        format: "webp",
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      lastError = new Error(`${model}: ${response.status} ${detail}`);
      // An empty wallet or a dead key is not fixed by trying the next model.
      if (response.status === 401 || response.status === 402) break;
      continue;
    }

    const payload = (await response.json()) as { images?: string[] };
    const base64 = payload.images?.[0];
    if (!base64) {
      lastError = new Error(`${model}: finished with no image`);
      continue;
    }
    return await storeBase64(stripDataUrl(base64), ctx, "image/webp");
  }

  throw lastError ?? new Error("no image model answered");
}

/**
 * A photo shot in the tall frame, on Cloudflare's SDXL model.
 *
 * Same 832×1216 frame Venice uses, so a full-length prompt and a square-ish
 * prompt produce the same composition no matter which backend answers.
 */
async function viaCloudflareTall(
  token: string,
  account: string,
  prompt: string,
  ctx: StorageCtx,
): Promise<Id<"_storage">> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${CLOUDFLARE_SDXL_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        negative_prompt: VENICE_NEGATIVE,
        width: VENICE_WIDTH,
        height: VENICE_HEIGHT,
        num_steps: 10,
        guidance: 7.5,
      }),
    },
  );

  if (!response.ok) {
    throw new Error((await response.text()).slice(0, 300));
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("empty image response");
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return await ctx.storage.store(new Blob([buffer], { type: "image/png" }));
}

/** One round trip to Cloudflare Workers AI, stored as a Convex file. */
async function viaCloudflare(
  token: string,
  account: string,
  prompt: string,
  ctx: StorageCtx,
): Promise<Id<"_storage">> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${CLOUDFLARE_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, steps: 6 }),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`${response.status} ${detail}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  // flux-1-schnell answers with JSON carrying a base64 image; some models
  // answer with the bytes themselves, so both are handled.
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as {
      result?: { image?: string };
      image?: string;
      errors?: unknown;
    };
    const base64 = payload.result?.image ?? payload.image;
    if (!base64) {
      throw new Error(`no image in response: ${JSON.stringify(payload).slice(0, 200)}`);
    }
    return await storeBase64(base64, ctx);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("empty image response");
  return await ctx.storage.store(new Blob([bytes], { type: "image/jpeg" }));
}

/**
 * The AI Horde: submit, then wait for a volunteer worker to render it.
 *
 * The free key is only useful for a quick preview, so a real key raises the
 * queue priority; either way this gives up after a couple of minutes rather
 * than leaving the request open indefinitely.
 */
async function viaHorde(
  prompt: string,
  ctx: StorageCtx,
): Promise<Id<"_storage">> {
  const key = aiHordeApiKey() ?? "0000000000";

  const submit = await fetch("https://stablehorde.net/api/v2/generate/async", {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      "Client-Agent": "FeliciaApp:1.0:(https://felicia.app)",
    },
    body: JSON.stringify({
      prompt,
      params: {
        width: HORDE_WIDTH,
        height: HORDE_HEIGHT,
        steps: 25,
        n: 1,
        sampler_name: "k_euler_a",
      },
      nsfw: false,
      censor_nsfw: true,
      trusted_workers: false,
    }),
  });

  if (!submit.ok) {
    throw new Error(`${submit.status} ${(await submit.text()).slice(0, 200)}`);
  }

  const { id } = (await submit.json()) as { id?: string };
  if (!id) throw new Error("no job id returned");

  const deadline = Date.now() + HORDE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(HORDE_POLL_MS);

    const check = await fetch(
      `https://stablehorde.net/api/v2/generate/check/${id}`,
    );
    if (!check.ok) continue;
    const status = (await check.json()) as { done?: boolean; faulted?: boolean };
    if (status.faulted) throw new Error("job faulted");
    if (!status.done) continue;

    const result = await fetch(
      `https://stablehorde.net/api/v2/generate/status/${id}`,
    );
    if (!result.ok) throw new Error(`${result.status} while fetching status`);
    const payload = (await result.json()) as {
      generations?: Array<{ img?: string }>;
    };
    const img = payload.generations?.[0]?.img;
    if (!img) throw new Error("finished with no image");
    return await storeBase64(stripDataUrl(img), ctx);
  }

  throw new Error("timed out waiting for a worker");
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
