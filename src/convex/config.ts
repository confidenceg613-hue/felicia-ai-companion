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

/** Venice: image generation and vision, newest key name first. */
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
