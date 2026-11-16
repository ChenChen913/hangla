import { useUi } from "../store/ui";

/** 批量图片处理进度：不阻断操作，只是把"卡住了还是在干活"说清楚 */
export function ImageProgress() {
  const progress = useUi(s => s.imageProgress);
  if (!progress || progress.total <= 1) return null;

  const pct = Math.round((progress.done / progress.total) * 100);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(168px+env(safe-area-inset-bottom))] left-1/2 z-[65] w-[min(72vw,280px)] -translate-x-1/2 rounded-xl border border-line bg-panel/95 px-3 py-2 shadow-[0_8px_24px_rgba(16,24,40,.18)] backdrop-blur md:bottom-20"
    >
      <div className="flex items-center justify-between text-[12px] text-ink">
        <span>正在处理图片</span>
        <span className="tabular-nums text-muted">
          {progress.done}/{progress.total}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel2">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
