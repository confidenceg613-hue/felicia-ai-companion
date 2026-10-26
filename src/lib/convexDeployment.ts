/**
 * Which Convex deployment this browser talks to.
 *
 * It is simply the one the project is configured with (`VITE_CONVEX_URL`),
 * which is where this app's functions, its sign-in keys and its users all
 * live.
 *
 * An earlier version tried to be clever here: it probed a hardcoded address
 * and used whichever deployment answered, to work around a paused backend.
 * That deployment belonged to a different project — it had none of this app's
 * sign-in keys, so every sign-in attempt failed with a server error. Sign-in
 * only works against the deployment that actually owns the data, so there is
 * nothing to choose between: use the configured address.
 */
const CONFIGURED = (
  import.meta.env.VITE_CONVEX_URL as string | undefined
)?.replace(/\/+$/, "");

export async function resolveConvexUrl(): Promise<string> {
  if (!CONFIGURED) {
    throw new Error(
      "VITE_CONVEX_URL is not set, so the app has no backend to connect to.",
    );
  }
  return CONFIGURED;
}
