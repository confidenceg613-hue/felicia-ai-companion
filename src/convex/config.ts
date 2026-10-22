/**
 * Venice AI credentials.
 *
 * One key now runs the whole app: her words, the memories she writes from the
 * conversation, her voice, her eyes and her photos. Nothing else is called.
 *
 * Keys pasted into the Keys/API keys tab have landed under more than one name
 * over time (`VENICE_API_KEY2`, `VENICE_API_KEY`, `VENICE_INFERENCE_KEY`), and a
 * key added under a name the code doesn't read looks exactly like one that was
 * never added at all. Newest name first.
 *
 * Secrets are only ever read on the Convex deployment — never in the browser.
 */
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
