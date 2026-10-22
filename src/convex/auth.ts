// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import Google from "@auth/core/providers/google";
import { emailOtp } from "./auth/emailOtp";

/**
 * Where OAuth is allowed to send the browser back to.
 *
 * Convex Auth's default accepts only URLs under SITE_URL, which Convex sets to
 * the deployment's own `.convex.site` origin — not the app the person is
 * looking at. Google would authenticate them and then drop them on a 404.
 *
 * So the app's own origins are allowed instead: this deployment's SITE_URL,
 * any `*.vly.sh` preview/published host, localhost while developing, and
 * anything listed in AUTH_ALLOWED_ORIGINS (comma separated) for a custom
 * domain. The path is pinned to `/auth` — the only place the app ever asks to
 * return to — so a stray caller can't bounce the sign-in code elsewhere.
 */
function isAllowedRedirect(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.pathname !== "/auth") return false;

  const siteUrl = process.env.SITE_URL;
  if (siteUrl) {
    try {
      if (url.origin === new URL(siteUrl).origin) return true;
    } catch {
      // A malformed SITE_URL simply adds nothing to the allowlist.
    }
  }
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  if (url.hostname === "vly.sh" || url.hostname.endsWith(".vly.sh")) return true;

  const extra = (process.env.AUTH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return extra.includes(url.origin);
}

// Google reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from the deployment's
// environment. Until both exist the provider simply isn't offered in the UI
// (see convex/authProviders.ts), and the email + guest paths keep working.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, Anonymous, Google],
  callbacks: {
    async redirect({ redirectTo }) {
      const siteUrl = (process.env.SITE_URL ?? "").replace(/\/$/, "");
      if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
        return `${siteUrl}${redirectTo}`;
      }
      const url = new URL(redirectTo);
      if (!isAllowedRedirect(url)) {
        throw new Error(`Invalid redirectTo ${redirectTo}`);
      }
      return url.toString();
    },
  },
});
