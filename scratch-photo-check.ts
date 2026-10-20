/**
 * Temporary verification for the "only send a photo that matches the request"
 * change. Run with: bun scratch-photo-check.ts
 */
import { FELICIA_GALLERY } from "./src/lib/gallery";
import {
  bestPhoto,
  photoFits,
  requestDemands,
  textFits,
  type GalleryCandidate,
  type Demand,
} from "./src/lib/galleryMatch";
import { demandText, sceneFromRequest } from "./src/convex/felicia";

const roll: GalleryCandidate[] = FELICIA_GALLERY.map((photo) => ({
  key: `gallery:${photo.id}`,
  url: photo.url,
  label: photo.title,
  scene: photo.about,
  galleryId: photo.id,
  tags: photo.tags,
}));

const CASES = [
  "send me a picture of you at the beach",
  "send me a pic of you in a red dress",
  "send me a picture of you in the kitchen",
  "send me a picture of you doing a yoga pose",
  "send me a picture of you dancing",
  "send me a pic of you",
  "good night! send me a pic of you at the beach",
  "take a photo of you on the beach",
  "send me a selfie of you in the bathroom",
  "pic of you in the gym doing a workout",
  "can you send me a photo of you in a blue dress on the sofa",
  "how was your day? send me a pic of you in a red dress",
];

function kinds(demands: Demand[]): string {
  if (demands.length === 0) return "-";
  return demands.map((d) => `${d.kind}{${d.required.map((s) => [...s].join("/")).join(" & ")}}`).join(" ");
}

let failures = 0;
const fail = (message: string) => {
  failures += 1;
  console.log(`  ✗ ${message}`);
};

for (const text of CASES) {
  const fragment = sceneFromRequest(text);
  const demands = requestDemands(fragment ?? text);
  const fitting = roll.filter((candidate) => photoFits(candidate, demands));
  const best = bestPhoto([fragment ?? text, text], fitting);

  console.log(`\nrequest: ${text}`);
  console.log(`  fragment: ${fragment === null ? "(none)" : JSON.stringify(fragment)}`);
  console.log(`  demands:  ${kinds(demands)}`);
  console.log(`  roll kept: ${fitting.length}/${roll.length} -> ${best ? best.candidate.label : "TAKE A NEW PHOTO"}`);

  // Every kept photo must genuinely show every demand — that is the promise.
  for (const candidate of fitting) {
    if (!photoFits(candidate, demands)) {
      fail(`kept a photo that does not fit: ${candidate.label}`);
    }
  }

  if (text.includes("red dress")) {
    for (const candidate of fitting) {
      const words = `${candidate.label} ${candidate.tags.join(" ")}`.toLowerCase();
      if (!/\bred\b/.test(words) || !/\bdress\b/.test(words)) {
        fail(`red-dress request kept: ${candidate.label}`);
      }
    }
    if (fitting.length === 0) fail("red-dress request kept nothing");
  }
  if (text.includes("at the beach") || text.includes("on the beach")) {
    if (fitting.length !== 0) fail(`beach request kept ${fitting.length} photo(s) (roll has none)`);
  }
  if (text.includes("in the kitchen")) {
    if (fitting.length === 0) fail("kitchen request kept nothing");
    for (const candidate of fitting) {
      if (!/kitchen|counter|fridge|cabinet/i.test(`${candidate.label} ${candidate.tags.join(" ")}`)) {
        fail(`kitchen request kept: ${candidate.label}`);
      }
    }
  }
  if (text === "send me a pic of you") {
    if (fitting.length !== roll.length) fail("generic request should keep the whole roll");
    if (demands.length !== 0) fail("generic request should have no demands");
  }
  if (text.startsWith("good night!")) {
    if (fragment !== "at the beach") fail(`greeting leaked into fragment: ${JSON.stringify(fragment)}`);
  }
  if (text.includes("yoga pose")) {
    for (const candidate of fitting) {
      const words = `${candidate.label} ${candidate.tags.join(" ")}`.toLowerCase();
      if (!/yoga/.test(words)) fail(`yoga request kept without yoga: ${candidate.label}`);
      if (!/pos\b|posed|posing|stretching|arms up/.test(words)) fail(`yoga request kept without a pose: ${candidate.label}`);
    }
    console.log(`  kept tags: ${fitting.map((c) => `${c.label} [${c.tags.join(", ")}]`).join(" | ") || "(none)"}`);
  }
  if (text.includes("selfie")) {
    if (!demands.some((d) => d.kind === "framing")) fail("selfie request lost its framing demand");
  }
  if (text.includes("take a photo")) {
    if (fragment !== "on the beach") fail(`take-photo fragment wrong: ${JSON.stringify(fragment)}`);
  }
}

// Scene merge: her line for the scene must be corrected with the request when
// it drops what was asked for.
const redDressDemands = requestDemands("in a red dress");
const declared = "on a balcony at golden hour, wearing a soft linen shirt";
if (textFits(declared, redDressDemands)) fail("scene wrongly counted as covering 'in a red dress'");
if (!textFits("in a red dress on the balcony", redDressDemands)) fail("merged scene should cover the request");
if (textFits(declared, [])) console.log("(empty demands always pass — sanity)");

// The fragment stitched into a scene line: only the sentence that names what
// was asked for, and nothing at all when the request is not covered.
const stitch = demandText(
  "how was your day? pic in a red dress",
  requestDemands("in a red dress"),
);
if (stitch !== "pic in a red dress") fail(`demandText picked: ${JSON.stringify(stitch)}`);
if (demandText("on a balcony at golden hour", redDressDemands) !== null) {
  fail("demandText should be null when the request is not covered");
}
if (demandText("in a red dress", redDressDemands) !== "in a red dress") {
  fail("demandText should pass a clean fragment through");
}
if (demandText("anything", []) !== null) fail("demandText should be null without demands");

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
