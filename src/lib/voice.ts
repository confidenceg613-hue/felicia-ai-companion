/**
 * Browser voice helpers for calling Felicia.
 *
 * Two jobs live here:
 *  - playing audio that the server synthesised (her real voice), and
 *  - the on-device fallbacks, so a call still works when Cloudflare's neuron
 *    budget is spent: the device's own speech synthesis for her, and the
 *    browser's speech recognition for you.
 */

import { startLipSync, stopLipSync } from "@/lib/lipSync";

// ---------------------------------------------------------------------------
// Server-rendered audio
// ---------------------------------------------------------------------------

/**
 * Play a synthesised clip, resolving `true` only if it actually played through.
 * A blocked autoplay or a bad URL resolves `false` so the caller can fall back
 * to the device voice instead of sitting in silence.
 *
 * `onStart` fires the moment sound really begins — after any synthesis and
 * buffering — which is what a video call needs to move her lips in time with
 * her voice rather than while the model is still thinking.
 *
 * While the line plays, the element is fed to the lip-sync analyser so her mouth
 * follows the actual syllables. A tainted cross-origin file cannot be analysed,
 * and an element is silent once it is routed that way, so a first attempt that
 * fails is retried as plain playback — audible lips or none, she always speaks.
 */
export function playAudioUrl(
  url: string,
  onStart?: () => void,
): Promise<boolean> {
  return playOnce(url, onStart, true).then((played) => {
    if (played) return true;
    return playOnce(url, onStart, false);
  });
}

function playOnce(
  url: string,
  onStart: (() => void) | undefined,
  analyse: boolean,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const audio = new Audio();
    if (analyse && /^https?:/i.test(url) && !url.startsWith(window.location.origin)) {
      audio.crossOrigin = "anonymous";
    }
    audio.src = url;
    let settled = false;
    const finish = (played: boolean) => {
      if (settled) return;
      settled = true;
      stopLipSync();
      resolve(played);
    };

    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);

    const started = audio.play();
    if (started && typeof started.then === "function") {
      started
        .then(() => {
          if (analyse) startLipSync(audio);
          onStart?.();
        })
        .catch(() => finish(false));
    } else {
      if (analyse) startLipSync(audio);
      onStart?.();
    }

    // Safety net: never leave the call waiting on an audio element that stalls.
    setTimeout(() => finish(audio.ended || !audio.paused), 60000);
  });
}

// ---------------------------------------------------------------------------
// On-device speech synthesis
// ---------------------------------------------------------------------------

export function browserSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Voices load asynchronously in some browsers; nudge them awake early.
 * Idempotent, so opening the call repeatedly doesn't stack listeners.
 */
let voicesPrimed = false;
export function primeVoices() {
  if (voicesPrimed || !browserSpeechSupported()) return;
  voicesPrimed = true;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    window.speechSynthesis.getVoices();
  });
}

const FEMININE_HINTS =
  /female|samantha|victoria|karen|moira|tessa|zira|aria|jenny|michelle|serena|allison|ava|joanna|salli|amy|emma|olivia|sophie/i;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const english = voices.filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : voices;
  return (
    pool.find((voice) => FEMININE_HINTS.test(voice.name)) ?? pool[0] ?? null
  );
}

/** Speak with the device voice. Resolves when speech ends. */
export function speakWithBrowser(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const spoken = text.trim();
    if (!browserSpeechSupported() || !spoken) {
      resolve();
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(spoken);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1.02;
    utterance.pitch = 1.05;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    utterance.onend = finish;
    utterance.onerror = finish;

    // `onend` is unreliable on some platforms, so bound the wait roughly by
    // how long the sentence should take to read.
    setTimeout(finish, Math.min(60000, 2000 + spoken.length * 90));

    synth.speak(utterance);
  });
}

export function stopBrowserSpeech() {
  if (browserSpeechSupported()) window.speechSynthesis.cancel();
}

// ---------------------------------------------------------------------------
// On-device speech recognition
// ---------------------------------------------------------------------------

export interface RecognitionAlternative {
  transcript: string;
}
export interface RecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: RecognitionAlternative;
}
export interface RecognitionResultList {
  readonly length: number;
  [index: number]: RecognitionResult;
}
export interface RecognitionEvent extends Event {
  resultIndex: number;
  results: RecognitionResultList;
}
export interface RecognitionErrorEvent extends Event {
  error: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Chrome/Edge need the `webkit` prefix; Firefox has no implementation at all. */
export function createSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  const Ctor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/**
 * Whether the browser ships a recogniser at all.
 *
 * Checks for the constructor without instantiating one — this is called during
 * render, and building a throwaway recogniser on every render is wasteful.
 */
export function hasSpeechRecognition(): boolean {
  if (typeof window === "undefined") return false;
  const scope = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(scope.SpeechRecognition ?? scope.webkitSpeechRecognition);
}

export function speechRecognitionSupported(): boolean {
  return hasSpeechRecognition();
}

export interface ListenResult {
  text: string | null;
  /** Set when recognition failed in a way that should stop the call. */
  fatal?: string;
}

/**
 * Listen for a single utterance and resolve with what was heard.
 *
 * Recognisers fire `onend` after every utterance, so this settles on whichever
 * of "final result", "error" or "end" arrives first.
 */
export function listenOnce(
  onInterim: (text: string) => void,
): { promise: Promise<ListenResult>; abort: () => void } {
  const recognition = createSpeechRecognition();
  if (!recognition) {
    return {
      promise: Promise.resolve({
        text: null,
        fatal: "This browser can't listen. Type to her instead.",
      }),
      abort: () => {},
    };
  }

  let settled = false;
  let finalText = "";
  let fatal: string | undefined;

  const promise = new Promise<ListenResult>((resolve) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
      resolve({ text: finalText.trim() || null, fatal });
    };

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alternative = result?.[0];
        if (!alternative) continue;
        if (result.isFinal) finalText += alternative.transcript;
        else partial += alternative.transcript;
      }
      onInterim(partial);
      if (finalText.trim()) finish();
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        fatal = "Microphone access is blocked. Type to her instead.";
      } else if (event.error === "audio-capture") {
        fatal = "No microphone found. Type to her instead.";
      }
      finish();
    };

    recognition.onend = finish;

    try {
      recognition.start();
    } catch {
      finish();
    }
  });

  return {
    promise,
    abort: () => {
      try {
        recognition.abort();
      } catch {
        // Nothing to abort.
      }
      settled = true;
    },
  };
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Hold-to-talk voice messages
// ---------------------------------------------------------------------------

/**
 * Start transcribing while a button is held, and settle when it is released.
 *
 * Voice messages in a companion app are press-and-hold: you talk, you let go,
 * the words send. Recognition is entirely on-device, so a voice message costs
 * nothing and never leaves the browser — the transcript simply becomes a normal
 * message that Felicia replies to.
 */
export function beginVoiceNote(onInterim: (text: string) => void): {
  /** Whether this browser can record a voice message at all. */
  supported: boolean;
  /** Release the button. Resolves with everything that was said, or `null`. */
  end: () => Promise<string | null>;
  /** Abandon the recording without sending anything. */
  cancel: () => void;
} {
  const recognition = createSpeechRecognition();
  if (!recognition) {
    return { supported: false, end: async () => null, cancel: () => {} };
  }

  let finalText = "";
  let settled = false;
  let settleWith: (text: string | null) => void = () => {};
  const finished = new Promise<string | null>((resolve) => {
    settleWith = resolve;
  });

  const settle = (text: string | null) => {
    if (settled) return;
    settled = true;
    settleWith(text);
  };

  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let partial = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const alternative = result?.[0];
      if (!alternative) continue;
      if (result.isFinal) finalText += `${alternative.transcript} `;
      else partial += alternative.transcript;
    }
    onInterim(`${finalText}${partial}`.trim());
  };

  recognition.onerror = () => settle(finalText.trim() || null);
  recognition.onend = () => settle(finalText.trim() || null);

  // Safety net: a recogniser that never fires `onend` must not leave the
  // composer stuck in a recording state forever.
  const guard = setTimeout(() => settle(finalText.trim() || null), 60000);

  try {
    recognition.start();
  } catch {
    clearTimeout(guard);
    settle(null);
  }

  return {
    supported: true,
    end: () => {
      clearTimeout(guard);
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
      // Give `onend` a beat, then settle with whatever we have either way.
      setTimeout(() => settle(finalText.trim() || null), 350);
      return finished;
    },
    cancel: () => {
      clearTimeout(guard);
      try {
        recognition.abort();
      } catch {
        // Nothing to abort.
      }
      settle(null);
    },
  };
}
