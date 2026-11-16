import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_V2_KEY, migrateLegacyBoard } from "./legacy";
import { DEFAULT_DISPLAY } from "./utils";
import { STORAGE_KEY, freshBoard, resetHistory, useBoard } from "../store/board";
import { resetMemoryStorage } from "./storage";

function stubLocalStorage(map: Map<string, string>, overrides: Partial<Storage> = {}) {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    ...overrides,
  });
}

const v2Board = {
  title: "v2 时代的老榜单",
  tiers: [
    { id: "t1", name: "夯", items: [{ type: "text", text: "旧文本条目" }] },
    { id: "t2", name: "拉", items: [] },
  ],
};

beforeEach(() => {
  resetMemoryStorage();
  useBoard.setState({ ...freshBoard(), snapshots: [], display: { ...DEFAULT_DISPLAY } });
  resetHistory();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("v2 存档迁移", () => {
  it("当前版本没有存档时，把 v2 数据导进来", () => {
    const map = new Map([[LEGACY_V2_KEY, JSON.stringify(v2Board)]]);
    stubLocalStorage(map);

    expect(migrateLegacyBoard()).toBe(true);
    expect(useBoard.getState().title).toBe("v2 时代的老榜单");
    expect(useBoard.getState().tiers[0].items[0].name).toBe("旧文本条目");
    // 旧数据走的是同一条规范化路径
    expect(useBoard.getState().presetId).toBe("custom");
  });

  it("已经有当前存档时绝不覆盖", () => {
    const map = new Map([
      [STORAGE_KEY, JSON.stringify({ state: { title: "新存档" }, version: 10 })],
      [LEGACY_V2_KEY, JSON.stringify(v2Board)],
    ]);
    stubLocalStorage(map);
    const before = useBoard.getState().title;

    expect(migrateLegacyBoard()).toBe(false);
    expect(useBoard.getState().title).toBe(before);
  });

  it("旧档是损坏 JSON 时安全跳过，不抛错", () => {
    stubLocalStorage(new Map([[LEGACY_V2_KEY, "{ 这不是 JSON"]]));
    expect(() => migrateLegacyBoard()).not.toThrow();
    expect(migrateLegacyBoard()).toBe(false);
  });

  it("旧档没有 tiers 数组时跳过", () => {
    stubLocalStorage(new Map([[LEGACY_V2_KEY, JSON.stringify({ title: "只有标题" })]]));
    expect(migrateLegacyBoard()).toBe(false);
  });

  it("存储读取抛错时安全跳过（不会白屏、也不会误迁移）", () => {
    const map = new Map([[LEGACY_V2_KEY, JSON.stringify(v2Board)]]);
    stubLocalStorage(map, {
      setItem: () => undefined,
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    const before = useBoard.getState().title;

    expect(() => migrateLegacyBoard()).not.toThrow();
    expect(migrateLegacyBoard()).toBe(false);
    expect(useBoard.getState().title).toBe(before);
  });

  it("localStorage 完全不存在时跳过", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => migrateLegacyBoard()).not.toThrow();
    expect(migrateLegacyBoard()).toBe(false);
  });

  it("没有 v2 存档时什么都不做", () => {
    stubLocalStorage(new Map());
    expect(migrateLegacyBoard()).toBe(false);
  });
});
