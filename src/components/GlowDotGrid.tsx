import { motion } from "framer-motion";

const ROWS = 7;
const COLS = 11;
const GAP_X = 100 / (COLS + 1);
const GAP_Y = 100 / (ROWS + 1);

type Dot = {
  x: number;
  y: number;
  delay: number;
};

function gridDots(): Dot[] {
  const dots: Dot[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      dots.push({
        x: GAP_X * (c + 1) + (r % 2) * (GAP_X * 0.5),
        y: GAP_Y * (r + 1),
        delay: (r * COLS + c) * 0.15,
      });
    }
  }
  return dots;
}

const DOTS = gridDots();

export default function GlowDotGrid({
  className,
  intensity = 0.6,
}: {
  className?: string;
  intensity?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none absolute inset-0 z-0 ${className ?? ""}`}
      style={{ transform: "translateZ(0)" }}
    >
      {DOTS.map((d, k) => (
        <Dot key={k} pt={d} intensity={intensity} delay={d.delay} />
      ))}
    </div>
  );
}

function Dot({
  pt,
  intensity,
  delay,
}: {
  pt: Dot;
  intensity: number;
  delay: number;
}) {
  const size = 0.18;
  return (
    <motion.div
      initial={false}
      animate={{
        opacity: [0.04, intensity * 0.6, 0.05],
        scale: [0.7, 1, 0.8],
      }}
      transition={{
        duration: 2.6,
        delay,
        repeat: Infinity,
        repeatType: "loop",
        ease: ["easeInOut", "easeInOut", "easeInOut"] as const,
      }}
      className="absolute rounded-full"
      style={{
        left: `${pt.x}%`,
        top: `${pt.y}%`,
        width: `${size}rem`,
        height: `${size}rem`,
        background:
          "radial-gradient(circle at 40% 35%, color-mix(in oklab, var(--primary) 100%, transparent / 35%), transparent 70%)",
        boxShadow: `0 0 8px color-mix(in oklab, var(--primary) 50%, transparent)`,
        filter: "blur(0.2px)",
      }}
    />
  );
}
