import { motion } from "framer-motion";

export default function HoverRail({
  target = 0,
  duration = 0.35,
}: {
  target?: number;
  duration?: number;
}) {
  return (
    <motion.div
      initial={{ width: 0, opacity: 0.6 }}
      animate={{ width: target, opacity: 0.7 }}
      transition={{ duration, ease: "easeOut" }}
      className="h-0.5 rounded-full"
      style={{
        background:
          "linear-gradient(90deg, color-mix(in oklab, var(--primary) 95%, transparent / 0%), color-mix(in oklab, var(--primary) 95%, transparent / 60%))",
        boxShadow: `0 0 12px color-mix(in oklab, var(--primary) 55%, transparent / 35%)`,
      }}
    />
  );
}
