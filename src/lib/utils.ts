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
    .replace(/\bat\s+[\s\S]*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/sign in|not authenticated|unauthenticated/i.test(cleaned)) {
    return "Your session dropped — reload and she'll pick up again.";
  }
  if (/failed to fetch|connection lost|network|timed out|timeout/i.test(cleaned)) {
    return "The connection dipped for a second — say it again.";
  }
  if (/rate.?limit|too many requests|\b429\b/i.test(cleaned)) {
    return "She's a little overloaded right now — give it a few seconds and say it again.";
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
  return /failed to fetch|connection lost|network|timed out|timeout|\b50[234]\b/i.test(
    raw,
  );
}
