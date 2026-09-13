import type { Tier } from "../types";
import { uid } from "./utils";

export type PresetDef = { name: string; tiers: [name: string, color: string][] };

/** 评级模式预设：整套档位方案（夯→拉只是默认模板，不是强制规则），可一键互切 */
export const TIER_PRESETS: Record<string, PresetDef> = {
  hangla: {
    name: "从夯到拉",
    tiers: [
      ["夯", "#E8A23C"],
      ["顶级", "#FF5D5D"],
      ["人上人", "#3DD68C"],
      ["NPC", "#5B8DEF"],
      ["拉完了", "#3F4550"],
    ],
  },
  tier: {
    name: "经典梗图",
    tiers: [
      ["夯", "#FF5222"],
      ["顶级", "#FF9F43"],
      ["人上人", "#FFE066"],
      ["NPC", "#FFF3B0"],
      ["拉完了", "#74C0FC"],
    ],
  },
  rarity: {
    name: "SSR 稀有度",
    tiers: [
      ["SSR", "#E9B44C"],
      ["SR", "#B583D6"],
      ["R", "#5FA8D3"],
      ["N", "#9AA5B1"],
    ],
  },
  rank: {
    name: "竞技梯度 T0-T4",
    tiers: [
      ["T0", "#E05B5B"],
      ["T1", "#E8934A"],
      ["T2", "#E5C453"],
      ["T3", "#4FAE9B"],
      ["T4", "#97A0AC"],
    ],
  },
  classic: {
    name: "经典 S ~ D",
    tiers: [
      ["S", "#E15D5D"],
      ["A", "#E8934A"],
      ["B", "#E5C453"],
      ["C", "#55A878"],
      ["D", "#7D96B8"],
    ],
  },
};

export function presetTiers(presetId: string): Tier[] | null {
  const p = TIER_PRESETS[presetId];
  if (!p) return null;
  return p.tiers.map(([name, color]) => ({ id: uid(), name, color, items: [] }));
}
