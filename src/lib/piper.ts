/**
 * Felicia's voice, spoken on the device by Piper — `en_US/sam/medium`.
 *
 * Piper is a free local text-to-speech engine: the voice model is downloaded
 * once (about 63 MB), kept in the browser's origin-private file system, and then
 * every line is phonemised and run through onnxruntime-web. Only the model is
 * cached for good — the WASM engines come from a public CDN on each cold load —
 * but no audio or text ever leaves the device and nothing is billed per word.
 *
 * The public piper-tts-web build only knows the voices it ships paths for, and
 * `sam` is not one of them, so this module registers sam's path in the library's
 * registry and seeds the two model files into the very cache the library reads
 * from (it keys cached files by file name). After that the library loads sam
 * like any other voice and never downloads the model again.
 */

import { playAudioUrl } from "@/lib/voice";

/** The Piper voice, in the library's hyphenated id form. */
const VOICE_ID = "en_US-sam-medium";
/** Where sam lives inside rhasspy/piper-voices (slash path of the model repo). */
const VOICE_PATH = "en/en_US/sam/medium/en_US-sam-medium.onnx";
const MODEL_FILE = "en_US-sam-medium.onnx";
const CONFIG_FILE = `${MODEL_FILE}.json`;
const MODEL_BASE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/sam/medium";
/** The directory the library stores downloaded voices in. */
const CACHE_DIR = "piper";

/** Progress for the one-time model download, in bytes. */
export type VoiceProgress = (loaded: number, total: number) => void;

/** The sliver of the origin-private file system this module needs. */
type FileHandle = {
  getFile: () => Promise<Blob>;
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};
type DirHandle = {
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FileHandle>;
};
type StorageWithDirectory = {
  getDirectory: () => Promise<{
    getDirectoryHandle: (
      name: string,
      options?: { create?: boolean },
    ) => Promise<DirHandle>;
  }>;
};

/** Just the part of a TtsSession this module uses. */
type PiperSession = { predict: (text: string) => Promise<Blob> };

let sessionPromise: Promise<PiperSession> | null = null;
/** Set once Piper has failed here, so every later line falls back quietly. */
let unavailable = false;

/**
 * Whether this browser can plausibly run Piper at all.
 *
 * Checked before any download: a browser without WebAssembly or the private
 * file system would only waste a 60 MB fetch learning that.
 */
export function piperSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const storage = navigator.storage as unknown as
    | StorageWithDirectory
    | undefined;
  return typeof WebAssembly !== "undefined" && Boolean(storage?.getDirectory);
}

async function cacheDir(): Promise<DirHandle | null> {
  try {
    const storage = navigator.storage as unknown as StorageWithDirectory;
    const root = await storage.getDirectory();
    return await root.getDirectoryHandle(CACHE_DIR, { create: true });
  } catch {
    return null;
  }
}

async function hasFile(dir: DirHandle, name: string): Promise<boolean> {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return file.size > 0;
  } catch {
    return false;
  }
}

/**
 * Fetch one file, reporting progress in throttled steps.
 *
 * Whole five-percent steps only: the toast that reads this must not be
 * re-rendered hundreds of times for a single download.
 */
async function download(
  url: string,
  onProgress?: VoiceProgress,
): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Piper voice download failed (${response.status}).`);
  }

  const total = Number(response.headers.get("content-length") ?? 0);
  const chunks: BlobPart[] = [];
  let loaded = 0;
  let reported = -1;

  const reader = response.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value as unknown as BlobPart);
      loaded += value.byteLength;
      const step = total > 0 ? Math.floor((loaded / total) * 20) : -1;
      if (step !== reported) {
        reported = step;
        onProgress?.(loaded, total);
      }
    }
  } else {
    const blob = await response.blob();
    chunks.push(blob);
    loaded = blob.size;
    onProgress?.(loaded, total || blob.size);
  }

  if (loaded === 0) throw new Error("Piper voice download came back empty.");
  return new Blob(chunks);
}

async function writeFile(dir: DirHandle, name: string, blob: Blob) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * sam's config, with the one field the library assumes.
 *
 * piper-tts-web reads `speaker_id_map` unconditionally, and sam's published
 * config omits it entirely — the model has no `sid` input, only `input`,
 * `input_lengths` and `scales`. An empty map is exactly what the library needs
 * to feed those three and nothing else, so the download is normalised here
 * rather than the model being silently unusable.
 */
async function loadConfig(): Promise<Blob> {
  const raw = await download(`${MODEL_BASE}/${CONFIG_FILE}`);
  const config = JSON.parse(await raw.text()) as Record<string, unknown>;
  if (
    !config.speaker_id_map ||
    typeof config.speaker_id_map !== "object" ||
    Array.isArray(config.speaker_id_map)
  ) {
    config.speaker_id_map = {};
  }
  return new Blob([JSON.stringify(config)], { type: "application/json" });
}

/** Download sam's model and config the first time; a no-op after that. */
async function ensureModel(onProgress?: VoiceProgress): Promise<void> {
  const dir = await cacheDir();
  if (!dir) throw new Error("This browser can't store Piper voices.");

  if (!(await hasFile(dir, MODEL_FILE))) {
    await writeFile(
      dir,
      MODEL_FILE,
      await download(`${MODEL_BASE}/${MODEL_FILE}`, onProgress),
    );
  }
  if (!(await hasFile(dir, CONFIG_FILE))) {
    await writeFile(dir, CONFIG_FILE, await loadConfig());
  }
}

async function buildSession(onProgress?: VoiceProgress): Promise<PiperSession> {
  const lib = await import("@realtimex/piper-tts-web");
  // Teach the library about sam before it looks the voice up. Without this it
  // refuses any id it has no bundled path for.
  const registry = lib.PATH_MAP as Record<string, string>;
  registry[VOICE_ID] = VOICE_PATH;

  await ensureModel(onProgress);
  // The model is in the cache now, so the library's own fetch is skipped.
  return (await lib.TtsSession.create({ voiceId: VOICE_ID })) as PiperSession;
}

function ensureSession(onProgress?: VoiceProgress): Promise<PiperSession> {
  if (!sessionPromise) {
    sessionPromise = buildSession(onProgress);
    // A failed session stays broken inside the library, so don't retry it.
    sessionPromise.catch(() => {
      unavailable = true;
    });
  }
  return sessionPromise;
}

/**
 * Start downloading / loading her voice ahead of the first reply.
 *
 * Safe to call repeatedly and from a click handler; failures are silent because
 * the chat still speaks with the server or device voice.
 */
export function warmPiper(onProgress?: VoiceProgress) {
  if (!piperSupported() || unavailable) return;
  void ensureSession(onProgress).catch(() => {});
}

/**
 * What Piper should read aloud.
 *
 * Her messages carry stage directions in asterisks and the odd markdown mark;
 * read literally those become noise ("asterisk smiles asterisk"), so they are
 * dropped before synthesis. Emphasis, not content, is all that is removed.
 */
function speechText(text: string): string {
  return text
    .replace(/\*[^*]{1,120}\*/g, " ")
    .replace(/[*_`#>~]+/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Speak one of her lines with the on-device Piper voice.
 *
 * Resolves `true` only when the audio actually played, so the caller can fall
 * back to the server voice and then the device voice. Any failure — no storage,
 * no WASM, a blocked download — disables Piper for the rest of the page so a
 * broken setup costs one attempt, not one per message.
 */
export async function speakWithPiper(
  text: string,
  onProgress?: VoiceProgress,
  onStart?: () => void,
): Promise<boolean> {
  const spoken = speechText(text);
  if (!spoken || !piperSupported() || unavailable) return false;

  try {
    const session = await ensureSession(onProgress);
    const wav = await session.predict(spoken);
    const url = URL.createObjectURL(wav);
    try {
      return await playAudioUrl(url, onStart);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    unavailable = true;
    return false;
  }
}
