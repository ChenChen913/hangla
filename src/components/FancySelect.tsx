import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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

/**
 * 自定义下拉：与界面质感相称（面板卡片、分组标题、当前项高亮）。
 *
 * 无障碍：触发按钮 aria-haspopup=listbox / aria-expanded，列表 role=listbox、选项 role=option；
 * 键盘 ↑/↓ 移动、Home/End 跳首尾、Enter/Space 选中、Esc 关闭并把焦点送回触发按钮；
 * 打开后焦点进入当前项（读屏会读出当前选中项）。
 */
export function FancySelect({
  value,
  options,
  onChange,
  title,
  ariaLabel,
  menuAlign = "right",
  className,
  emptyLabel = "选择…",
}: {
  value: string;
  options: FancyOption[];
  onChange(v: string): void;
  title?: string;
  /** 读屏用的控件名（不传时退回 title） */
  ariaLabel?: string;
  /** 下拉菜单对齐方向：块级容器里靠左对齐才不会被挤出屏幕（移动端设置抽屉） */
  menuAlign?: "left" | "right";
  className?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const current = options.find(o => o.value === value);
  const currentIndex = options.findIndex(o => o.value === value);

  /** 可选中的选项（当前项即使 disabled 也可点，用于关掉禁用态） */
  const isSelectable = (o: FancyOption | undefined) => !!o && (!o.disabled || o.value === value);
  const firstEnabled = () => Math.max(0, options.findIndex(o => isSelectable(o)));
  const lastEnabled = () => {
    for (let i = options.length - 1; i >= 0; i--) if (isSelectable(options[i])) return i;
    return 0;
  };

  function openMenu(dir: 1 | -1 = 1) {
    setActiveIndex(currentIndex >= 0 ? currentIndex : dir === 1 ? firstEnabled() : lastEnabled());
    setOpen(true);
  }

  function closeMenu(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }

  function moveActive(delta: 1 | -1) {
    if (!options.length) return;
    let i = activeIndex;
    for (let n = 0; n < options.length; n++) {
      i = (i + delta + options.length) % options.length;
      if (isSelectable(options[i])) break;
    }
    setActiveIndex(i);
    optionRefs.current[i]?.focus();
  }

  function goEdge(which: "first" | "last") {
    const i = which === "first" ? firstEnabled() : lastEnabled();
    setActiveIndex(i);
    optionRefs.current[i]?.focus();
  }

  function selectActive() {
    const o = options[activeIndex];
    if (!isSelectable(o)) return;
    onChange(o.value);
    closeMenu(true);
  }

  // 打开后把焦点放到当前项
  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
    // activeIndex 在打开前已确定，之后由键盘处理函数直接聚焦，不需要再依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 点外部关闭；Esc 关闭并回焦。Esc 用捕获阶段拦下，
  // 避免移动端设置抽屉（Radix Dialog 也在 document 上监听 Esc）被一起关掉。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // 相邻同组合并为一组（同时记下每组在扁平 options 里的起始下标，供键盘索引使用）
  const groups: { group?: string; items: FancyOption[]; start: number }[] = [];
  let cursor = 0;
  options.forEach(o => {
    const last = groups[groups.length - 1];
    if (last && last.group === o.group) last.items.push(o);
    else groups.push({ group: o.group, items: [o], start: cursor });
    cursor += 1;
  });

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        title={title}
        aria-label={ariaLabel ? `${ariaLabel}：${current?.label ?? emptyLabel}` : title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? closeMenu(false) : openMenu(1))}
        onKeyDown={e => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openMenu(e.key === "ArrowDown" ? 1 : -1);
          }
        }}
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
        <div
          id={listId}
          role="listbox"
          aria-label={ariaLabel ?? title ?? "选项"}
          tabIndex={-1}
          onKeyDown={e => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              moveActive(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              moveActive(-1);
            } else if (e.key === "Home") {
              e.preventDefault();
              goEdge("first");
            } else if (e.key === "End") {
              e.preventDefault();
              goEdge("last");
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectActive();
            } else if (e.key === "Escape") {
              e.preventDefault();
              closeMenu(true);
            } else if (e.key === "Tab") {
              closeMenu(false);
            }
          }}
          className={cn(
            "absolute z-[60] mt-2 max-h-[min(60vh,420px)] min-w-[220px] overflow-y-auto rounded-xl border border-line bg-panel p-1.5 shadow-[0_16px_40px_rgba(16,24,40,.20)]",
            menuAlign === "left" ? "left-0" : "right-0",
          )}
        >
          {groups.map((g, gi) => (
            <div key={gi} role={g.group ? "group" : undefined} aria-label={g.group}>
              {gi > 0 && <div className="mx-1 my-1.5 h-px bg-line" role="presentation" />}
              {g.group && (
                <div
                  aria-hidden="true"
                  className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold tracking-wide text-muted"
                >
                  {g.group}
                </div>
              )}
              {g.items.map((o, oi) => {
                const i = g.start + oi;
                const isCurrent = o.value === value;
                const selectable = isSelectable(o);
                return (
                  <button
                    key={o.value}
                    ref={el => {
                      optionRefs.current[i] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    aria-disabled={selectable ? undefined : true}
                    tabIndex={-1}
                    onMouseEnter={() => {
                      if (i !== activeIndex) setActiveIndex(i);
                    }}
                    onClick={() => {
                      if (!selectable) return;
                      onChange(o.value);
                      closeMenu(true);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink",
                      selectable && "cursor-pointer hover:bg-panel2",
                      !selectable && "cursor-not-allowed opacity-40",
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
