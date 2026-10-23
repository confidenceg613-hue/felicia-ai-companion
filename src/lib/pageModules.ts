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
export const pageModules = {
  landing: () => import("@/pages/Landing"),
  auth: () => import("@/pages/Auth"),
  shell: () => import("@/components/AppShell"),
  dashboard: () => import("@/pages/Dashboard"),
  album: () => import("@/pages/Album"),
  memories: () => import("@/pages/Memories"),
  notes: () => import("@/pages/SharedNotes"),
  settings: () => import("@/pages/Settings"),
  notFound: () => import("@/pages/NotFound"),
} as const;

export type PageModuleKey = keyof typeof pageModules;

/** Start loading every page's code. Idempotent, and safe to fire and forget. */
export function prefetchPages() {
  for (const load of Object.values(pageModules)) void load();
}
