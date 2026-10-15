/**
 * How long a photo develops before it is revealed.
 *
 * Felicia's picture is held back until it has finished generating, been fully
 * decoded by the browser, and is at least this old — so nothing ever appears
 * half-rendered.
 */
export const DEVELOP_MS = 6000;

/** Resolve once the browser has decoded the image, not merely downloaded it. */
export function preloadImage(url: string) {
  return new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
  });
}
