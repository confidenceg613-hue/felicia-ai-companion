/**
 * Puter.js image generation — the engine behind Felicia's selfies.
 *
 * The SDK is loaded once by a plain <script> in index.html and injects
 * `window.puter`, so there is no API key and nothing to configure per
 * deployment: the published site and the preview behave identically, which is
 * the whole reason to prefer it over the server-side generator.
 *
 * Everything here is deliberately loose about the result shape. The documented
 * example resolves to an <img> element, but the SDK has also shipped string and
 * array results across releases, and `image.src` is a `data:` URI or a hosted
 * URL depending on which provider Puter picked. So we only ever extract a
 * usable source — never the element itself.
 */

const PUTER_SCRIPT_SRC = "https://js.puter.com/v2/";

/** How long to wait for the SDK to appear before giving up. */
const LOAD_TIMEOUT_MS = 15_000;

/** How long one generation may run before the caller falls back to the server. */
const GENERATION_TIMEOUT_MS = 90_000;

type Txt2Img = (prompt: string) => Promise<unknown>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Inject the SDK if it is missing, and memoise the attempt.
 *
 * index.html normally loads it, so this is a safety net for a blocked tag or a
 * page that rendered before the script arrived — retrying is harmless, a
 * duplicate <script> is not, hence the single shared promise.
 */
let scriptPromise: Promise<void> | null = null;

function loadPuterScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PUTER_SCRIPT_SRC}"]`,
    );
    if (existing) {
      // The tag exists; it may simply not have executed yet.
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Puter failed to load.")),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = PUTER_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Puter failed to load."));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/** Resolve `puter.ai.txt2img`, kicking off the script load if necessary. */
async function waitForTxt2Img(): Promise<Txt2Img> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;

  const ready = () => window.puter?.ai?.txt2img;
  if (!ready()) void loadPuterScript().catch(() => undefined);

  while (Date.now() < deadline) {
    const fn = ready();
    if (fn) return fn;
    await delay(100);
  }

  throw new Error(
    "Puter isn't responding — her photo service can't be reached right now.",
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Pull an image source out of whatever the SDK resolved with.
 *
 * Accepts an <img> element, a URL string, an array of either, or an object
 * carrying `src`/`url` — so a provider change on Puter's side degrades into a
 * thrown error (and therefore the server-side fallback) rather than a crash.
 */
function imageSource(result: unknown): string {
  if (typeof result === "string" && result.length > 0) return result;

  if (Array.isArray(result)) {
    for (const item of result) {
      try {
        return imageSource(item);
      } catch {
        // Try the next candidate in the array.
      }
    }
    throw new Error("Puter returned an empty image list.");
  }

  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    for (const key of ["src", "url", "image"]) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }

  throw new Error("Puter returned no usable image.");
}

/**
 * Render a prompt into an image source (a `data:` URI or a hosted URL).
 *
 * Rejects — rather than hanging — if the SDK stalls, so the caller can fall
 * back to the server path instead of leaving the photo "developing" forever.
 */
export async function puterTextToImage(prompt: string): Promise<string> {
  const txt2img = await waitForTxt2Img();
  const result = await withTimeout(
    txt2img(prompt),
    GENERATION_TIMEOUT_MS,
    "Puter took too long to render that photo.",
  );
  return imageSource(result);
}

/**
 * What we hand to the server to persist.
 *
 * A `data:` URI is decoded here — no network needed. A hosted URL is passed
 * through untouched so the Convex action can download it server-side, which
 * sidesteps CORS entirely: these images are served from whatever bucket the
 * chosen provider used, and browsers may refuse a cross-origin fetch of them.
 */
export type ImagePayload =
  | { kind: "bytes"; bytes: ArrayBuffer; mimeType: string }
  | { kind: "url"; url: string };

/**
 * Normalise to a bare `ArrayBuffer`, which is what Convex's bytes validator
 * wants — and a Uint8Array view over a larger buffer would otherwise hand over
 * more bytes than were actually decoded.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }
  return bytes.slice().buffer as ArrayBuffer;
}

function decodeDataUri(dataUri: string): ImagePayload {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUri);
  if (!match) throw new Error("Puter returned malformed image data.");

  const mimeType = match[1] || "image/png";
  const payload = match[3];

  if (!match[2]) {
    const encoded = new TextEncoder().encode(decodeURIComponent(payload));
    return { kind: "bytes", bytes: toArrayBuffer(encoded), mimeType };
  }

  const binary = window.atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { kind: "bytes", bytes: toArrayBuffer(bytes), mimeType };
}

export function toImagePayload(src: string): ImagePayload {
  if (src.startsWith("data:")) return decodeDataUri(src);
  if (/^https?:\/\//i.test(src)) return { kind: "url", url: src };
  throw new Error("Puter returned an unusable image source.");
}
