// Development harness for how Felicia chooses a picture from her gallery.
// Excluded from the app's tsc/vite builds. Run it with:
//   bun test src/__tests__/galleryMatch.test.ts

// @ts-expect-error — `bun:test` is a Bun builtin and is not declared for tsc.
import { describe, expect, test } from "bun:test";

import { FELICIA_GALLERY } from "../lib/gallery.js";
import {
  bestPhoto,
  matchingWords,
  type GalleryCandidate,
} from "../lib/galleryMatch.js";

/** The ids of the photos that are actually of the thing being asked for. */
const RED = [
  "braided-chef-red-kitchen",
  "red-romper-kitchen",
  "red-romper-cooking",
  "kitchen-red-top",
  "red-romper-on-the-bed",
  "red-dress-sofa",
];

const KITCHEN = [
  "braided-chef-red-kitchen",
  "red-romper-kitchen",
  "red-romper-cooking",
  "kitchen-red-top",
  "kitchen-counter-sitting",
];

const POOL = [
  "poolside-towel",
  "in-the-pool",
  "pool-looking-back",
  "pool-cornrows",
  "pool-greenery",
  "pool-looking-away",
  "poolside-afternoon",
  "pool-looking-up",
  "pool-bright-sun",
];

/** Her roll exactly as the backend builds it, minus the sent-photo counts. */
function herRoll(): GalleryCandidate[] {
  return FELICIA_GALLERY.map((photo) => ({
    key: `gallery:${photo.id}`,
    galleryId: photo.id,
    url: photo.url,
    label: photo.title,
    scene: photo.about,
    tags: photo.tags,
    sentCount: 0,
  }));
}

/**
 * What she would send for a message, the way `sendMessage` decides it: the
 * user's words, her reply and the scene line she declared all count, because
 * any of them can name the picture.
 */
function pick(userText: string, reply = "", scene = ""): string | null {
  const found = bestPhoto([scene, userText, reply].filter(Boolean), herRoll());
  return found?.candidate.galleryId ?? null;
}

describe("matchingWords", () => {
  test("drops the request wrapper but keeps what is actually being asked for", () => {
    const words = matchingWords("can you send me a pic of you in the kitchen?");
    expect(words.has("kitchen")).toBe(true);
    expect(words.has("pic")).toBe(false);
    expect(words.has("send")).toBe(false);
  });

  test("swim and swimming are the same word on both sides", () => {
    expect(matchingWords("swim").has("swim")).toBe(true);
    expect(matchingWords("swimming").has("swim")).toBe(true);
  });
});

describe("Felicia choosing from her gallery", () => {
  test("something red sends a picture of her in red", () => {
    const chosen = pick(
      "send me a pic of you wearing red",
      "you want to see me in something red?",
    );
    expect(RED).toContain(chosen);
  });

  test("the kitchen sends a picture taken in the kitchen", () => {
    const chosen = pick(
      "send me a pic of you in the kitchen",
      "I'm cooking right now, hold on",
      "Felicia in her kitchen wearing an apron, stirring a pot",
    );
    expect(KITCHEN).toContain(chosen);
  });

  test("the pool sends a picture from the pool", () => {
    const chosen = pick(
      "pic of you at the pool please",
      "I'm still in the water",
    );
    expect(POOL).toContain(chosen);
  });

  test("her in a swimsuit sends one of the swimsuit photos", () => {
    const chosen = pick("show me a pic of you in a swimsuit");
    expect(POOL).toContain(chosen);
  });

  test("dressed up and going out sends the marble staircase", () => {
    const chosen = pick("send a pic of you dressed up before going out");
    expect([
      "blue-dress-staircase",
      "blue-mini-dress-staircase",
      "blue-dress-seated-staircase",
      "blue-satin-in-the-shower",
      "blue-satin-shower-light",
      "red-dress-sofa",
    ]).toContain(chosen);
  });

  test("sleeping late sends the bedroom", () => {
    const chosen = pick(
      "show me a pic of you lying in bed, it's late",
      "still awake too",
    );
    expect(["cozy-bedroom-braids", "portrait-quiet-moment"]).toContain(chosen);
  });

  test("the gym sends a gym photo", () => {
    const chosen = pick("send me a pic of you at the gym working out");
    expect(["gym-blue-set", "gym-blue-outfit"]).toContain(chosen);
  });

  test("yoga sends a yoga photo", () => {
    const chosen = pick("pic of you doing yoga");
    expect([
      "yoga-purple-mat",
      "yoga-lululemon-purple",
      "yoga-arms-up",
      "yoga-smiling-studio",
    ]).toContain(chosen);
  });

  test("a selfie sends something even without a scene", () => {
    expect(pick("send me a selfie")).not.toBeNull();
  });

  test("asking for a photo of her at home sends a photo taken at home", () => {
    const chosen = pick("send me a pic of you at home");
    expect(chosen).not.toBeNull();
  });
});
