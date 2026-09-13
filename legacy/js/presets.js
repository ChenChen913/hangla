/* ============================================================
 * presets.js —— 评级模式预设（整套档位方案，可一键互切）
 * ============================================================ */
"use strict";

const TIER_PRESETS = {
  hangla: {
    name: "从夯到拉",
    tiers: [
      ["夯", "#FFC53D"],
      ["顶级", "#FF5D5D"],
      ["人上人", "#3DD68C"],
      ["NPC", "#5B8DEF"],
      ["拉完了", "#3F4550"],
    ],
  },
  rarity: {
    name: "SSR 稀有度",
    tiers: [
      ["SSR", "#FFD166"],
      ["SR", "#C77DFF"],
      ["R", "#4CC9F0"],
      ["N", "#8D99AE"],
    ],
  },
  rank: {
    name: "竞技梯度 T0-T4",
    tiers: [
      ["T0", "#FF4D4D"],
      ["T1", "#FF9F43"],
      ["T2", "#FFE156"],
      ["T3", "#2EC4B6"],
      ["T4", "#7D8597"],
    ],
  },
  classic: {
    name: "经典 S ~ D",
    tiers: [
      ["S", "#FF5D5D"],
      ["A", "#FF9F43"],
      ["B", "#FFE156"],
      ["C", "#3DD68C"],
      ["D", "#5B8DEF"],
    ],
  },
};

// 由预设生成一套全新的空档位
function presetTiers(presetId) {
  const p = TIER_PRESETS[presetId];
  if (!p) return null;
  return p.tiers.map(([name, color]) => ({ id: uid(), name, color, items: [] }));
}
