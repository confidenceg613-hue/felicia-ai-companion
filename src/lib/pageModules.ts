/**
 * Every page's module, in one place.
 *
 * The router's `lazy()` and the prefetcher both go through this map, so the
 * promise a click needs has usually already resolved by the time the click
 * happens — the module is in memory and the page paints on the first frame
 * instead of after a chunk request.
 *
 * Modules are cached by the bundler, so calling these repeatedly costs one
 * lookup after the first call.
 */

/**
 * Set once we have already reloaded this tab to pick up re-built chunks.
 *
 * The dev server re-optimises its dependencies and restarts while a session is
 * running, and a publish swaps every chunk hash at once. Anything already on
 * screen then holds URLs that no longer exist, and a lazy import of one fails
 * with "Failed to fetch dynamically imported module" — the page then has no
 * route to render and stays broken until it is reloaded by hand.
 */
const RELOAD_KEY = "felicia:chunk-reload";

/**
 * A dynamic import that survives the server moving under it.
 *
 * The Vite dev server restarts and re-optimises its chunk manifest while a
 * session is alive. After that, every chunk URL the page already holds is
 * stale: a lazy import of one fails with "Failed to fetch dynamically imported
 * module" and the page has no route to render until it is reloaded by hand.
 *
 * Retrying the same URL never helps here — the timestamp/hash in it is gone
 * and the dev server will not serve it again. So on the first failure of that
 * specific kind we reload straight away, while a genuinely broken module still
 * throws after one try so a real bug is not hidden behind a reload loop.
 *
 * The reload guard is per tab, so a module that is genuinely broken once still
 * surfaces its error instead of reload-looping after the page has already
 * reloaded itself once.
 */
const DYNAMIC_IMPORT_ERROR =
  "Failed to fetch dynamically imported module";

function withRetry<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const module = await load();
        // This tab is healthy again, so a future restart may reload it once more.
        try {
          sessionStorage.removeItem(RELOAD_KEY);
        } catch {
          // Storage blocked: the reload guard simply never triggers.
        }
        return module;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? "");

        // A stale chunk URL from a dev-server restart. Retrying is pointless and
        // only costs a couple of seconds, so reload immediately on the first
        // failure of this kind rather than waiting through three attempts.
        if (
          attempt === 0 &&
          message.includes(DYNAMIC_IMPORT_ERROR) &&
          typeof window !== "undefined"
        ) {
          let alreadyReloaded = false;
          try {
            alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1";
            if (!alreadyReloaded)
              sessionStorage.setItem(RELOAD_KEY, "1");
          } catch {
            // Storage blocked: fall through and report the error.
          }
          if (!alreadyReloaded) window.location.reload();
          throw error;
        }

        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 250 * (attempt + 1)),
          );
          continue;
        }

        let alreadyReloaded = false;
        try {
          alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1";
          if (!alreadyReloaded) sessionStorage.setItem(RELOAD_KEY, "1");
        } catch {
          // Storage blocked: fall through and report the error.
        }
        if (!alreadyReloaded && typeof window !== "undefined") {
          window.location.reload();
        }
        throw error;
      }
    }
  };
}

/**
 * The raw loaders, before any retrying.
 *
 * The router wraps these in `withRetry` — a failed navigation has to be
 * recovered — while the prefetcher uses them as they are. Warming a module is
 * an optimisation, and an optimisation must never reload the tab: during a
 * rebuild every one of these requests fails at the same instant, and reloading
 * the page in the middle of that is how a warm-up turns into a loop.
 */
const loaders = {
  // Landing and Auth are imported directly by the entry file: they are what a
  // first-time visitor loads, so they belong in the main bundle instead of
  // behind a chunk request.
  shell: () => import("@/components/AppShell"),
  dashboard: () => import("@/pages/Dashboard"),
  album: () => import("@/pages/Album"),
  memories: () => import("@/pages/Memories"),
  notes: () => import("@/pages/SharedNotes"),
  settings: () => import("@/pages/Settings"),
  notFound: () => import("@/pages/NotFound"),
} as const;

export const pageModules = {
  shell: withRetry(loaders.shell),
  dashboard: withRetry(loaders.dashboard),
  album: withRetry(loaders.album),
  memories: withRetry(loaders.memories),
  notes: withRetry(loaders.notes),
  settings: withRetry(loaders.settings),
  notFound: withRetry(loaders.notFound),
} as const;

export type PageModuleKey = keyof typeof pageModules;

/**
 * Start loading every page's code. Idempotent, and safe to fire and forget.
 *
 * Failures are swallowed on purpose: the browser caches a module once it has
 * been fetched, so a warm-up that misses only costs the click it was meant to
 * save, and the route's own `withRetry` loader covers the fetch afterwards.
 */
export function prefetchPages() {
  for (const load of Object.values(loaders)) {
    void load().catch(() => undefined);
  }
}
