import { subscribeLipSync } from "@/lib/lipSync";
import { useEffect, useRef } from "react";

/**
 * The mouth that makes a clip look like she is the one talking.
 *
 * Her camera can be a recorded clip, and a clip is silent in the call — her
 * voice comes from the text-to-speech render. Without anything else, a loop of
 * her looking at the camera while a voice comes out of it reads as a video
 * playing behind a phone call. This puts a mouth where her lips are and opens
 * it with the actual loudness of her voice, so the sound and the movement are
 * the same event.
 *
 * It is invisible while she is quiet, so her real lips are never covered up
 * when she is not speaking, and it is positioned by the caller, who knows where
 * her lips sit in the picture.
 */
export function ClipMouth({
  x,
  y,
  size,
  talking,
}: {
  /** Centre of the mouth, in pixels inside the feed. */
  x: number;
  y: number;
  /** Width of the mouth at rest, in pixels. */
  size: number;
  /** True while her voice is actually audible. */
  talking: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const speakingRef = useRef(talking);
  const levelRef = useRef(0);
  const lastLoudRef = useRef(0);

  useEffect(() => {
    speakingRef.current = talking;
  }, [talking]);

  // Her real loudness, sampled while the line plays.
  useEffect(
    () =>
      subscribeLipSync((value) => {
        levelRef.current = value;
        if (value > 0.03) lastLoudRef.current = performance.now();
      }),
    [],
  );

  /**
   * The frame loop writes styles directly.
   *
   * A mouth that re-renders sixty times a second is a stutter waiting to
   * happen, so nothing here touches React state. When the analyser is missing
   * (a refused audio context), the mouth still moves on an envelope, because
   * a still face with a voice over it is worse than an approximate one.
   */
  useEffect(() => {
    let frame = 0;

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const node = ref.current;
      if (!node) return;

      const now = performance.now();
      const speaking = speakingRef.current;
      const analysed = now - lastLoudRef.current < 700;
      const synthetic =
        0.3 +
        0.26 * Math.abs(Math.sin(now / 190)) +
        0.12 * Math.abs(Math.sin(now / 71));
      const open = speaking ? (analysed ? levelRef.current : synthetic) : 0;

      // Fully transparent when she is not speaking: her own lips are under
      // this, and a faint dark spot on them is worse than no overlay at all.
      node.style.opacity = open > 0.02 ? String(0.06 + open * 0.74) : "0";
      node.style.transform =
        `translate(-50%, -50%) scale(${(0.9 + open * 0.22).toFixed(3)}, ` +
        `${(0.18 + open * 1.5).toFixed(3)})`;
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute rounded-[50%] bg-[#3b1512] blur-[1.4px]"
      style={{
        left: x,
        top: y,
        width: size,
        height: Math.max(5, size * 0.38),
        transform: "translate(-50%, -50%)",
        opacity: 0,
      }}
    />
  );
}
