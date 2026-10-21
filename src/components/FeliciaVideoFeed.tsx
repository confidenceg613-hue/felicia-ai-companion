import type { Lips } from "@/lib/feliciaCamera";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Her camera feed on a video call.
 *
 * There is no video of her, so this is built from one of her pictures: the
 * frame breathes and drifts the way a face does when someone is holding a
 * phone, and while she is speaking a small shadow at her lips opens and closes
 * so she looks like she is talking rather than frozen mid-sentence.
 *
 * The picture is drawn with `object-contain`, which leaves bars around it on a
 * tall screen, so the mouth position (a percentage of the picture) is converted
 * into pixels here from the measured box. That keeps her lips on her lips at
 * every screen size instead of assuming the picture fills the frame.
 */
export function FeliciaVideoFeed({
  url,
  speaking,
  lips,
  className,
}: {
  url: string;
  /** True while her voice is playing — that is when her lips move. */
  speaking: boolean;
  /** Where her mouth is on this picture, or null while it isn't known yet. */
  lips: Lips | null;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 3, height: 4 });

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
  const mouth = lips && imageWidth > 0
    ? {
        left: offsetX + (lips.x / 100) * imageWidth,
        top: offsetY + (lips.y / 100) * imageHeight,
        width: Math.max(14, imageWidth * 0.085),
        height: Math.max(6, imageWidth * 0.032),
      }
    : null;

  return (
    <div ref={boxRef} className={cn("relative", className)}>
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

      <motion.div
        className="absolute inset-0"
        animate={{ scale: [1, 1.014, 1], y: [0, -3, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
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
