import { beforeEach, describe, expect, it } from "vitest";
import { freshBoard, useBoard } from "../store/board";
import { resolveDropIndex } from "./drag";

const state = () => useBoard.getState();

beforeEach(() => {
  useBoard.setState({ ...freshBoard(), snapshots: [] });
});

/** 把「over 项下标」换算成 moveItem 需要的插入下标，再真实落位 */
function dropIntoFirstTier(activeId: string, overId: string | null): string[] {
  const tierId = state().tiers[0].id;
  const ids = state().tiers[0].items.map(i => i.id);
  const index = resolveDropIndex(ids, activeId, overId);
  state().moveItem(activeId, tierId, index);
  return state().tiers[0].items.map(i => i.id);
}

describe("resolveDropIndex", () => {
  it("向下拖相邻项：交换位置（修复前会原地不动）", () => {
    const [a, b] = state().tiers[0].items.map(i => i.id);
    expect(dropIntoFirstTier(a, b)).toEqual([b, a]);
  });

  it("向下拖到末项：放到末尾而不是差一格", () => {
    const tierId = state().tiers[0].id;
    state().addItemToPool({ id: "c", name: "C" });
    state().moveItem("c", tierId, 2);
    const [a, b, c] = state().tiers[0].items.map(i => i.id);
    expect(dropIntoFirstTier(a, c)).toEqual([b, c, a]);
  });

  it("向上拖：插到目标项之前", () => {
    const tierId = state().tiers[0].id;
    state().addItemToPool({ id: "c", name: "C" });
    state().moveItem("c", tierId, 2);
    const [a, b, c] = state().tiers[0].items.map(i => i.id);
    expect(dropIntoFirstTier(c, a)).toEqual([c, a, b]);
  });

  it("落在容器空白处：放到该容器末尾", () => {
    const [a, b] = state().tiers[0].items.map(i => i.id);
    expect(dropIntoFirstTier(a, null)).toEqual([b, a]);
  });

  it("脏数据：active 或 over 不在列表里时退回末尾，不抛错", () => {
    const ids = ["a", "b"];
    expect(resolveDropIndex(ids, "x", "a")).toBe(2);
    expect(resolveDropIndex(ids, "a", "x")).toBe(2);
  });
});
