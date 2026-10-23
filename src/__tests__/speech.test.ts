// How one of her lines is cut before it is spoken. Excluded from the app's
// tsc/vite builds. Run it with:
//   bun test src/__tests__/speech.test.ts
//
// The properties that matter are the ones the player depends on: the opening
// piece has to be short enough to render fast, every piece has to be non-empty,
// nothing may be dropped or reordered, and a line with no spaces at all still
// has to terminate.

// @ts-expect-error — `bun:test` is a Bun builtin and is not declared for tsc.
import { describe, expect, test } from "bun:test";

import { splitForSpeech } from "../lib/speech.js";

const join = (pieces: string[]) => pieces.join(" ");

describe("splitForSpeech", () => {
  test("a short line is spoken as a single piece", () => {
    expect(splitForSpeech("goodnight ❤️")).toEqual(["goodnight ❤️"]);
  });

  test("a short first sentence is the opening piece on its own", () => {
    const pieces = splitForSpeech(
      "Hey you. I was just thinking about that thing you said about the gallery.",
    );
    expect(pieces[0]).toBe("Hey you.");
  });

  test("a long opening is cut after roughly seven words", () => {
    const pieces = splitForSpeech(
      "So I finally showed my mother the prints and she went completely silent for a whole minute.",
    );
    expect(pieces[0].length).toBeLessThanOrEqual(40);
    // The cut lands on a word boundary, so the opener never ends mid-word.
    expect(pieces[0].endsWith(" ")).toBe(false);
    expect(pieces[0].split(" ").every((word) => word.length > 0)).toBe(true);
  });

  test("nothing is lost, nothing is reordered", () => {
    const line =
      "I know 😌 it is late here too. I keep thinking about the balcony and how quiet it gets after eleven. Come sit with me for a bit?";
    const pieces = splitForSpeech(line);
    expect(join(pieces)).toBe(line.replace(/\s+/g, " ").trim());
    expect(pieces.every((piece) => piece.length > 0)).toBe(true);
  });

  test("pieces grow, so each has time to render while the last one plays", () => {
    const line =
      "Okay so listen. I have been meaning to tell you about the exhibition, " +
      "and I did not want to say it over text because it felt too big for that, " +
      "but the gallery said yes and they want the whole series in October.";
    const pieces = splitForSpeech(line);
    expect(pieces.length).toBeGreaterThan(2);
    // Never longer than the largest step, so no piece becomes a wait.
    expect(Math.max(...pieces.slice(1).map((piece) => piece.length))).toBeLessThanOrEqual(200);
  });

  test("a line with no spaces still terminates", () => {
    const pieces = splitForSpeech("a".repeat(500));
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join("")).toHaveLength(500);
  });

  test("empty and whitespace-only lines produce nothing", () => {
    expect(splitForSpeech("")).toEqual([]);
    expect(splitForSpeech("   \n  ")).toEqual([]);
  });
});
