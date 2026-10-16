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
    process.env.Groq_API_Key ??
    null
  );
}

export function isGroqConfigured(): boolean {
  return Boolean(groqApiKey());
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
