/** @file — static sanity check for the FLUX.2 photo integration path.
 * It touches no network and no secrets; it only asserts the app-side helpers that the photo
 * action relies on stay well-behaved, so the constant’s intent remains compatible with an empty
 * prompt being rejected and that transient failures are retried while configuration failures are
 * surfaced straight away.
 */
import { it, expect } from "vitest";
import { isRetryablePhotoFailure } from "../convex/images";

it("retries transient failures and surfaces configuration failures", () => {
  // Transient enough to retry.
  expect(isRetryablePhotoFailure(new Error("timed out waiting for the image"))).toBe(true);
  expect(isRetryablePhotoFailure(new Error("empty result"))).toBe(true);
  expect(isRetryablePhotoFailure(new Error("rejected the scene"))).toBe(true);
  // No point retrying a dead key or an empty balance — nothing about a second try changes those.
  expect(isRetryablePhotoFailure(new Error("workers ai balance exhausted"))).toBe(false);
  expect(isRetryablePhotoFailure(new Error("unauthorized"))).toBe(false);
  expect(isRetryablePhotoFailure(new Error("not configured"))).toBe(false);
});

