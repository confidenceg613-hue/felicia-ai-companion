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
