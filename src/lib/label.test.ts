import { describe, expect, it } from "vitest";
import { LABEL_TINT, tierLabelPaint } from "./label";
import { TIER_PRESETS } from "./presets";
import { contrastRatio, mixWhite } from "./utils";

/** 从 background 值里抽出所有出现过的底色：纯色取自身，渐变取两个色标 */
function backgroundsOf(background: string): string[] {
  const stops = background.match(/rgba?\([^)]*\)|#[0-9a-f]{3,6}/gi);
  return stops && stops.length ? stops : [background];
}

/** 全部内置预设用到的档位色 */
const presetColors = Object.entries(TIER_PRESETS).flatMap(([id, p]) =>
  p.tiers.map(([name, color]) => ({ id, name, color })),
);

describe("tierLabelPaint / 档位标签对比度", () => {
  // 回归：曾经按「原色」挑字色，白字被压到近白的渐变起点上，
  // 顶级 / NPC / 拉完了 三个档位只有 1.15~1.26:1。
  it.each(presetColors)("$id 的「$name」在渐变模式下每个色标都达到 4.5:1", ({ color }) => {
    const paint = tierLabelPaint(color, false);
    for (const bg of backgroundsOf(paint.background)) {
      expect(contrastRatio(paint.color, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(presetColors)("$id 的「$name」在纯色模式下达到 4.5:1", ({ color }) => {
    const paint = tierLabelPaint(color, true);
    expect(contrastRatio(paint.color, paint.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("渐变起点是原色混 14% 白，不是 86% 白", () => {
    const color = "#FF5D5D";
    const paint = tierLabelPaint(color, false);
    const [start] = backgroundsOf(paint.background);
    expect(start).toBe(mixWhite(color, LABEL_TINT));
    // 混 14% 白之后仍然明显偏红，而不是被冲成近白
    expect(contrastRatio(mixWhite(color, LABEL_TINT), "#ffffff")).toBeGreaterThan(1.5);
  });

  it("原来的问题档位现在用深色字", () => {
    // 这两个是原来白字压近白底的：修好后应由「深色字」胜出
    for (const color of ["#FF5D5D", "#5B8DEF"]) {
      expect(tierLabelPaint(color, false).color).toBe("#141414");
    }
    // 真·深色档位仍然用白字
    for (const color of ["#3F4550", "#2B2F38"]) {
      expect(tierLabelPaint(color, false).color).toBe("#ffffff");
    }
  });

  it("纯色模式直接返回原色（经典梗图风格依赖这一点）", () => {
    expect(tierLabelPaint("#FF5222", true).background).toBe("#FF5222");
    expect(tierLabelPaint("#FF5222", false).background).toContain("linear-gradient(160deg");
  });

  it("非法颜色不崩，退化为可读的灰", () => {
    const paint = tierLabelPaint("not-a-color", false);
    expect(paint.background).toContain("rgb(");
    expect(contrastRatio(paint.color, paint.background)).toBeGreaterThanOrEqual(4.5);
  });
});
