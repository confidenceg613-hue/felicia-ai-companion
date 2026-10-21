/**
 * Her side of a video call: which picture she is on, and where her lips are.
 *
 * A video call is built from a still picture, so it needs two things that only
 * the person on the other end can supply: the photo she appears in, and the
 * point on that photo where her mouth is — that is what moves when she talks.
 * Both are remembered per browser so a call starts the way it was left.
 */

import { FELICIA_GALLERY } from "@/lib/gallery";

const PICTURE_KEY = "felicia:camera-picture";
const LIPS_KEY = "felicia:camera-lips";

/** A point on the picture, in percent of its width and height. */
export type Lips = { x: number; y: number };

/**
 * Where a mouth usually sits on her portraits.
 *
 * Her pictures are head-and-shoulders frames, so the mouth lands a little below
 * the middle of the frame. It is only a starting point: the album's picture
 * picker asks you to tap her lips, which replaces this with something exact.
 */
export const DEFAULT_LIPS: Lips = { x: 50, y: 44 };

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

/** Where her lips are on one picture. */
export function readLips(id: string): Lips {
  try {
    const raw = window.localStorage.getItem(`${LIPS_KEY}:${id}`);
    if (!raw) return DEFAULT_LIPS;
    const [x, y] = raw.split(",").map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return DEFAULT_LIPS;
    return {
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
    };
  } catch {
    return DEFAULT_LIPS;
  }
}

/** Whether this picture has ever been aligned — false means never tapped. */
export function hasLips(id: string): boolean {
  try {
    return window.localStorage.getItem(`${LIPS_KEY}:${id}`) !== null;
  } catch {
    return false;
  }
}

export function saveLips(id: string, lips: Lips) {
  try {
    window.localStorage.setItem(
      `${LIPS_KEY}:${id}`,
      `${lips.x.toFixed(2)},${lips.y.toFixed(2)}`,
    );
  } catch {
    // Same as above: the default stays in place for the next call.
  }
}
