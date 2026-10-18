import { motion, useTime, useTransform, type MotionValue } from "framer-motion";

const RINGS = 3;

/**
 * Slow rings of light drifting behind a foreground — ambient motion for the
 * hero. Driven by a single shared time value with `useTransform`, so every
 * frame is computed off the React render loop instead of re-rendering.
 */
export default function AmbientOrbits() {
  const t = useTime();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none absolute inset-0 z-0 overflow-hidden"
      style={{ transform: "translateZ(0)" }}
    >
      {Array.from({ length: RINGS }).map((_, i) => (
        <Orbit key={i} index={i} t={t} />
      ))}
    </div>
  );
}

function Orbit({ index, t }: { index: number; t: MotionValue<number> }) {
  const phase = index * 2.1;
  const x = useTransform(
    t,
    (v) => 50 + Math.sin((v / 1000) * 0.25 + phase) * (55 + index * 22),
  );
  const y = useTransform(
    t,
    (v) => 55 + Math.cos((v / 1000) * 0.18 + phase * 1.3) * (28 + index * 10),
  );
  const rotate = useTransform(t, (v) => (v / 1000) * (-8 + index * 3));

  return (
    <motion.div
      style={{
        x,
        y,
        rotate,
        width: 70 + index * 28,
        height: 70 + index * 28,
        mixBlendMode: "screen",
      }}
      className="absolute left-1/2 top-1/2 origin-center"
    >
      {/* ring */}
      <div
        className="absolute inset-0 rounded-full border"
        style={{
          borderWidth: "1px",
          borderColor:
            "color-mix(in oklab, var(--primary) 42%, transparent / 70%)",
          boxShadow: `0 0 28px color-mix(in oklab, var(--primary) 28%, transparent / 35%)`,
        }}
      />
      {/* a couple of bright motes traveling the ring */}
      {[-1, 1].map((sign) => (
        <Mote key={sign} t={t} sign={sign} index={index} />
      ))}
    </motion.div>
  );
}

function Mote({
  t,
  sign,
  index,
}: {
  t: MotionValue<number>;
  sign: number;
  index: number;
}) {
  const rotate = useTransform(t, (v) => (v / 1000) * 60 * sign + index * 80);

  return (
    <motion.div
      style={{ rotate }}
      className="absolute left-1/2 top-1/2 origin-center"
      initial={false}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: "5px",
          height: "5px",
          marginTop: `-2.5px`,
          marginLeft: `-2.5px`,
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--primary) 90%, transparent / 20%) 0%, transparent 70%)",
          boxShadow: `0 0 10px color-mix(in oklab, var(--primary) 45%, transparent)`,
        }}
      />
    </motion.div>
  );
}