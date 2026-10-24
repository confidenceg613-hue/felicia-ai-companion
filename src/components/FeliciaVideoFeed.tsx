import type { Face } from "@/lib/feliciaCamera";
import { subscribeLipSync } from "@/lib/lipSync";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Blink length, in milliseconds. A real blink is quicker than it feels. */
const BLINK_MS = 120;

/**
 * Her camera feed on a video call.
 *
 * There is no video of her, so this is built from one of her pictures and made
 * to behave like a face rather than a poster: it breathes, leans in and away,
 * follows your cursor a little the way eyes do, blinks on an uneven rhythm,
 * smiles, and — several times a minute, when the conversation has earned it —
 * flirts: a head tilt, a blush, a wink.
 *
 * Her lips are driven by her actual voice. The audio element is analysed on
 * device (see lib/lipSync), and the loudness opens and closes her mouth on the
 * real syllables; when the analyser isn't available the fallback is a soft
 * procedural envelope, so she still mouths the line instead of freezing.
 *
 * The picture is drawn with `object-contain`, which leaves bars around it on a
 * tall screen, so the mouth and eye positions (percentages of the picture) are
 * converted into pixels here from the measured box. That keeps her face on her
 * face at every screen size instead of assuming the picture fills the frame.
 */
export function FeliciaVideoFeed({
  url,
  previewUrl,
  speaking,
  face,
  className,
}: {
  url: string;
  /**
   * A small copy of the same picture, served from the app itself (~20 KB).
   *
   * Her full picture is a multi-megabyte upload on an external host, which is
   * the one thing that could leave the call staring at an empty frame. The
   * local copy is painted first and the full one replaces it as soon as it has
   * decoded — same crop, same face, just softer for a moment.
   */
  previewUrl?: string;
  /** True while her voice is playing — that is when her lips move. */
  speaking: boolean;
  /** Where her mouth and eyes are on this picture. */
  face: Face | null;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 3, height: 4 });

  const mouthRef = useRef<HTMLSpanElement>(null);
  const smileRef = useRef<HTMLSpanElement>(null);
  const blushLeftRef = useRef<HTMLSpanElement>(null);
  const blushRightRef = useRef<HTMLSpanElement>(null);
  const leftLidRef = useRef<HTMLSpanElement>(null);
  const rightLidRef = useRef<HTMLSpanElement>(null);
  const leanRef = useRef<HTMLDivElement>(null);

  // Animation state lives in refs: it is written every frame by hand rather
  // than through React, because a mouth that re-renders sixty times a second is
  // a stutter waiting to happen.
  const levelRef = useRef(0);
  const lastLoudRef = useRef(0);
  const speakingRef = useRef(speaking);
  const blinkUntilRef = useRef(0);
  const winkUntilRef = useRef(0);
  const winkSideRef = useRef(-1);
  const flirtRef = useRef(0);
  const flirtTargetRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });

  const faceRef = useRef(face);
  const boxSizeRef = useRef({
    width: 0,
    height: 0,
    imageWidth: 0,
    imageHeight: 0,
    offsetX: 0,
    offsetY: 0,
  });

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  // The feed is laid out by flexbox, so its size changes with the viewport and
  // with the safe-area insets on a phone. Measuring it is cheaper and far more
  // reliable than guessing an aspect ratio in CSS.
  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const measure = () =>
      setBox({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    faceRef.current = face;
  }, [face]);

  // Loudness from her voice. A peak is remembered so the caller can tell "quiet
  // pause in an analysed line" from "no analyser at all".
  useEffect(
    () =>
      subscribeLipSync((value) => {
        levelRef.current = value;
        if (value > 0.03) lastLoudRef.current = performance.now();
      }),
    [],
  );

  /**
   * The blink, and the double blink.
   *
   * At an even interval it reads as a mechanism, so every gap is a fresh random
   * one, and one blink in four comes as a double. The timer schedules only the
   * next blink, which keeps a tab in the background from piling them up.
   */
  useEffect(() => {
    let next: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      next = setTimeout(
        () => {
          if (cancelled) return;
          blinkUntilRef.current = performance.now() + BLINK_MS;
          if (Math.random() < 0.25) {
            next = setTimeout(() => {
              if (cancelled) return;
              blinkUntilRef.current = performance.now() + BLINK_MS;
              schedule();
            }, 180 + BLINK_MS);
            return;
          }
          schedule();
        },
        2400 + Math.random() * 4600,
      );
    };

    schedule();

    return () => {
      cancelled = true;
      clearTimeout(next);
    };
  }, []);

  /**
   * The flirt beat.
   *
   * Every so often — and only when she isn't mid-sentence — she leans in, smiles
   * wider, blushes a little and winks. It is scheduled rather than constant so
   * it reads as her doing it, not as a loop the picture is stuck in.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      timer = setTimeout(
        () => {
          if (cancelled) return;
          if (!speakingRef.current) {
            flirtTargetRef.current = 1;
            winkSideRef.current = Math.random() < 0.5 ? -1 : 1;
            winkUntilRef.current = performance.now() + 460;
            settle = setTimeout(() => {
              flirtTargetRef.current = 0;
              if (!cancelled) schedule();
            }, 2600 + Math.random() * 1600);
            return;
          }
          schedule();
        },
        9000 + Math.random() * 9000,
      );
    };

    schedule();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(settle);
    };
  }, []);

  // -------------------------------------------------------------------------
  // The frame loop: her mouth, her lids, her lean.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let frame = 0;

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const seconds = now / 1000;
      const currentFace = faceRef.current;
      if (!currentFace) return;

      const { width, imageWidth, imageHeight } = boxSizeRef.current;
      if (width === 0 || imageWidth === 0) return;

      const isSpeaking = speakingRef.current;
      const live = levelRef.current;
      // Analysed audio goes quiet between words; the analyser is only "absent"
      // once it has been silent for far longer than a breath.
      const analysed = now - lastLoudRef.current < 700;
      const synthetic =
        0.28 +
        0.26 * Math.abs(Math.sin(seconds * 8.7)) +
        0.12 * Math.abs(Math.sin(seconds * 19.3));
      const open = isSpeaking ? (analysed ? live : synthetic) : 0;

      // Mouth: a small dark opening that widens with the syllable and a lip
      // line that curves up into her smile.
      const smile = Math.min(1, 0.15 + flirtRef.current * 0.7 + (open > 0.1 ? 0.1 : 0));
      const mouth = mouthRef.current;
      if (mouth) {
        const sx = 0.92 + open * 0.2 + smile * 0.16;
        const sy = 0.16 + open * 1.55;
        mouth.style.transform = `translate(-50%, -50%) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
        mouth.style.opacity = String(0.06 + open * 0.72);
      }

      const smileLine = smileRef.current;
      if (smileLine) {
        const curve = 0.55 + smile * 0.75;
        smileLine.style.transform = `translate(-50%, -50%) scale(${(0.86 + smile * 0.3).toFixed(3)}, ${curve.toFixed(3)})`;
        smileLine.style.opacity = String(0.04 + smile * 0.4);
      }

      // Cheeks: warmth, not paint. Only the flirt beat brings it up.
      const blush = flirtRef.current;
      for (const ref of [blushLeftRef, blushRightRef]) {
        if (ref.current) ref.current.style.opacity = String(blush * 0.5);
      }

      // Lids: blink is both eyes, a wink is one.
      const blink = now < blinkUntilRef.current ? 1 : 0;
      const winking = now < winkUntilRef.current;
      const squint = smile > 0.5 ? (smile - 0.5) * 0.5 : 0;
      const closure = (side: number) => {
        const wink = winking && winkSideRef.current === side ? 1 : 0;
        return Math.max(blink, wink, squint);
      };
      for (const [ref, side] of [
        [leftLidRef, -1],
        [rightLidRef, 1],
      ] as const) {
        if (!ref.current) continue;
        const shut = closure(side);
        ref.current.style.transform = `translate(-50%, -50%) scaleY(${(0.12 + shut * 0.88).toFixed(3)})`;
        ref.current.style.opacity = String(0.06 + shut * 0.56);
      }

      // Lean: towards you when she flirts, and a soft drift with the pointer so
      // she seems to be looking at the person rather than past them.
      flirtRef.current += (flirtTargetRef.current - flirtRef.current) * 0.06;
      const pointer = pointerRef.current;
      const bob = isSpeaking ? Math.sin(seconds * 7.1) * 1.1 : Math.sin(seconds * 1.3) * 0.8;
      const lean = leanRef.current;
      if (lean) {
        lean.style.transform =
          `translate3d(${pointer.x.toFixed(2)}px, ${(pointer.y + bob + flirtRef.current * 5).toFixed(2)}px, 0) ` +
          `scale(${(1 + flirtRef.current * 0.045).toFixed(4)})`;
      }

      // Keep her mouth sized to the measured picture.
      if (mouth) {
        mouth.style.width = `${Math.max(14, imageWidth * 0.085)}px`;
        mouth.style.height = `${Math.max(6, imageWidth * 0.032)}px`;
        mouth.style.top = `${boxSizeRef.current.offsetY + (currentFace.mouth.y / 100) * imageHeight}px`;
        mouth.style.left = `${boxSizeRef.current.offsetX + (currentFace.mouth.x / 100) * imageWidth}px`;
      }
      if (smileLine) {
        smileLine.style.width = `${Math.max(18, imageWidth * 0.11)}px`;
        smileLine.style.height = `${Math.max(5, imageWidth * 0.03)}px`;
        smileLine.style.top = `${boxSizeRef.current.offsetY + (currentFace.mouth.y / 100) * imageHeight + imageWidth * 0.012}px`;
        smileLine.style.left = `${boxSizeRef.current.offsetX + (currentFace.mouth.x / 100) * imageWidth}px`;
      }
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const fitted =
    box.width > 0 && box.height > 0
      ? Math.min(box.width / natural.width, box.height / natural.height)
      : 0;
  const imageWidth = natural.width * fitted;
  const imageHeight = natural.height * fitted;
  const offsetX = (box.width - imageWidth) / 2;
  const offsetY = (box.height - imageHeight) / 2;

  // The frame loop reads the measured box through a ref so it doesn't have to
  // re-render to follow it; a ref is only ever written outside render, so this
  // hand-off happens in an effect, one frame after the layout settles.
  useEffect(() => {
    boxSizeRef.current = {
      width: box.width,
      height: box.height,
      imageWidth,
      imageHeight,
      offsetX,
      offsetY,
    };
  }, [box.width, box.height, imageWidth, imageHeight, offsetX, offsetY]);

  // Nothing is drawn until the picture has been measured, so a stray dot can't
  // flash in the corner on the first frame.
  const ready = face !== null && imageWidth > 0;

  /**
   * How far apart her eyes are, worked out from the face that was tapped.
   *
   * On a face, the gap between the eyes is close to the distance from the eyes
   * down to the mouth, so tapping those two points is enough to place both
   * eyelids — and it adapts to a close-up portrait and a wider shot alike,
   * instead of assuming one fixed spacing for every picture.
   */
  const eyeHalfGap = ready
    ? face.eyes.y < face.mouth.y
      ? Math.min(
          imageWidth * 0.13,
          Math.max(
            imageWidth * 0.03,
            (((face.mouth.y - face.eyes.y) / 100) * imageHeight) / 2.4,
          ),
        )
      : imageWidth * 0.05
    : 0;

  const eyes = ready
    ? {
        left: offsetX + (face.eyes.x / 100) * imageWidth,
        top: offsetY + (face.eyes.y / 100) * imageHeight,
        gap: eyeHalfGap,
        width: Math.max(8, eyeHalfGap * 0.95),
        height: Math.max(3, eyeHalfGap * 0.34),
      }
    : null;

  /** Cheeks sit under the eyes, either side of the mouth. */
  const cheeks = ready
    ? {
        top: offsetY + ((face.eyes.y + face.mouth.y) / 2 / 100) * imageHeight,
        left: offsetX + (face.mouth.x / 100) * imageWidth,
        spread: Math.max(16, imageWidth * 0.19),
        size: Math.max(28, imageWidth * 0.17),
      }
    : null;

  return (
    <div
      ref={boxRef}
      className={cn("relative overflow-hidden", className)}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        pointerRef.current = {
          x: ((event.clientX - rect.left) / rect.width - 0.5) * 7,
          y: ((event.clientY - rect.top) / rect.height - 0.5) * 5,
        };
      }}
      onPointerLeave={() => {
        pointerRef.current = { x: 0, y: 0 };
      }}
    >
      {/* On a wide screen her picture cannot fill the frame without cropping
          her face out of it, so it sits in a soft copy of itself instead of
          flat black bars. */}
      <img
        src={previewUrl ?? url}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 size-full scale-110 object-cover opacity-35 blur-2xl"
      />

      {/* A few percent of overscan: the picture is bigger than its box, so a
          head turn can move it without pulling a blurred edge into frame. The
          mouth and eye overlays live inside this layer, so they scale with it
          and stay on her face. */}
      <div className="absolute inset-0 scale-[1.045]">
        <motion.div
          className="absolute inset-0"
          animate={{
            scale: [1, 1.012, 1],
            y: [0, -4, 0],
            // The slow turn: she leans a little one way, settles, then the other.
            x: [0, 4, 0, -3.5, 0],
            rotate: [0, 0.26, 0, -0.22, 0],
          }}
          transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }}
        >
          <motion.div
            className="absolute inset-0"
            animate={
              speaking
                ? { y: [0, -1.5, 0, 1, 0], rotate: [0, 0.14, 0, -0.12, 0] }
                : { y: 0, rotate: 0 }
            }
            transition={
              speaking
                ? { duration: 1.7, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.35 }
            }
          >
            <div ref={leanRef} className="absolute inset-0 will-change-transform">
              {/* The instant copy, under the full picture: until the big file
                  arrives this is what the call is showing. */}
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="absolute inset-0 size-full object-contain select-none"
                />
              )}
              <img
                src={url}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth > 0 && naturalHeight > 0) {
                    setNatural({ width: naturalWidth, height: naturalHeight });
                  }
                }}
                className="relative size-full object-contain select-none"
              />

              {/* Her warmth: two soft blooms on her cheeks, only lit when she
                  flirts. Blurred into the picture rather than drawn on it. */}
              {cheeks &&
                [-1, 1].map((side) => (
                  <span
                    key={side}
                    ref={side === -1 ? blushLeftRef : blushRightRef}
                    aria-hidden
                    data-part="blush"
                    className="pointer-events-none absolute rounded-full"
                    style={{
                      left: cheeks.left + side * cheeks.spread,
                      top: cheeks.top,
                      width: cheeks.size,
                      height: cheeks.size * 0.72,
                      transform: "translate(-50%, -50%)",
                      background:
                        "radial-gradient(circle, rgba(214,116,120,0.55) 0%, rgba(214,116,120,0.24) 45%, rgba(214,116,120,0) 72%)",
                      filter: "blur(6px)",
                      opacity: 0,
                      mixBlendMode: "soft-light",
                    }}
                  />
                ))}

              {eyes &&
                ([-1, 1] as const).map((side) => (
                  <span
                    key={side}
                    ref={side === -1 ? leftLidRef : rightLidRef}
                    aria-hidden
                    data-part="lid"
                    className="pointer-events-none absolute rounded-[50%] bg-black/60"
                    style={{
                      left: eyes.left + side * eyes.gap,
                      top: eyes.top,
                      width: eyes.width,
                      height: eyes.height,
                      transform: "translate(-50%, -50%) scaleY(0.12)",
                      opacity: 0,
                      filter: "blur(1.1px)",
                    }}
                  />
                ))}

              {/* The smile: a thin dark curve that deepens as her mouth lifts. */}
              <span
                ref={smileRef}
                aria-hidden
                data-part="smile"
                className="pointer-events-none absolute rounded-[50%]"
                style={{
                  borderBottom: "2px solid rgba(60,26,24,0.75)",
                  filter: "blur(1.3px)",
                  opacity: 0,
                }}
              />

              {/* The mouth itself: a small dark opening. */}
              <span
                ref={mouthRef}
                aria-hidden
                data-part="mouth"
                className="pointer-events-none absolute rounded-[50%] bg-[#3b1512]"
                style={{
                  transform: "translate(-50%, -50%)",
                  opacity: 0,
                  filter: "blur(1.6px)",
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* A lens vignette and a breath of grain: it reads as a camera, not a JPEG. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_48%,rgba(0,0,0,0.45))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay bg-[repeating-linear-gradient(0deg,white_0px,white_1px,transparent_1px,transparent_2px)]"
      />
    </div>
  );
}
