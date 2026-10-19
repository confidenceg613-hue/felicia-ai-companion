/**
 * Cloudflare Workers AI credential resolution.
 *
 * The canonical names are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
 * Earlier keys added through the Keys UI used `Cloudfare_API_KEY` and
 * `ACCOUNT_ID`, so both spellings are accepted to avoid a silent misconfiguration.
 *
 * Secrets are only ever read on the Convex deployment — never in the browser.
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
 * AI Horde credential resolution.
 *
 * The AI Horde image backend is authenticated with a single API key in the
 * `apikey` header. Store it as `AI_HORDE_API_KEY` in the project's Keys/API
 * keys settings. The documented anonymous key `0000000000` also works, but it
 * has the lowest queue priority, so a real key is strongly preferred.
 *
 * Keys added through the Keys UI have also landed as `AI_Horde_API`, so both
 * spellings are accepted — a silently unrecognised key looks exactly like a
 * backend that was never configured.
 */
export function aiHordeApiKey(): string | null {
  return process.env.AI_HORDE_API_KEY ?? process.env.AI_Horde_API ?? null;
}

export function isAiHordeConfigured(): boolean {
  const key = aiHordeApiKey();
  if (!key) return false;
  // The documented anonymous key still "works" but is lowest priority.
  return key !== "0000000000";
}

/**
 * Groq credential resolution.
 *
 * Groq's chat completions API is authenticated with a Bearer token in the
 * `Authorization` header. Store it as `GROQ_API_KEY` in the project's Keys/API
 * keys settings.
 *
 * The same key is also used for Groq text-to-speech, via the Audio API
 * `POST /openai/v1/audio/speech` endpoint.
 *
 * A key entered as "groq Ai API key" is stored as `GROQ_AI_API_KEY`, which does
 * not match `GROQ_API_KEY`, so that spelling is accepted too. Without this the
 * app silently falls back to a different key — or to none at all, which reads
 * as "works in the preview but not when published".
 */
export function groqApiKey(): string | null {
  return (
    process.env.GROQ_API_KEY ??
    process.env.GROQ_AI_API_KEY ??
    null
  );
}

export function isGroqConfigured(): boolean {
  return Boolean(groqApiKey());
}

/**
 * Her roleplay model's credentials.
 *
 * Groq is fast and cheap but its general models are safety-tuned, so they drop
 * out of character when a conversation turns sexual. Venice hosts a model built
 * for adult roleplay (`venice-uncensored-role-play`); OpenRouter hosts an
 * equivalent one. Either key, pasted into the Keys tab as VENICE_API_KEY or
 * OPENROUTER_API_KEY, is enough — the Groq model keeps handling ordinary chat.
 */
export function veniceApiKey(): string | null {
  return process.env.VENICE_API_KEY ?? process.env.VENICE_API ?? null;
}

export function openRouterApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY ?? process.env.OpenRouter_API_KEY ?? null;
}

/** Whether any uncensored roleplay provider is configured. */
export function hasMatureProvider(): boolean {
  return Boolean(veniceApiKey() || openRouterApiKey());
}

/**
 * Groq voice capability resolution.
 *
 * Groq text-to-speech is a separate Audio API endpoint, not Cloudflare-style
 * workers. This app keeps Cloudflare Workers AI as the default voice backend
 * because it returns MP3 directly and has a mature fallback ladder, but Groq
 * Orpheus can be used as an alternative when Cloudflare is unavailable.
 */
export function groqVoiceEnabled(): boolean {
  return Boolean(groqApiKey());
}

/**
 * Alibaba Cloud Model Studio (Qwen Image) credential resolution.
 *
 * Qwen Image is OpenAI-compatible in OpenAI-compatible mode, so it is reached
 * here with the same fetch-style client that handles Venice. Add `DASHSCOPE_API_KEY`
 * to this deployment's Keys/API keys settings — via the API keys tab — and
 * `isQwenConfigured()` becomes true.
 *
 * The free new-user quota (10 images for qwen-image-3.0-pro in Singapore)
 * only starts after the account completes signup, and Alibaba's quota rules
 * say a payment method is often required to activate it — so the key can be
 * added now and the quota checked when the app is used. A `Free Quota Only`
 * setting on the Alibaba side must be enabled for trial quota to count.
 *
 * Secrets are only ever read on the Convex deployment — never in the browser.
 */
export function aiDashScopeApiKey(): string | null {
  return (
    process.env.DASHSCOPE_API_KEY ??
    process.env.ALIBABA_DASHSCOPE_API_KEY ??
    process.env.QWEN_API_KEY ??
    null
  );
}

export function isQwenConfigured(): boolean {
  return Boolean(aiDashScopeApiKey());
}
