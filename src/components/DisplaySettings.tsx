import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useBoard } from "../store/board";
import { cn } from "../lib/utils";
import { FancySelect } from "./FancySelect";

function Toggle({ checked, onChange }: { checked: boolean; onChange(v: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
        checked ? "bg-accent" : "bg-line",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white shadow transition-all",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export { Toggle };

/** 标签字体选项（value 为 CSS font-family） */
const FONT_OPTIONS = [
  { value: "", label: "默认" },
  { value: '"Microsoft YaHei", sans-serif', label: "微软雅黑" },
  { value: 'SimHei, "Microsoft YaHei", sans-serif', label: "黑体" },
  { value: 'SimSun, serif', label: "宋体" },
  { value: 'KaiTi, STKaiti, serif', label: "楷体" },
  { value: 'DengXian, sans-serif', label: "等线" },
  { value: 'Consolas, "Courier New", monospace', label: "等宽" },
];

const WEIGHT_OPTIONS = [
  { value: 300, label: "细" },
  { value: 400, label: "常规" },
  { value: 500, label: "中" },
  { value: 700, label: "粗" },
  { value: 900, label: "特粗" },
];

/** 显示与样式设置：图片/名称显隐、歪着放，以及标签文字大小、字体、粗细。
 *  编辑器、预览、导出图三处同步生效 */
export function DisplaySettings() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const display = useBoard(s => s.display);
  const setDisplay = useBoard(s => s.setDisplay);

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

          const rows: { label: string; hint: string; key: "showImages" | "showNames" | "tiltImages" }[] = [
            { label: "显示图片", hint: "关掉后只显示项目名称", key: "showImages" },
            { label: "显示名称", hint: "关掉后图片项目只显示图", key: "showNames" },
            { label: "图片歪着放", hint: "开启后可调歪斜幅度", key: "tiltImages" },
          ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="显示与样式设置"
        onClick={() => setOpen(v => !v)}
        className={cn(
          "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-line bg-panel text-ink transition-colors hover:border-accent/60 [&_svg]:size-4",
          open && "border-accent/60",
        )}
      >
        <SlidersHorizontal />
      </button>

      {open && (
        <div className="absolute right-0 z-[60] mt-2 w-72 rounded-xl border border-line bg-panel p-3.5 shadow-[0_16px_40px_rgba(16,24,40,.20)]">
          <p className="pb-2 text-[13px] font-bold text-ink">显示与样式</p>

          {/* 显隐开关 */}
          <div className="space-y-0.5">
            {rows.map(({ label, hint, key }) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-panel2">
                <span className="min-w-0">
                  <span className="block text-[13px] text-ink">{label}</span>
                  <span className="block text-[11px] text-muted">{hint}</span>
                </span>
                <Toggle checked={display[key]} onChange={v => setDisplay({ [key]: v })} />
              </div>
            ))}
          </div>

          <div className="my-3 h-px bg-line" />

          {/* 等级标签：字体模式 + 动效强度 */}
          <p className="pb-2 text-[13px] font-bold text-ink">等级标签</p>

          <div className="space-y-3 px-1 pb-1">
            <div>
              <p className="pb-1 text-[12.5px] text-ink">字体</p>
              <div className="flex gap-1">
                {([
                  { v: "standard", label: "标准" },
                  { v: "artistic", label: "艺术" },
                ] as const).map(f => (
                  <button
                    key={f.v}
                    type="button"
                    onClick={() => setDisplay({ labelFont: f.v })}
                    className={cn(
                      "flex-1 cursor-pointer rounded-lg border px-1 py-1.5 text-[12px] transition-colors",
                      display.labelFont === f.v
                        ? "border-accent bg-accent/10 font-semibold text-accent"
                        : "border-line bg-panel text-muted hover:border-accent/40 hover:text-ink",
                      f.v === "artistic" && "tier-label-art text-[15px]",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <p className="pt-1 text-[11px] text-muted">艺术 = 得意黑（斜体速度感，适合截图分享）</p>
            </div>

            <div>
              <p className="pb-1 text-[12.5px] text-ink">标签动效</p>
              <div className="flex gap-1">
                {([
                  { v: "off", label: "关闭" },
                  { v: "subtle", label: "轻微" },
                  { v: "standard", label: "标准" },
                  { v: "strong", label: "强烈" },
                ] as const).map(a => (
                  <button
                    key={a.v}
                    type="button"
                    onClick={() => setDisplay({ labelAnim: a.v })}
                    className={cn(
                      "flex-1 cursor-pointer rounded-lg border px-1 py-1.5 text-[12px] transition-colors",
                      display.labelAnim === a.v
                        ? "border-accent bg-accent/10 font-semibold text-accent"
                        : "border-line bg-panel text-muted hover:border-accent/40 hover:text-ink",
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <p className="pt-1 text-[11px] text-muted">
                档位首次出现与项目拖入时播放一次，不会循环；系统开启「减少动画」时自动关闭
              </p>
            </div>
          </div>

          <div className="my-3 h-px bg-line" />

          {/* 标签样式调节 */}
          <p className="pb-2 text-[13px] font-bold text-ink">项目标签样式</p>

          {display.tiltImages && (
            <div className="mb-3 rounded-xl border border-line bg-panel2/60 p-2.5">
              <div className="flex items-center justify-between pb-1">
                <span className="text-[12.5px] text-ink">最大歪斜角度</span>
                <span className="text-[12px] tabular-nums text-muted">±{display.tiltMax}°</span>
              </div>
              <input
                type="range"
                min={5}
                max={45}
                step={1}
                value={display.tiltMax}
                onChange={e => setDisplay({ tiltMax: Number(e.target.value) })}
                className="w-full cursor-pointer accent-[var(--c-accent)]"
              />
              <p className="pt-1 text-[11px] text-muted">
                每张图在 ±{display.tiltMax}° 内随机；想单独调某张图，在编辑项目里设置
              </p>
            </div>
          )}

          <div className="space-y-3 px-1 pb-1">
            <div>
              <div className="flex items-center justify-between pb-1">
                <span className="text-[12.5px] text-ink">文字大小</span>
                <span className="text-[12px] tabular-nums text-muted">{display.cardFontSize}px</span>
              </div>
              <input
                type="range"
                min={12}
                max={24}
                step={1}
                value={display.cardFontSize}
                onChange={e => setDisplay({ cardFontSize: Number(e.target.value) })}
                className="w-full cursor-pointer accent-[var(--c-accent)]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between pb-1">
                <span className="text-[12.5px] text-ink">图片大小</span>
                <span className="text-[12px] tabular-nums text-muted">{display.cardImageSize}px</span>
              </div>
              <input
                type="range"
                min={32}
                max={96}
                step={4}
                value={display.cardImageSize}
                onChange={e => setDisplay({ cardImageSize: Number(e.target.value) })}
                className="w-full cursor-pointer accent-[var(--c-accent)]"
              />
            </div>

            <div>
              <p className="pb-1 text-[12.5px] text-ink">字体</p>
              <FancySelect
                value={display.cardFont}
                options={FONT_OPTIONS.map(f => ({
                  value: f.value,
                  label: f.label,
                  swatch: (
                    <span className="text-[15px] leading-none" style={{ fontFamily: f.value || undefined }}>
                      字
                    </span>
                  ),
                }))}
                onChange={v => setDisplay({ cardFont: v })}
                className="w-full"
              />
            </div>

            <div>
              <p className="pb-1 text-[12.5px] text-ink">标签色调</p>
              <div className="flex gap-1">
                {([
                  { v: false, label: "渐变" },
                  { v: true, label: "实体色" },
                ] as const).map(f => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setDisplay({ labelFlat: f.v })}
                    className={cn(
                      "flex-1 cursor-pointer rounded-lg border px-1 py-1.5 text-[12px] transition-colors",
                      display.labelFlat === f.v
                        ? "border-accent bg-accent/10 font-semibold text-accent"
                        : "border-line bg-panel text-muted hover:border-accent/40 hover:text-ink",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between pb-1">
                <span className="text-[12.5px] text-ink">档位间距</span>
                <span className="text-[12px] tabular-nums text-muted">{display.rowGap}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={32}
                step={2}
                value={display.rowGap}
                onChange={e => setDisplay({ rowGap: Number(e.target.value) })}
                className="w-full cursor-pointer accent-[var(--c-accent)]"
              />
            </div>

            <div>
              <p className="pb-1 text-[12.5px] text-ink">文字粗细</p>
              <div className="flex gap-1">
                {WEIGHT_OPTIONS.map(w => (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => setDisplay({ cardFontWeight: w.value })}
                    style={{ fontWeight: w.value }}
                    className={cn(
                      "flex-1 cursor-pointer rounded-lg border px-1 py-1.5 text-[12px] transition-colors",
                      display.cardFontWeight === w.value
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line bg-panel text-muted hover:border-accent/40 hover:text-ink",
                    )}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="pt-2 text-[11px] text-muted">编辑器、预览和导出的图片会同步使用这些设置</p>
        </div>
      )}
    </div>
  );
}
