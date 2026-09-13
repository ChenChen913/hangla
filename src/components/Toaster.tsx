import { AnimatePresence, motion } from "motion/react";
import { useToasts } from "../store/toast";

export function Toaster() {
  const toasts = useToasts(s => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-6">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="max-w-[80vw] rounded-[10px] border border-chipline bg-chip px-4 py-2.5 text-[13.5px] text-ink shadow-[0_6px_18px_rgba(0,0,0,.4)]"
          >
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
