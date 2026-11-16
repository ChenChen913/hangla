import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOARD_LIMITS,
  DEFAULT_DISPLAY,
  FALLBACK_TIER_COLOR,
  clamp,
  dataUrlBytes,
  decodeBoard,
  decodeSharedBoard,
  encodeBoard,
  estimateShareChars,
  measureShareChars,
  normalizeBoard,
  normalizeDisplay,
  normalizeItem,
  readFileAsDataURL,
  timestamp,
} from "./utils";
import type { Board, DisplaySettings } from "../types";

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

describe("normalizeItem 输入边界", () => {
  it("超长名称按字符截断，emoji 不会被切成半个", () => {
    const name = "😀".repeat(BOARD_LIMITS.itemName + 5);
    const item = normalizeItem({ id: "i", name });

    expect(Array.from(item.name)).toHaveLength(BOARD_LIMITS.itemName);
    expect(item.name).not.toContain("\uFFFD");
  });

  it("v2 text 结构的超长文本同样截断", () => {
    const item = normalizeItem({ type: "text", text: "字".repeat(BOARD_LIMITS.itemName + 20) });
    expect(item.name).toHaveLength(BOARD_LIMITS.itemName);
  });

  it("v2 image 结构的图片保留、名称兜底", () => {
    const item = normalizeItem({ type: "image", src: IMG });
    expect(item.image).toBe(IMG);
    expect(item.name).toBe("图片");
  });

  it("空名称 / 纯空白名称回落到兜底值，而不是留下空卡片", () => {
    expect(normalizeItem({ id: "i", name: "   " }).name).toBe("未命名");
    expect(normalizeItem({ type: "text", text: "" }).name).toBe("未命名");
  });

  it("只有图片没有名称时保留图片", () => {
    const item = normalizeItem({ id: "i", image: IMG });
    expect(item.name).toBe("图片");
    expect(item.image).toBe(IMG);
  });

  it("tilt 非有限值直接丢弃，越界值夹到 ±45°", () => {
    expect(normalizeItem({ id: "i", name: "a", tilt: NaN }).tilt).toBeUndefined();
    expect(normalizeItem({ id: "i", name: "a", tilt: Infinity }).tilt).toBeUndefined();
    expect(normalizeItem({ id: "i", name: "a", tilt: -Number.MAX_VALUE }).tilt).toBe(-BOARD_LIMITS.tilt);
    expect(normalizeItem({ id: "i", name: "a", tilt: 1e9 }).tilt).toBe(BOARD_LIMITS.tilt);
    expect(normalizeItem({ id: "i", name: "a", tilt: -50 }).tilt).toBe(-BOARD_LIMITS.tilt);
    expect(normalizeItem({ id: "i", name: "a", tilt: 12.6 }).tilt).toBe(13);
  });

  it("超长 id 重新生成，避免一个 id 就把存档撑大", () => {
    const item = normalizeItem({ id: "x".repeat(BOARD_LIMITS.id + 1), name: "a" });
    expect(item.id).not.toHaveLength(BOARD_LIMITS.id + 1);
    expect(item.id.length).toBeLessThan(BOARD_LIMITS.id);
  });

  it("描述两端空白被去掉，超长截断", () => {
    expect(normalizeItem({ id: "i", name: "a", desc: "  说明  " }).desc).toBe("说明");
    expect(normalizeItem({ id: "i", name: "a", desc: "描".repeat(500) }).desc).toHaveLength(BOARD_LIMITS.desc);
  });
});

describe("normalizeBoard 档位与总量边界", () => {
  it("档位名称超长截断", () => {
    const b = normalizeBoard({ tiers: [{ id: "t", name: "档".repeat(80), color: "#abc", items: [] }] });
    expect(b.tiers[0].name).toHaveLength(BOARD_LIMITS.tierName);
  });

  it("所有档位的条目总数受全局预算约束，但不会牺牲前面的档位", () => {
    const tiers = Array.from({ length: BOARD_LIMITS.tiers }, (_, i) => ({
      id: "t" + i,
      name: "档位",
      color: "#9AA5B1",
      items: Array.from({ length: BOARD_LIMITS.itemsPerTier }, (_, j) => ({ id: `i${i}-${j}`, name: "项目" })),
    }));

    const b = normalizeBoard({ tiers });
    const total = b.tiers.reduce((a, t) => a + t.items.length, 0);

    expect(total).toBe(BOARD_LIMITS.totalItems);
    expect(b.tiers[0].items).toHaveLength(BOARD_LIMITS.itemsPerTier);
    // 预算耗尽之后的档位只能是空的
    expect(b.tiers[b.tiers.length - 1].items).toHaveLength(0);
  });

  it("项目库不计入档位预算，仍有自己的 500 上限", () => {
    const pool = Array.from({ length: BOARD_LIMITS.pool + 10 }, (_, i) => ({ id: "p" + i, name: "项目" }));
    const b = normalizeBoard({ tiers: [], pool });
    expect(b.pool).toHaveLength(BOARD_LIMITS.pool);
  });
});

describe("normalizeDisplay", () => {
  it("缺字段时回落到默认值", () => {
    expect(normalizeDisplay(undefined)).toEqual(DEFAULT_DISPLAY);
    expect(normalizeDisplay({})).toEqual(DEFAULT_DISPLAY);
  });

  it("越界 / 非法的数值被夹到面板允许的范围", () => {
    const d = normalizeDisplay({
      tiltMax: 1e9,
      cardFontSize: -5,
      cardImageSize: 1000,
      rowGap: NaN,
      cardFontWeight: 123,
      labelFont: "花体",
      labelAnim: "疯狂",
    });

    expect(d.tiltMax).toBe(45);
    expect(d.cardFontSize).toBe(12);
    expect(d.cardImageSize).toBe(96);
    expect(d.rowGap).toBe(DEFAULT_DISPLAY.rowGap);
    expect(d.cardFontWeight).toBe(DEFAULT_DISPLAY.cardFontWeight);
    expect(d.labelFont).toBe("standard");
    expect(d.labelAnim).toBe("standard");
  });

  it("超长字体名被截断，布尔值只认真正的 boolean", () => {
    const d = normalizeDisplay({ cardFont: "x".repeat(500), showImages: "false" });
    expect(d.cardFont).toHaveLength(BOARD_LIMITS.cardFont);
    expect(d.showImages).toBe(true);
  });
});

describe("分享 payload：显示设置与体量", () => {
  const imgs = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: "i" + i,
    name: "项目" + i,
    image: "data:image/jpeg;base64," + "A".repeat(1024),
  }));

  it("display 随 payload 往返，接收者按分享者设置渲染", () => {
    const d = normalizeDisplay({ cardFontSize: 20, rowGap: 4, showNames: false });
    const shared = decodeSharedBoard(encodeBoard(boardOf(), d));

    expect(shared?.board.title).toBe("测试榜单");
    expect(shared?.display).toEqual(d);
  });

  it("旧链接（没有 display）返回 null，表示沿用打开者本机设置", () => {
    expect(decodeSharedBoard(encodeBoard(boardOf()))?.display).toBeNull();
  });

  it("payload 里的 display 也走规范化，不会被塞进越界值", () => {
    const dirty = { tiltMax: 9999, cardFontSize: 999 } as unknown as DisplaySettings;
    const shared = decodeSharedBoard(encodeBoard(boardOf(), dirty));
    expect(shared?.display?.tiltMax).toBe(45);
    expect(shared?.display?.cardFontSize).toBe(24);
  });

  it("estimateShareChars 是下界，measureShareChars 与真实编码长度一致", () => {
    const b = boardOf({ tiers: [{ id: "t", name: "夯", color: "#abc", items: imgs(4) }] });

    const lower = estimateShareChars(b);
    const exact = measureShareChars(b);
    const real = encodeBoard(b).length;

    expect(lower).toBeLessThanOrEqual(exact);
    expect(exact).toBe(real);
  });

  it("中文标题的字节数按 UTF-8 计算，不是按字符数", () => {
    const b = boardOf({ title: "夯".repeat(60) });
    expect(measureShareChars(b)).toBeGreaterThan(60 * 4);
  });

  it("被截断的分享链接返回 null，而不是解出半份榜单", () => {
    const full = encodeBoard(boardOf({ title: "打工人", tiers: [{ id: "t", name: "夯", color: "#abc", items: imgs(3) }] }));
    expect(decodeSharedBoard(full.slice(0, Math.floor(full.length * 0.6)))).toBeNull();
    expect(decodeSharedBoard(full.slice(0, 20))).toBeNull();
  });

  it("超长图片不会让链接解码卡死（长度上限先拦）", () => {
    expect(decodeSharedBoard("A".repeat(BOARD_LIMITS.decodeChars + 1))).toBeNull();
  });
});

describe("readFileAsDataURL 生命周期", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const file = () => new File(["x"], "a.png", { type: "image/png" });

  it("读取成功返回 data URL", async () => {
    vi.stubGlobal(
      "FileReader",
      class {
        result: string | null = "data:image/png;base64,AAA";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        readAsDataURL() {
          this.onload?.();
        }
      },
    );

    await expect(readFileAsDataURL(file())).resolves.toBe("data:image/png;base64,AAA");
  });

  it("读取结果为空时 reject，而不是 resolve 一个空字符串", async () => {
    vi.stubGlobal(
      "FileReader",
      class {
        result = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        readAsDataURL() {
          this.onload?.();
        }
      },
    );

    await expect(readFileAsDataURL(file())).rejects.toThrow("图片读取结果为空");
  });

  it("读取失败时 reject（上一个版本只写 onload，Promise 永远挂着）", async () => {
    vi.stubGlobal(
      "FileReader",
      class {
        result = null;
        error: Error | null = new Error("磁盘错误");
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        readAsDataURL() {
          this.onerror?.();
        }
      },
    );

    await expect(readFileAsDataURL(file())).rejects.toThrow("磁盘错误");
  });

  it("用户取消读取时 reject，不会永久 pending", async () => {
    vi.stubGlobal(
      "FileReader",
      class {
        result = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        readAsDataURL() {
          this.onabort?.();
        }
      },
    );

    await expect(readFileAsDataURL(file())).rejects.toThrow("图片读取已取消");
  });

  it("readAsDataURL 同步抛错也会 reject", async () => {
    vi.stubGlobal(
      "FileReader",
      class {
        result = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        readAsDataURL() {
          throw new Error("不允许读取");
        }
      },
    );

    await expect(readFileAsDataURL(file())).rejects.toThrow("不允许读取");
  });

  it("成功 / 失败之后事件回调都被清理掉", async () => {
    let instance: { onload: unknown; onerror: unknown; onabort: unknown } | null = null;
    vi.stubGlobal(
      "FileReader",
      class {
        result = "data:image/png;base64,AAA";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        constructor() {
          instance = this;
        }
        readAsDataURL() {
          this.onload?.();
        }
      },
    );

    await readFileAsDataURL(file());
    expect(instance!.onload).toBeNull();
    expect(instance!.onerror).toBeNull();
    expect(instance!.onabort).toBeNull();
  });
});
