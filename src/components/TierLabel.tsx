import { motion, useReducedMotion } from "motion/react";
import type { DisplaySettings } from "../types";
import { cn } from "../lib/utils";

/**
 * 等级标签：字体模式（标准/艺术）+ 可开关的入场动效。
 *
 * 动效设计（斜切滑入定格，无循环、总时长 < 0.4s）：
 * - subtle：短距淡入
 * - standard：左侧滑入 + 斜切回正 + 轻微 pop
 * - strong：更远滑入 + 更大斜切 + 模糊变清晰 + 明显 pop
 * - 系统 prefers-reduced-motion 或 labelAnim=off 时全部关闭
 *
 * 通过 key 重挂载来重放（父组件在项目拖入该档位时递增 replayKey）。
 */
export function TierLabel({
  name,
  display,
  replayKey,
  sizeClass,
}: {
  name: string;
  display: DisplaySettings;
  replayKey: number;
  /** 字号/字重类，由父组件按位置传入（如 "text-2xl font-black md:text-[32px]"） */
  sizeClass?: string;
}) {
  const reduced = useReducedMotion();
  const anim = display.labelAnim;
  const off = anim === "off" || reduced === true;

  // 斜切滑入参数：速度感来自 skew 回正 + blur 变清晰，不是闪烁
  const P = {
    off: { dx: 0, skew: 0, blur: 0, pop: 1 },
    subtle: { dx: 10, skew: -6, blur: 0, pop: 1 },
    standard: { dx: 26, skew: -14, blur: 2, pop: 1.06 },
    strong: { dx: 46, skew: -18, blur: 4, pop: 1.12 },
  }[anim];

  return (
    <motion.span
      initial={off ? false : { x: -P.dx, opacity: 0, skewX: P.skew, filter: P.blur ? `blur(${P.blur}px)` : undefined }}
      animate={{ x: 0, opacity: 1, skewX: 0, filter: "blur(0px)", scale: replayKey > 0 && !off ? [1, P.pop, 1] : 1 }}
      transition={{ type: "spring", stiffness: 620, damping: 32, mass: 0.7 }}
      className={cn("block leading-none", sizeClass, display.labelFont === "artistic" && "tier-label-art")}
    >
      {name}
    </motion.span>
  );
}
