import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A short sentence a person can act on, out of a backend error.
 *
 * Convex wraps whatever the function threw in a banner — a function name, a
 * request id, "Server Error", a stack trace — and pasting that into the call
 * turned one hiccup into a screen full of "CONVEX". The useful part is a line,
 * and for the common causes it is not even that: they get a sentence saying
 * what to do next.
 */
export function friendlyError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const cleaned = raw
    .replace(/\[CONVEX[^\]]*\]/gi, " ")
    .replace(/\[Request ID:[^\]]*\]/gi, " ")
    .replace(/Server Error:?/gi, " ")
    .replace(/Uncaught Error:?/gi, " ")
    // Every client-side Convex error carries this line after the real message,
    // stack or not; it is no more useful to a person than the stack is.
    .replace(/Called by client/gi, " ")
    .replace(/^\s+at\s+[\s\S]*$/im, " ")
    .replace(/\bat\s+[\s\S]*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/sign in|not authenticated|unauthenticated/i.test(cleaned)) {
    return "Your session dropped — reload and she'll pick up again.";
  }
  if (
    /failed to fetch|connection lost|connection dropped|network|timed out|timeout/i.test(
      cleaned,
    )
  ) {
    return "The connection dipped for a second — send that again.";
  }
  if (/rate.?limit|too many requests|\b429\b/i.test(cleaned)) {
    return "She's a little overloaded right now — give it a few seconds and say it again.";
  }
  // Cloudflare's API errors tend to be plain but can still be long or noisy, so
  // most of them get a short, plain sentence instead of the raw response.
  if (/rejected the key|refused the key|does not carry/i.test(cleaned)) {
    return fallback;
  }
  if (
    /no balance|empty balance|workers ai|cloudflare/i.test(cleaned)
  ) {
    return fallback;
  }
  if (/content.?filter|safety.?filter|blocked|flagged/i.test(cleaned)) {
    return fallback;
  }
  if (/decoded an empty image|answered without an image/i.test(cleaned)) {
    return fallback;
  }
  if (/used up your daily free allocation|please upgrade|neurons|workers paid/i.test(cleaned)) {
    return fallback;
  }
  if (!cleaned) return fallback;
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}…` : cleaned;
}

/**
 * Whether a failure is worth one more try rather than a message to the user.
 *
 * A dropped connection or a load-balancer blip is not about what was said, so
 * sending the same line again usually just works.
 */
export function isTransientError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  // A transient failure is a real transport hiccup: the socket dropped, the
  // connection timed out, or a load balancer returned a 5xx. Anything with a
  // "connection in flight" banner but a client/cors/4xx/redirect tone is
  // usually a session or endpoint mismatch, not a blip the user can retry out
  // of — that gets a different message on the auth page specifically.
  if (/failed to fetch|network|timed? ?out|connection lost|disconnected/i.test(raw))
    return true;
  if (/\b50[234]\b/i.test(raw)) return true;
  return false;
}
