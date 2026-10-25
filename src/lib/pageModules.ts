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
 * Two attempts at the same URL cover a request that was cut off mid-restart.
 * If the URL itself is gone, retrying is pointless, so the tab reloads once to
 * pick up the live module graph. The guard is per tab, so a module that is
 * genuinely broken still surfaces its error instead of reload-looping.
 */
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
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
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

export const pageModules = {
  // Landing and Auth are imported directly by the entry file: they are what a
  // first-time visitor loads, so they belong in the main bundle instead of
  // behind a chunk request.
  shell: withRetry(() => import("@/components/AppShell")),
  dashboard: withRetry(() => import("@/pages/Dashboard")),
  album: withRetry(() => import("@/pages/Album")),
  memories: withRetry(() => import("@/pages/Memories")),
  notes: withRetry(() => import("@/pages/SharedNotes")),
  settings: withRetry(() => import("@/pages/Settings")),
  notFound: withRetry(() => import("@/pages/NotFound")),
} as const;

export type PageModuleKey = keyof typeof pageModules;

/** Start loading every page's code. Idempotent, and safe to fire and forget. */
export function prefetchPages() {
  for (const load of Object.values(pageModules)) void load();
}
