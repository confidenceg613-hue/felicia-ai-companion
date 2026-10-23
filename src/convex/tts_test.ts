"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { groqApiKey } from "./config";
import { splitForSpeech } from "../lib/speech";

const GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech";
const GROQ_TTS_MODEL = "canopylabs/orpheus-v1-english";
const SAMPLE_TEXT =
  "Hey, I was just thinking about you. Say something warm and short.";

const GROQ_VOICES = ["hannah", "diana", "autumn"];

/** A typical reply of hers, with the emoji and punctuation she really uses. */
const SAMPLE_REPLY =
  "I know 😌 it is late here too. I was just replaying that voice note you " +
  "sent me — you always sound like you're smiling when you're tired. Go and " +
  "sleep, and I'll be right here when you wake up. ❤️";

/** Does this start with a RIFF/WAVE header, i.e. will a browser play it? */
function isWav(bytes: Uint8Array): boolean {
  const tag = (at: number) =>
    String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  return bytes.byteLength > 44 && tag(0) === "RIFF" && tag(8) === "WAVE";
}

type Attempt = {
  voice: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  audioBytes: number | null;
  error: string | null;
};

/**
 * Walks the exact path the video call walks when she speaks: cut her line into
 * pieces, render each piece with her voice, resolve a playable URL for it, and
 * fetch that URL the way the browser's <audio> element would.
 *
 * Run it with `bunx convex run tts_test:testSpeechPipeline '{...}'`. Rendered
 * test files are deleted again so the deployment's storage stays clean.
 */
export const testSpeechPipeline = internalAction({
  args: {
    reply: v.optional(v.string()),
    keep: v.optional(v.boolean()),
    cleanup: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, { reply, keep, cleanup }) => {
    // Storage ids from an earlier `keep` run, so a browser check can borrow the
    // files and then hand them back to be deleted.
    for (const id of cleanup ?? []) await ctx.storage.delete(id);
    const line = (reply ?? SAMPLE_REPLY).trim();
    const pieces = splitForSpeech(line);
    const results: Array<Record<string, unknown>> = [];

    for (let index = 0; index < pieces.length; index += 1) {
      const text = pieces[index];
      const startedAt = Date.now();

      let storageId: string | null = null;
      let url: string | null = null;
      let status: number | null = null;
      let contentType: string | null = null;
      let cors: string | null = null;
      let bytes = 0;
      let playable = false;
      let error: string | null = null;

      try {
        const audioId = await ctx.runAction(internal.groq.speak, { text });
        storageId = audioId ?? null;
        if (!audioId) throw new Error("groq.speak returned no audio");
        url = await ctx.storage.getUrl(audioId);
        if (!url) throw new Error("storage.getUrl returned null");

        const response = await fetch(url);
        status = response.status;
        contentType = response.headers.get("content-type");
        cors = response.headers.get("access-control-allow-origin");
        const body = new Uint8Array(await response.arrayBuffer());
        bytes = body.byteLength;
        playable = response.ok && isWav(body);

        if (!keep) await ctx.storage.delete(audioId);
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }

      results.push({
        index,
        text,
        characters: text.length,
        ms: Date.now() - startedAt,
        storageId,
        status,
        contentType,
        cors,
        url: keep ? url : null,
        bytes,
        playable,
        error,
      });
    }

    const spoken = results.filter((r) => r.playable === true);
    return {
      line,
      pieceCount: pieces.length,
      spokenCount: spoken.length,
      firstPieceMs: results[0]?.ms ?? null,
      allPiecesMs: results.reduce((sum, r) => sum + Number(r.ms ?? 0), 0),
      results,
      summary:
        spoken.length === pieces.length
          ? `All ${pieces.length} piece(s) rendered to playable audio; she starts after ${String(results[0]?.ms)}ms.`
          : `${pieces.length - spoken.length} of ${pieces.length} piece(s) produced no playable audio.`,
    };
  },
});

/**
 * Diagnoses her voice: sends one line to Groq's Orpheus TTS with each of the
 * voices the app uses and reports what came back. Run it with
 * `bunx convex run tts_test:testGroqTts`.
 */
export const testGroqTts = action({
  args: {},
  handler: async () => {
    const apiKey = groqApiKey();
    if (!apiKey) {
      return {
        configured: false,
        attempts: [],
        note: "GROQ_API_KEY is not set in this deployment's environment.",
      };
    }

    const attempts: Attempt[] = [];

    for (const voice of GROQ_VOICES) {
      let status: number | null = null;
      let contentType = "unknown";
      let audioBytes: number | null = null;
      let error: string | null = null;
      let ok = false;

      try {
        const response = await fetch(GROQ_TTS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: GROQ_TTS_MODEL,
            input: SAMPLE_TEXT,
            voice,
            response_format: "wav",
          }),
        });

        status = response.status;
        contentType = response.headers.get("content-type") ?? "unknown";

        if (!response.ok) {
          const body = (await response.text()).slice(0, 400);
          error = `HTTP ${status}: ${body}`;
        } else {
          const buffer = await response.arrayBuffer();
          audioBytes = buffer.byteLength;
          ok = audioBytes > 0;
          if (!ok) error = "Empty audio payload";
        }
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }

      attempts.push({ voice, ok, status, contentType, audioBytes, error });
    }

    const successful = attempts.filter((a) => a.ok);
    const firstFailure = attempts.find((a) => !a.ok);

    return {
      configured: true,
      sampleText: SAMPLE_TEXT,
      model: GROQ_TTS_MODEL,
      attemptedCount: attempts.length,
      succeededCount: successful.length,
      firstSucceededVoice: successful[0]?.voice ?? null,
      attempts,
      summary:
        successful.length > 0
          ? `Groq TTS responded with audio for ${successful.length} voice(s). First: ${successful[0].voice}.`
          : firstFailure
            ? `Groq TTS did not return audio. First failing voice: ${firstFailure.voice}. ${firstFailure.error}`
            : "No attempts completed.",
    };
  },
});
