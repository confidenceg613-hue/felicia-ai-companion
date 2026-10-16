import { api } from "@/convex/_generated/api";
import { puterTextToImage, toImagePayload } from "@/lib/puter";
import { useAction } from "convex/react";
import { useCallback } from "react";

/** Where the selfie actually came from — useful in toasts and debugging. */
export type SelfieResult = {
  url: string | null;
  via: "puter" | "horde";
};

/**
 * Generate a photo of Felicia for the signed-in user.
 *
 * Puter.js is the first choice: it runs in the browser with no API key, so it
 * works identically in the preview and on the published site, and its prompt is
 * built on the server from her Appearance note — the same locked face the
 * server-side generator uses, so the same woman turns up either way.
 *
 * Anything that goes wrong on the Puter path (blocked script, rate limit, a
 * stalled render, an image the browser can't hand back) falls through to the
 * server-side generator instead of surfacing an error, because a selfie that
 * arrives a little later still beats no selfie.
 */
export function useSelfie() {
  const selfiePrompt = useAction(api.felicia.selfiePrompt);
  const saveSelfie = useAction(api.felicia.saveSelfie);
  const generatePhoto = useAction(api.felicia.generatePhoto);

  return useCallback(
    async (scene: string): Promise<SelfieResult> => {
      try {
        const { prompt, scene: resolved } = await selfiePrompt({ scene });
        const src = await puterTextToImage(prompt);
        const saved = await saveSelfie({
          scene: resolved,
          prompt,
          image: toImagePayload(src),
        });
        return { url: saved.url, via: "puter" };
      } catch {
        const result = await generatePhoto({ scene });
        return { url: result.url, via: "horde" };
      }
    },
    [selfiePrompt, saveSelfie, generatePhoto],
  );
}
