import { describe, expect, it } from "vitest";
import { clamp, dataUrlBytes, decodeBoard, encodeBoard, normalizeBoard, normalizeItem, timestamp } from "./utils";
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
