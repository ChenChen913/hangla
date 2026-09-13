import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";

export type FancyOption = {
  value: string;
  label: string;
  /** 分组标题：相邻同组的选项合并在一个分组标题下 */
  group?: string;
  disabled?: boolean;
  /** 选项左侧的小图（色点/色条等） */
  swatch?: ReactNode;
};

/** 自定义下拉：与界面质感相称（面板卡片、分组标题、当前项高亮、点击外部/Esc 关闭） */
export function FancySelect({
  value,
  options,
  onChange,
  title,
  className,
  emptyLabel = "选择…",
}: {
  value: string;
  options: FancyOption[];
  onChange(v: string): void;
  title?: string;
  className?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 相邻同组合并为一组
  const groups: { group?: string; items: FancyOption[] }[] = [];
  options.forEach(o => {
    const last = groups[groups.length - 1];
    if (last && last.group === o.group) last.items.push(o);
    else groups.push({ group: o.group, items: [o] });
  });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={title}
        onClick={() => setOpen(v => !v)}
        className={cn(
          "inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-[10px] border border-line bg-panel px-3 text-[13.5px] text-ink transition-colors hover:border-accent/60",
          open && "border-accent/60",
          className,
        )}
      >
        {current?.swatch}
        <span className="max-w-[150px] truncate">{current?.label ?? emptyLabel}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 z-[60] mt-2 min-w-[220px] rounded-xl border border-line bg-panel p-1.5 shadow-[0_16px_40px_rgba(16,24,40,.20)]">
          {groups.map((g, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="mx-1 my-1.5 h-px bg-line" />}
              {g.group && (
                <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold tracking-wide text-muted">
                  {g.group}
                </div>
              )}
              {g.items.map(o => {
                const isCurrent = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={o.disabled && !isCurrent}
                    onClick={() => {
                      if (o.disabled && !isCurrent) return;
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink",
                      !o.disabled && "cursor-pointer hover:bg-panel2",
                      o.disabled && !isCurrent && "cursor-not-allowed opacity-40",
                      isCurrent && "bg-accent/10 font-semibold text-accent",
                    )}
                  >
                    {o.swatch && <span className="shrink-0">{o.swatch}</span>}
                    <span className="flex-1 truncate">{o.label}</span>
                    {isCurrent && <Check className="size-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
