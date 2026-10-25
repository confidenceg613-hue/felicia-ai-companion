/**
 * Provider credentials.
 *
 * Her words, the memories she writes from the conversation and her spoken
 * lines run on Groq. Her photos and her eyes stay on Venice, which is the only
 * one of the two with image and vision models.
 *
 * Keys pasted into the Keys/API keys tab have landed under more than one name
 * over time, and a key added under a name the code doesn't read looks exactly
 * like one that was never added at all — so the spellings are all accepted.
 *
 * Secrets are only ever read on the Convex deployment — never in the browser.
 */

/** Groq: chat completions and Orpheus text-to-speech. */
export function groqApiKey(): string | null {
  return (
    process.env.GROQ_API_KEY ??
    process.env.GROQ_AI_API_KEY ??
    process.env.GROK_API_KEY ??
    process.env.GROK_AI_API_KEY ??
    null
  );
}

export function isGroqConfigured(): boolean {
  return Boolean(groqApiKey());
}

/**
 * Cloudflare Workers AI: her eyes.
 *
 * The canonical names are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
 * Keys added through the Keys UI have also landed as `Cloudfare_API_KEY`,
 * `CLOUDFLARE_API_KEY`, `CF_API_TOKEN` and plain `ACCOUNT_ID`, so all of those
 * spellings are accepted — an unrecognised name looks exactly like a backend
 * that was never configured.
 */
export function cloudflareToken(): string | null {
  return (
    process.env.CLOUDFLARE_API_TOKEN ??
    process.env.CF_API_TOKEN ??
    process.env.Cloudfare_API_KEY ??
    process.env.CLOUDFLARE_API_KEY ??
    null
  );
}

export function cloudflareAccountId(): string | null {
  return (
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    process.env.CF_ACCOUNT_ID ??
    process.env.ACCOUNT_ID ??
    null
  );
}

export function isCloudflareConfigured(): boolean {
  return Boolean(cloudflareToken() && cloudflareAccountId());
}

/**
 * Unsloth Studio, running on your own machine.
 *
 * Its server speaks an OpenAI-shaped image API on the port it was started on,
 * and it will load the open-weight FLUX 3 models (`unsloth/flux-3-image-klein`
 * GGUF), so photos can be taken locally with no per-photo cost. The address is
 * whatever Unsloth prints — `http://localhost:8888` on the same machine, a LAN
 * IP, or the free Cloudflare HTTPS URL that `unsloth studio --secure` publishes.
 *
 * Add `UNSLOTH_BASE_URL` and `UNSLOTH_API_KEY` in the Keys tab; the key is the
 * `sk-unsloth-…` value from Settings → API. `UNSLOTH_IMAGE_MODEL` is optional —
 * leave it out and whatever diffusion model is loaded gets used.
 */
export function unslothBaseUrl(): string | null {
  return (
    process.env.UNSLOTH_BASE_URL ??
    process.env.UNSLOTH_URL ??
    process.env.UNSLOTH_HOST ??
    null
  );
}

export function unslothApiKey(): string | null {
  return (
    process.env.UNSLOTH_API_KEY ??
    process.env.UNSLOTH_KEY ??
    null
  );
}

export function unslothImageModel(): string | null {
  return process.env.UNSLOTH_IMAGE_MODEL ?? null;
}

/**
 * Black Forest Labs: FLUX 3, the newest and most realistic of the family.
 *
 * Workers AI stops at FLUX.2, so this key is the only way to reach FLUX 3 at
 * all. Added under the Keys tab as `BFL_API_KEY`; the other spellings are
 * accepted because a key under an unread name is indistinguishable from no key.
 */
export function bflApiKey(): string | null {
  return (
    process.env.BFL_API_KEY ??
    process.env.BFL_KEY ??
    process.env.BLACK_FOREST_LABS_API_KEY ??
    null
  );
}

/** Venice: image generation, newest key name first. */
export function veniceApiKey(): string | null {
  return (
    process.env.VENICE_API_KEY2 ??
    process.env.VENICE_API_KEY ??
    process.env.VENICE_API ??
    process.env.VENICE_INFERENCE_KEY ??
    process.env.VENICE_INFERENCE_API_KEY ??
    null
  );
}

export function isVeniceConfigured(): boolean {
  return Boolean(veniceApiKey());
}
