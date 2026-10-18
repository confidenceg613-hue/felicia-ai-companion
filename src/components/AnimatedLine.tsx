import { motion } from "framer-motion";

export default function AnimatedLine({
  className,
  height = 1,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none overflow-hidden ${className ?? ""}`}
      style={{ height: `${height}px` }}
    >
      <motion.div
        initial={false}
        animate={{ x: ["-100%", "100%"] }}
        transition={{
          duration: 3.2,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute inset-0 will-change-transform"
      >
        <div
          className="h-full w-2/3"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary) 60%, transparent / 55%), color-mix(in oklab, var(--primary) 95%, transparent / 35%), transparent)",
            boxShadow: `0 0 16px color-mix(in oklab, var(--primary) 50%, transparent / 30%)`,
          }}
        />
      </motion.div>
    </div>
  );
}
