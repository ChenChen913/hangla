import { describe, expect, it } from "vitest";
import {
  BOARD_LIMITS,
  FALLBACK_TIER_COLOR,
  clamp,
  dataUrlBytes,
  decodeBoard,
  encodeBoard,
  normalizeBoard,
  normalizeItem,
  timestamp,
} from "./utils";
import type { Board } from "../types";

const IMG = "data:image/png;base64,AAAA";

function boardOf(patch: Partial<Board> = {}): Board {
  return {
    title: "测试榜单",
    style: "classic",
    mode: "day",
    presetId: "hangla",
    tiers: [{ id: "t1", name: "夯", color: "#E8A23C", items: [{ id: "i1", name: "A", image: IMG }] }],
    pool: [],
    ...patch,
  };
}

describe("normalizeItem", () => {
  it("保留内联图片", () => {
    expect(normalizeItem({ id: "x", name: "A", image: IMG }).image).toBe(IMG);
  });

  it("丢弃外链图片（分享链接里的第三方地址会让打开者被追踪）", () => {
    expect(normalizeItem({ id: "x", name: "A", image: "https://evil.example/a.png" }).image).toBeUndefined();
    expect(normalizeItem({ id: "x", name: "A", image: "javascript:alert(1)" }).image).toBeUndefined();
  });

  it("兼容 v2 的 text / image 结构", () => {
    expect(normalizeItem({ type: "text", text: "旧文本" }).name).toBe("旧文本");
    expect(normalizeItem({ type: "image", src: IMG, name: "旧图" }).image).toBe(IMG);
  });

  it("缺名字时兜底", () => {
    expect(normalizeItem({}).name).toBe("未命名");
  });
});

describe("normalizeBoard", () => {
  it("非法风格/日夜回落到默认值", () => {
    const b = normalizeBoard({ style: "不存在的风格", mode: "dusk" });
    expect(b.style).toBe("classic");
    expect(b.mode).toBe("day");
  });

  it("v2 的 theme 字符串映射到风格 + 日夜", () => {
    expect(normalizeBoard({ theme: "studio" }).mode).toBe("night");
    expect(normalizeBoard({ theme: "neon" }).style).toBe("neon");
  });

  it("tiers 不是数组时给空数组而不是抛错", () => {
    expect(normalizeBoard({ tiers: "坏了" }).tiers).toEqual([]);
  });
});

describe("分享链接编解码", () => {
  it("中文与图片往返一致", () => {
    const b = boardOf({ title: "打工人的一天 · 从夯到拉" });
    const back = decodeBoard(encodeBoard(b));
    expect(back?.title).toBe(b.title);
    expect(back?.tiers[0].items[0].image).toBe(IMG);
  });

  it("编码结果里没有 + / = 这些会破坏 URL 的字符", () => {
    const s = encodeBoard(boardOf({ title: "a+b/c=" }));
    expect(s).not.toMatch(/[+/=]/);
  });

  it("坏数据返回 null 而不是抛错", () => {
    expect(decodeBoard("!!!not-base64!!!")).toBeNull();
    expect(decodeBoard(btoa("{}"))).toBeNull();
  });
});

describe("小工具", () => {
  it("clamp 夹在区间内", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
  it("timestamp 是 8 位日期 + 6 位时间", () => {
    expect(timestamp()).toMatch(/^\d{8}-\d{6}$/);
  });
  it("dataUrlBytes 按 base64 换算原始字节", () => {
    expect(dataUrlBytes("data:image/png;base64," + "A".repeat(4000))).toBe(3000);
  });
});

describe("normalizeBoard 安全加固", () => {
  const colorOf = (color: unknown) =>
    normalizeBoard({ tiers: [{ id: "t", name: "档位", color, items: [] }] }).tiers[0].color;

  it("档位颜色只认 #rgb / #rrggbb，非法值回落默认色", () => {
    expect(colorOf("url(https://x)")).toBe(FALLBACK_TIER_COLOR);
    expect(colorOf("red")).toBe(FALLBACK_TIER_COLOR);
    expect(colorOf("rgb(0,0,0)")).toBe(FALLBACK_TIER_COLOR);
    expect(colorOf("#12")).toBe(FALLBACK_TIER_COLOR);
    expect(colorOf(42)).toBe(FALLBACK_TIER_COLOR);
    expect(colorOf("#abc")).toBe("#abc");
    expect(colorOf("#AABBCC")).toBe("#AABBCC");
  });

  it("tiers / 每档 items / pool 超量都会被截断", () => {
    const tiers = Array.from({ length: BOARD_LIMITS.tiers + 10 }, (_, i) => ({
      id: "t" + i,
      name: "档位" + i,
      color: "#9AA5B1",
      items: Array.from({ length: BOARD_LIMITS.itemsPerTier + 10 }, (_, j) => ({ id: `i${i}-${j}`, name: "项目" })),
    }));
    const pool = Array.from({ length: BOARD_LIMITS.pool + 10 }, (_, i) => ({ id: "p" + i, name: "项目" }));

    const b = normalizeBoard({ tiers, pool });

    expect(b.tiers).toHaveLength(BOARD_LIMITS.tiers);
    expect(b.tiers[0].items).toHaveLength(BOARD_LIMITS.itemsPerTier);
    expect(b.pool).toHaveLength(BOARD_LIMITS.pool);
  });

  it("空 id 与重复 id 会被重新生成，保证 id 非空且唯一", () => {
    const b = normalizeBoard({
      tiers: [
        { id: "same", name: "A", color: "#abc", items: [{ id: "same", name: "x" }, { id: "same", name: "y" }, { id: "", name: "z" }] },
        { id: "same", name: "B", color: "#abc", items: [] },
      ],
      pool: [{ id: "same", name: "p" }],
    });
    const ids = [...b.tiers.map(t => t.id), ...b.tiers.flatMap(t => t.items.map(i => i.id)), ...b.pool.map(i => i.id)];

    expect(ids.every(id => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    // 第一次出现的 id 原样保留，重复的才换成新 id
    expect(b.tiers[0].id).toBe("same");
    expect(b.tiers[1].id).not.toBe("same");
  });

  it("标题 / 副标题 / 条目描述超长会被截断", () => {
    const b = normalizeBoard({
      title: "标".repeat(BOARD_LIMITS.title + 10),
      subtitle: "副".repeat(BOARD_LIMITS.subtitle + 10),
      tiers: [
        {
          id: "t",
          name: "档位",
          color: "#abc",
          items: [{ id: "i", name: "项目", desc: "描".repeat(BOARD_LIMITS.desc + 10) }],
        },
      ],
    });

    expect(b.title).toHaveLength(BOARD_LIMITS.title);
    expect(b.subtitle).toHaveLength(BOARD_LIMITS.subtitle);
    expect(b.tiers[0].items[0].desc).toHaveLength(BOARD_LIMITS.desc);
  });

  it("单张内联图片超过长度上限时整条丢弃", () => {
    // 前缀 + 上限长度的 base64 已越过上限
    const big = "data:image/png;base64," + "A".repeat(BOARD_LIMITS.imageChars);
    const b = normalizeBoard({
      tiers: [{ id: "t", name: "档位", color: "#abc", items: [{ id: "i", name: "项目", image: big }] }],
    });

    expect(b.tiers[0].items[0].image).toBeUndefined();
  });

  it("presetId 只认已登记预设或 custom", () => {
    expect(normalizeBoard({ presetId: "hangla" }).presetId).toBe("hangla");
    expect(normalizeBoard({ presetId: "custom" }).presetId).toBe("custom");
    expect(normalizeBoard({ presetId: "不存在" }).presetId).toBe("custom");
    // 原型链上的键不能蒙混过关
    expect(normalizeBoard({ presetId: "toString" }).presetId).toBe("custom");
  });

  it("theme 为 __proto__ 等原型键时不再抛错", () => {
    expect(() => normalizeBoard({ theme: "__proto__" })).not.toThrow();
    expect(normalizeBoard({ theme: "__proto__" }).style).toBe("classic");
  });
});

describe("decodeBoard 长度保护", () => {
  it("输入长度超过上限直接返回 null", () => {
    expect(decodeBoard("A".repeat(BOARD_LIMITS.decodeChars + 1))).toBeNull();
  });

  it("超长且非法的输入同样返回 null 而不是抛错", () => {
    expect(decodeBoard("%".repeat(BOARD_LIMITS.decodeChars + 1))).toBeNull();
  });
});
