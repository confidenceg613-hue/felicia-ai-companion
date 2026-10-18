import { motion } from "framer-motion";

const COUNT = 22;

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

function makeParticles(count: number): Particle[] {
  const rows = Math.ceil(Math.sqrt(count));
  const cols = Math.ceil(count / rows);
  const gap = 100 / (cols + 1);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return {
      id: i,
      x: 5 + col * gap * 0.9 + Math.random() * gap * 0.2,
      y: 6 + (row + (col % 2) * 0.5) * (gap * 0.9) + Math.random() * gap * 0.25,
      size: 0.25 + Math.random() * 0.18,
      delay: Math.random() * 6,
      duration: 7 + Math.random() * 6,
    };
  });
}

const BY_ID = makeParticles(COUNT);

export default function Particles() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none absolute inset-0 z-0"
      style={{ transform: "translateZ(0)" }}
    >
      {BY_ID.map((p) => (
        <ParticleDot key={p.id} p={p} />
      ))}
    </div>
  );
}

function ParticleDot({ p }: { p: Particle }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: p.y * 2, x: p.x * 0.4 }}
      animate={{
        opacity: [0.05, 0.55, 0.08],
        y: p.y,
        x: p.x,
      }}
      transition={{
        duration: p.duration,
        delay: p.delay,
        repeat: Infinity,
        repeatType: "loop",
        ease: ["easeInOut", "easeInOut", "easeInOut"] as const,
      }}
      className="absolute rounded-full"
      style={{
        left: `${p.x}%`,
        top: `${p.y}%`,
        width: `${p.size}rem`,
        height: `${p.size}rem`,
        background:
          "radial-gradient(circle at 35% 30%, color-mix(in oklab, var(--primary) 95%, transparent / 40%), color-mix(in oklab, var(--primary) 0%, transparent / 0%))",
        boxShadow:
          `0 0 12px color-mix(in oklab, var(--primary) 55%, transparent)`,
        filter: "blur(0.3px)",
      }}
    />
  );
}
