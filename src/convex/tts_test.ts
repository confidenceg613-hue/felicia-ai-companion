"use node";

import { action } from "./_generated/server";

const GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech";
const GROQ_TTS_MODEL = "canopylabs/orpheus-v1-english";
const SAMPLE_TEXT =
  "Hey, I was just thinking about you. Say something warm and short.";

const GROQ_VOICES = ["hannah", "diana", "autumn"];

type Attempt = {
  voice: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  audioBytes: number | null;
  error: string | null;
};

export const testGroqTts = action({
  args: {},
  handler: async () => {
    const apiKey = process.env.GROQ_API_KEY;
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
