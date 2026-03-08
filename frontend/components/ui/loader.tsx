import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { VenetianMask } from "lucide-react";

export function Loader({
  className,
  size = 48,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-8",
        className,
      )}
    >
      <div className="relative">
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 bg-primary/30 rounded-full blur-xl"
        />
        <motion.div
          animate={{ rotateY: [0, 360] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
        >
          <VenetianMask
            style={{ width: size, height: size }}
            className="text-primary relative z-10"
          />
        </motion.div>
      </div>
      <motion.span
        className="text-sm font-semibold tracking-widest text-primary/80 uppercase"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        Загрузка
      </motion.span>
    </div>
  );
}
