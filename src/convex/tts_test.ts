"use node";

import { action } from "./_generated/server";
import { veniceApiKey } from "./config";

const VENICE_TTS_URL = "https://api.venice.ai/api/v1/audio/speech";
const VENICE_TTS_MODEL = "tts-kokoro";
const SAMPLE_TEXT =
  "Hey, I was just thinking about you. Say something warm and short.";

const VENICE_VOICES = ["af_sky", "af_heart", "af_bella"];

type Attempt = {
  voice: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  audioBytes: number | null;
  error: string | null;
};

/**
 * Diagnoses her voice: sends one line to Venice's text-to-speech with each of
 * the voices the app uses and reports what came back. Run it with
 * `bunx convex run tts_test:testVeniceTts`.
 */
export const testVeniceTts = action({
  args: {},
  handler: async () => {
    const apiKey = veniceApiKey();
    if (!apiKey) {
      return {
        configured: false,
        attempts: [],
        note: "No Venice key is set in this deployment's environment.",
      };
    }

    const attempts: Attempt[] = [];

    for (const voice of VENICE_VOICES) {
      let status: number | null = null;
      let contentType = "unknown";
      let audioBytes: number | null = null;
      let error: string | null = null;
      let ok = false;

      try {
        const response = await fetch(VENICE_TTS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: VENICE_TTS_MODEL,
            input: SAMPLE_TEXT,
            voice,
            response_format: "mp3",
          }),
        });

        status = response.status;
        contentType = response.headers.get("content-type") ?? "unknown";

        if (!response.ok) {
          const body = (await response.text()).slice(0, 400);
          error = `HTTP ${status}: ${body}`;
        } else if (contentType.includes("json")) {
          // Some TTS models answer with base64 in JSON instead of audio bytes.
          const payload = await response.text();
          const matched = /"audio(?:_base64)?"\s*:\s*"([^"]+)"/.exec(payload);
          audioBytes = matched?.[1]?.length ?? null;
          ok = (audioBytes ?? 0) > 0;
          if (!ok) error = `JSON payload without audio: ${payload.slice(0, 200)}`;
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
      model: VENICE_TTS_MODEL,
      attemptedCount: attempts.length,
      succeededCount: successful.length,
      firstSucceededVoice: successful[0]?.voice ?? null,
      attempts,
      summary:
        successful.length > 0
          ? `Venice TTS responded with audio for ${successful.length} voice(s). First: ${successful[0].voice}.`
          : firstFailure
            ? `Venice TTS did not return audio. First failing voice: ${firstFailure.voice}. ${firstFailure.error}`
            : "No attempts completed.",
    };
  },
});
