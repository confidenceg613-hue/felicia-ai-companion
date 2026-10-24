/**
 * Which Convex deployment this browser should talk to.
 *
 * The address is baked into the bundle at build time (`VITE_CONVEX_URL`). A
 * published build can be produced with an environment that still names an old,
 * disabled deployment: the site itself loads, but nothing behind it answers —
 * sign-in fails and no conversation loads — while the same code in preview,
 * which reads the live value, is perfectly fine.
 *
 * So the configured address is checked with one cheap public query before the
 * app connects to it, and a deployment that cannot answer is replaced by this
 * project's live one. The choice is remembered per browser, so the check is one
 * request once, not on every page load.
 */
const CONFIGURED = (
  import.meta.env.VITE_CONVEX_URL as string | undefined
)?.replace(/\/+$/, "");

/** This project's live deployment. Only ever used if CONFIGURED is dead. */
const KNOWN_GOOD = "https://ideal-impala-475.convex.cloud";

const CACHE_KEY = "felicia:convex-url";
const PROBE_TIMEOUT_MS = 3500;

type Cached = { configured: string; resolved: string };

function readCache(configured: string): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (parsed?.configured !== configured) return null;
    if (typeof parsed.resolved !== "string" || !parsed.resolved) return null;
    return parsed.resolved;
  } catch {
    return null;
  }
}

function writeCache(configured: string, resolved: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ configured, resolved }));
  } catch {
    // Private mode or blocked storage: the check simply runs again next time.
  }
}

/**
 * Can this deployment answer a trivial public query?
 *
 * A paused or half-provisioned deployment still resolves its hostname, so a
 * plain fetch is not enough — the body has to say `success`.
 */
async function isHealthy(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Public, unauthenticated, and indexed: returns null for a visitor.
      body: JSON.stringify({
        path: "users:currentUser",
        args: {},
        format: "json",
      }),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: string };
    return body.status === "success";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The first deployment that actually answers; CONFIGURED if none does. */
export async function resolveConvexUrl(): Promise<string> {
  const configured = CONFIGURED ?? KNOWN_GOOD;

  const cached = readCache(configured);
  if (cached) return cached;

  const candidates = [configured];
  if (KNOWN_GOOD !== configured) candidates.push(KNOWN_GOOD);

  for (const candidate of candidates) {
    if (await isHealthy(candidate)) {
      writeCache(configured, candidate);
      return candidate;
    }
  }

  // Nothing answered: keep the configured deployment rather than guessing, so
  // the app reports a connection problem instead of pointing somewhere random.
  return configured;
}
