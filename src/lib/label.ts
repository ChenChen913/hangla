import { contrastRatio, mixWhite } from "./utils";

/**
 * 档位标签的绘制规则（编辑器 / 只读预览 / 导出画布共用一份，三处不许各写一遍）。
 *
 * 为什么单独抽出来：以前字色是按「档位原色」的亮度挑的，可画出来的底是渐变起点
 * （近白），于是白字压在近白底上——「顶级 / NPC / 拉完了」三个档位对比度只有 1.1~1.3:1，
 * 远低于 WCAG 4.5:1。字色必须跟「实际画出来的底」比对，而不是跟原色比对。
 */

/** 渐变高光端的提亮比例：起点 = 原色混入 14% 白 */
export const LABEL_TINT = 0.14;

const TEXT_LIGHT = "#ffffff";
const TEXT_DARK = "#141414";

/** 渐变方向（与 CSS 一致，改这里三处一起变） */
const GRADIENT = "linear-gradient(160deg";

/**
 * 在深 / 浅两个候选字色里挑一个：取「对每个可能出现的底色都不更差」的那个。
 * 渐变标签要同时对起点和终点成立，所以按最差的一端做决策。
 */
function pickTextColor(backgrounds: string[]): string {
  const worst = (text: string) => Math.min(...backgrounds.map(bg => contrastRatio(text, bg)));
  return worst(TEXT_LIGHT) > worst(TEXT_DARK) ? TEXT_LIGHT : TEXT_DARK;
}

export type TierLabelPaint = {
  /** 可直接塞进 style.background 的值：纯色或 linear-gradient */
  background: string;
  /** 可直接塞进 style.color 的值 */
  color: string;
};

/**
 * 档位标签配色。
 * @param color 档位原色（#rrggbb；非法值会退化成兜底灰）
 * @param flat  true = 实体纯色块（经典梗图风格 / 用户开了「纯色标签」），false = 带高光渐变
 */
export function tierLabelPaint(color: string, flat: boolean): TierLabelPaint {
  if (flat) return { background: color, color: pickTextColor([color]) };
  const highlight = mixWhite(color, LABEL_TINT);
  return {
    background: `${GRADIENT}, ${highlight}, ${color})`,
    color: pickTextColor([highlight, color]),
  };
}
