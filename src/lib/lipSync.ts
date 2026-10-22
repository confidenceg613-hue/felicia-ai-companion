/**
 * Lip sync from her actual voice, entirely on this device and free.
 *
 * Her lines are already audio — Piper renders them locally, and the server voice
 * arrives as a file — so the truest way to move her mouth is to listen to that
 * sound rather than guess at a rhythm. The audio element is routed through an
 * AnalyserNode and its loudness is published on every frame: vowels open the
 * mouth, pauses close it, and the syllables land where she actually makes them.
 *
 * Nothing is sent anywhere and no service is called. If a browser refuses the
 * analyser (no Web Audio, or a suspended context), the level simply stays at
 * zero and the caller falls back to a procedural envelope while she speaks.
 */

type Listener = (level: number) => void;

let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
let samples: Float32Array<ArrayBuffer> | null = null;
let frame = 0;
let level = 0;

const listeners = new Set<Listener>();

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

function publish(next: number) {
  level = next;
  for (const listener of listeners) listener(next);
}

function tick() {
  frame = requestAnimationFrame(tick);
  if (!analyser || !samples) return;

  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);

  // Speech sits around 0.05–0.25 RMS. The gate throws away room noise and the
  // curve keeps the quiet consonants from snapping the mouth fully shut.
  const raw = Math.min(1, Math.max(0, (rms - 0.012) * 8.5));
  // Fast on the way up, slower on the way down: a mouth opens on the syllable
  // and closes as it fades, which is what stops it flapping.
  const blended = raw > level ? level * 0.35 + raw * 0.65 : level * 0.72 + raw * 0.28;
  publish(blended);
}

/** Follow one playing line. Safe to call again for the next line. */
export function startLipSync(audio: HTMLMediaElement) {
  const ctx = getContext();
  if (!ctx) return;

  try {
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.2;
      samples = new Float32Array(analyser.fftSize);
    }
    // An element can only ever be wired into one source node, so a new element
    // gets a new node and the old one is dropped.
    source?.disconnect();
    source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(ctx.destination);
  } catch {
    analyser = null;
    source = null;
    samples = null;
    return;
  }

  // A context built before a user gesture starts suspended; her voice would be
  // silence until it resumes, so ask every time.
  void ctx.resume?.().catch(() => undefined);
  if (!frame) frame = requestAnimationFrame(tick);
}

/** Stop following the audio and let the mouth settle shut. */
export function stopLipSync() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  try {
    source?.disconnect();
  } catch {
    // Already detached.
  }
  try {
    analyser?.disconnect();
  } catch {
    // Already detached.
  }
  source = null;
  analyser = null;
  samples = null;
  publish(0);
}

/** The current loudness, 0–1. For a frame loop that would rather not subscribe. */
export function readLipSyncLevel(): number {
  return level;
}

/** Watch the loudness. Returns the unsubscribe function. */
export function subscribeLipSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(level);
  return () => {
    listeners.delete(listener);
  };
}
