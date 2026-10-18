import { motion, useTime } from "framer-motion";

const RINGS = 3;

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

function Orbit({ index, t }: { index: number; t: number }) {
  const phase = index * 2.1;
  const x =
    50 +
    Math.sin((t / 1000) * 0.25 + phase) * (55 + index * 22);
  const y =
    55 +
    Math.cos((t / 1000) * 0.18 + phase * 1.3) * (28 + index * 10);

  return (
    <motion.div
      initial={false}
      animate={{
        x,
        y,
        rotate: (t / 1000) * (-8 + index * 3),
      }}
      transition={{ duration: 0.016, repeat: Infinity, ease: "linear" }}
      className="absolute left-1/2 top-1/2 origin-center"
      style={{
        width: `${70 + index * 28}px`,
        height: `${70 + index * 28}px`,
        mixBlendMode: "screen",
      }}
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
        <motion.div
          key={sign}
          animate={{ rotate: (t / 1000) * 60 * sign + index * 80 }}
          transition={{ duration: 0.016, repeat: Infinity, ease: "linear" }}
          className="absolute left-1/2 top-1/2 origin-center"
          style={{
            width: "5px",
            height: "5px",
            marginTop: `-2.5px`,
            marginLeft: `-2.5px`,
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              inset: "0",
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--primary) 90%, transparent / 20%) 0%, transparent 70%)",
              boxShadow: `0 0 10px color-mix(in oklab, var(--primary) 45%, transparent)`,
            }}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
