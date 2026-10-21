import type { Face } from "@/lib/feliciaCamera";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Blink length, in milliseconds. A real blink is quicker than it feels. */
const BLINK_MS = 120;

/**
 * Her camera feed on a video call.
 *
 * There is no video of her, so this is built from one of her pictures: the
 * frame breathes and turns the way a face does when someone is holding a phone,
 * her eyes blink every few seconds, and while she is speaking a small shadow at
 * her lips opens and closes so she looks like she is talking rather than frozen
 * mid-sentence.
 *
 * The picture is drawn with `object-contain`, which leaves bars around it on a
 * tall screen, so the mouth and eye positions (percentages of the picture) are
 * converted into pixels here from the measured box. That keeps her face on her
 * face at every screen size instead of assuming the picture fills the frame.
 */
export function FeliciaVideoFeed({
  url,
  speaking,
  face,
  className,
}: {
  url: string;
  /** True while her voice is playing — that is when her lips move. */
  speaking: boolean;
  /** Where her mouth and eyes are on this picture. */
  face: Face | null;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 3, height: 4 });
  const [blinking, setBlinking] = useState(false);

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

  /**
   * Her blink.
   *
   * At an even interval it reads as a mechanism, so every gap is a fresh random
   * one, and one blink in four comes as a double. The timer schedules only the
   * next blink, which keeps a tab in the background from piling them up.
   */
  useEffect(() => {
    let closed: ReturnType<typeof setTimeout> | undefined;
    let next: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      next = setTimeout(
        () => {
          if (cancelled) return;
          setBlinking(true);
          closed = setTimeout(() => {
            if (cancelled) return;
            setBlinking(false);
            if (Math.random() < 0.25) {
              // A quick second blink, like a real one when the eyes are dry.
              closed = setTimeout(() => {
                if (cancelled) return;
                setBlinking(true);
                closed = setTimeout(() => {
                  if (!cancelled) setBlinking(false);
                  schedule();
                }, BLINK_MS);
              }, 180);
              return;
            }
            schedule();
          }, BLINK_MS);
        },
        2400 + Math.random() * 4600,
      );
    };

    schedule();

    return () => {
      cancelled = true;
      clearTimeout(next);
      clearTimeout(closed);
    };
  }, []);

  const fitted =
    box.width > 0 && box.height > 0
      ? Math.min(box.width / natural.width, box.height / natural.height)
      : 0;
  const imageWidth = natural.width * fitted;
  const imageHeight = natural.height * fitted;
  const offsetX = (box.width - imageWidth) / 2;
  const offsetY = (box.height - imageHeight) / 2;

  // Nothing is drawn until the picture has been measured, so a stray dot can't
  // flash in the corner on the first frame.
  const ready = face !== null && imageWidth > 0;
  const mouth = ready
    ? {
        left: offsetX + (face.mouth.x / 100) * imageWidth,
        top: offsetY + (face.mouth.y / 100) * imageHeight,
        width: Math.max(14, imageWidth * 0.085),
        height: Math.max(6, imageWidth * 0.032),
      }
    : null;
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

  return (
    <div ref={boxRef} className={cn("relative overflow-hidden", className)}>
      {/* On a wide screen her picture cannot fill the frame without cropping
          her face out of it, so it sits in a soft copy of itself instead of
          flat black bars. */}
      <img
        src={url}
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
            className="size-full object-contain select-none"
          />

          {eyes &&
            [-1, 1].map((side) => (
              <motion.span
                key={side}
                aria-hidden
                className="absolute rounded-[50%] bg-black/60"
                style={{
                  left: eyes.left + side * eyes.gap,
                  top: eyes.top,
                  width: eyes.width,
                  height: eyes.height,
                  x: "-50%",
                  y: "-50%",
                  filter: "blur(1.1px)",
                }}
                animate={{
                  scaleY: blinking ? 1 : 0.05,
                  opacity: blinking ? 0.62 : 0,
                }}
                transition={{ duration: 0.075, ease: "easeOut" }}
              />
            ))}

          {mouth && (
            <motion.span
              aria-hidden
              className="absolute rounded-[50%] bg-black/70"
              style={{
                left: mouth.left,
                top: mouth.top,
                width: mouth.width,
                height: mouth.height,
                x: "-50%",
                y: "-50%",
                filter: "blur(1.6px)",
              }}
              animate={
                speaking
                  ? {
                      opacity: [0.2, 0.62, 0.28, 0.5, 0.18],
                      scaleY: [0.28, 1, 0.42, 0.86, 0.24],
                      scaleX: [0.95, 1.06, 0.98, 1.03, 0.94],
                    }
                  : { opacity: 0, scaleY: 0.2, scaleX: 0.9 }
              }
              transition={
                speaking
                  ? { duration: 0.62, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.2 }
              }
            />
          )}
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
