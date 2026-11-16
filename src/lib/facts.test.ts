import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIER_PRESETS } from "./presets";
import { MODE_NAMES, STYLE_NAMES, THEMES } from "./themes";
import { IMAGE_MAX_SIDE, BOARD_LIMITS } from "./utils";
import { SHARE_URL_COMFORT_LIMIT, SHARE_URL_HARD_LIMIT, SHARE_URL_SOFT_LIMIT } from "./share";
import { MAX_SNAPSHOTS, STORAGE_KEY } from "../store/board";

/**
 * 文档事实的"代码侧"校验。
 *
 * scripts/check-facts.mjs 负责「配置 ↔ README」，这里负责「配置 ↔ 代码」。
 * 两边都跑，才能保证改了常量之后不会留下两份自说自话的文档。
 * 这两份文件都在仓库里，用运行时读取而不是 JSON import（tsconfig 没开 resolveJsonModule）。
 */
const readJson = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const facts = readJson("../../scripts/project-facts.json") as Record<string, unknown>;
const pkg = readJson("../../package.json") as { engines?: { node?: string }; homepage?: string; scripts?: Record<string, string> };

describe("project-facts 与代码常量一致", () => {
  it("Node 最低版本与在线地址", () => {
    expect(facts.node).toBe(pkg.engines?.node);
    expect(facts.demoUrl).toBe(pkg.homepage);
  });

  it("评级模式 / 视觉风格 / 明暗数量", () => {
    expect(facts.presets).toBe(Object.keys(TIER_PRESETS).length);
    expect(facts.styles).toBe(Object.keys(STYLE_NAMES).length);
    expect(facts.modes).toBe(Object.keys(MODE_NAMES).length);
    // 风格 × 明暗 = 主题总数，文档里的"共 N 套主题"要能对上
    expect(Object.keys(THEMES).length).toBe((facts.styles as number) * (facts.modes as number));
  });

  it("快照上限", () => {
    expect(facts.snapshots).toBe(MAX_SNAPSHOTS);
  });

  it("分享链接的三档长度阈值", () => {
    expect(facts.shareComfortChars).toBe(SHARE_URL_COMFORT_LIMIT);
    expect(facts.shareSoftChars).toBe(SHARE_URL_SOFT_LIMIT);
    expect(facts.shareHardChars).toBe(SHARE_URL_HARD_LIMIT);
  });

  it("图片最长边、导入文件上限与存储键", () => {
    expect(facts.imageMaxSide).toBe(IMAGE_MAX_SIDE);
    expect((facts.importMaxMB as number) * 1024 * 1024).toBe(BOARD_LIMITS.importBytes);
    expect(facts.storageKey).toBe(STORAGE_KEY);
  });

  it("登记在事实表里的脚本都真实存在", () => {
    for (const name of facts.scripts as string[]) {
      expect(pkg.scripts?.[name], `package.json 缺少 scripts.${name}`).toBeTruthy();
    }
  });
});
