"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

const VENICE_TTS_URL = "https://api.venice.ai/api/v1/audio/speech";
const VENICE_TTS_MODEL = "tts-kokoro";
const SAMPLE_TEXT =
  "Hey, I was just thinking about you. Say something warm and short.";

const VENICE_VOICES = [
  "af_bella",
  "af_heart",
  "af_jadzia",
  "af_sky",
  "af_alloy",
  "af_aoede",
  "af_nicole",
  "af_nova",
  "af_river",
  "af_sarah",
  "af_jessica",
  "af_kore",
];

type Attempt = {
  voice: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  audioBytes: number | null;
  error: string | null;
};

export const testVeniceTts = action({
  args: {},
  handler: async () => {
    const apiKey = process.env.VENICE_API_KEY;
    if (!apiKey) {
      return {
        configured: false,
        attempts: [],
        note: "VENICE_API_KEY is not set in this deployment's environment.",
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
            speed: 1.02,
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
