/**
 * Her side of a video call: which picture she is on, and where her face is on it.
 *
 * A video call is built from a still picture, so it needs two things only the
 * person watching can supply: the photo she appears in, and the two points that
 * make a still face move — her mouth, which opens when she talks, and her eyes,
 * which blink. Both are remembered per browser, per picture, so a call starts
 * the way it was left.
 */

import { FELICIA_GALLERY } from "@/lib/gallery";

const PICTURE_KEY = "felicia:camera-picture";
const FACE_KEY = "felicia:camera-face";
/** The mouth used to live alone under this key; still read so nothing is lost. */
const LEGACY_MOUTH_KEY = "felicia:camera-lips";

/** A point on the picture, in percent of its width and height. */
export type Point = { x: number; y: number };

export type Face = { mouth: Point; eyes: Point };

/**
 * Starting guesses for her portraits before anything has been tapped.
 *
 * Her pictures are head-and-shoulders frames, so the mouth sits a little below
 * the middle and the eyes a little above it. These are only a starting point —
 * the picture picker asks for one tap on each, which replaces them for good.
 */
export const DEFAULT_MOUTH: Point = { x: 50, y: 44 };
export const DEFAULT_EYES: Point = { x: 50, y: 33 };

function clampPoint(point: Partial<Point> | undefined, fallback: Point): Point {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
  };
}

/** The eye line sits a little above the mouth, at the same horizontal centre. */
function eyesAbove(mouth: Point): Point {
  return { x: mouth.x, y: Math.max(4, mouth.y - 11) };
}

export function defaultFace(): Face {
  return { mouth: DEFAULT_MOUTH, eyes: DEFAULT_EYES };
}

/** The gallery id she is on, or null when nothing has been chosen yet. */
export function readCameraPicture(): string | null {
  try {
    const id = window.localStorage.getItem(PICTURE_KEY);
    if (!id) return null;
    return FELICIA_GALLERY.some((photo) => photo.id === id) ? id : null;
  } catch {
    return null;
  }
}

export function saveCameraPicture(id: string) {
  try {
    window.localStorage.setItem(PICTURE_KEY, id);
  } catch {
    // A full or blocked localStorage just means the choice isn't remembered.
  }
}

/** Her face on one picture: tapped points if there are any, guesses if not. */
export function readFace(id: string): Face {
  try {
    const raw = window.localStorage.getItem(`${FACE_KEY}:${id}`);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<Face> | null;
      if (stored) {
        const mouth = clampPoint(stored.mouth, DEFAULT_MOUTH);
        return { mouth, eyes: clampPoint(stored.eyes, eyesAbove(mouth)) };
      }
    }

    // A mouth placed before her eyes were a thing still counts.
    const legacy = window.localStorage.getItem(`${LEGACY_MOUTH_KEY}:${id}`);
    if (legacy) {
      const [x, y] = legacy.split(",").map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const mouth = clampPoint({ x, y }, DEFAULT_MOUTH);
        return { mouth, eyes: eyesAbove(mouth) };
      }
    }
  } catch {
    // Fall through to the guesses.
  }
  return defaultFace();
}

/** Whether this picture has ever been aligned — false means never tapped. */
export function hasFace(id: string): boolean {
  try {
    return (
      window.localStorage.getItem(`${FACE_KEY}:${id}`) !== null ||
      window.localStorage.getItem(`${LEGACY_MOUTH_KEY}:${id}`) !== null
    );
  } catch {
    return false;
  }
}

export function saveFace(id: string, face: Face) {
  try {
    window.localStorage.setItem(`${FACE_KEY}:${id}`, JSON.stringify(face));
  } catch {
    // Same as above: the guesses stay in place for the next call.
  }
}
