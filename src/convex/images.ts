"use node";

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  aiHordeApiKey,
  cloudflareAccountId,
  cloudflareToken,
} from "./config";

/**
 * Taking a new photo of Felicia.
 *
 * Two backends, in the order that gets a picture back fastest:
 *
 *   1. Cloudflare Workers AI, when the account's token and account id are
 *      present. One round trip, usually a few seconds.
 *   2. The AI Horde, a volunteer network that needs no key of its own and
 *      costs nothing, at the price of queueing.
 *
 * This used to be an action name that no deployment registered, so asking her
 * for a photo failed no matter what keys were set. Both paths now live here and
 * return a real file in Convex storage.
 */

/** Fast text-to-image model on Cloudflare Workers AI. */
const CLOUDFLARE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/** How long to wait on the Horde before giving up on it. */
const HORDE_TIMEOUT_MS = 150_000;
/** How often the Horde is asked whether the job is finished. */
const HORDE_POLL_MS = 5_000;

/** The photo is portrait-shaped, the way her shots are framed. */
const HORDE_WIDTH = 512;
const HORDE_HEIGHT = 768;

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

    const token = cloudflareToken();
    const account = cloudflareAccountId();
    if (token && account) {
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
): Promise<Id<"_storage">> {
  const bytes = fromBase64(base64);
  if (bytes.byteLength === 0) throw new Error("decoded an empty image");
  // Sliced out of the decoded buffer so the blob owns an exact-length
  // ArrayBuffer, which is what BlobPart expects.
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return await ctx.storage.store(new Blob([buffer], { type: "image/png" }));
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
