import { beforeEach, describe, expect, it } from "vitest";
import { freshBoard, useBoard } from "./board";

function reset() {
  useBoard.setState({ ...freshBoard(), snapshots: [] });
}

const state = () => useBoard.getState();

beforeEach(reset);

describe("moveItem", () => {
  it("项目库 → 档位：按给定下标插入并移出项目库", () => {
    const tierId = state().tiers[0].id;
    state().addItemToPool({ id: "p1", name: "新项目" });

    state().moveItem("p1", tierId, 0);

    expect(state().pool).toHaveLength(0);
    expect(state().tiers[0].items[0].name).toBe("新项目");
  });

  it("档位内换位：往后挪时目标下标要补偿自身占位", () => {
    const tierId = state().tiers[0].id;
    const [a, b] = state().tiers[0].items.map(i => i.id);

    state().moveItem(a, tierId, 2);

    expect(state().tiers[0].items.map(i => i.id)).toEqual([b, a]);
  });

  it("跨档位搬运", () => {
    const [t0, t1] = state().tiers;
    const moving = t0.items[0].id;

    state().moveItem(moving, t1.id, 0);

    expect(state().tiers[0].items.some(i => i.id === moving)).toBe(false);
    expect(state().tiers[1].items[0].id).toBe(moving);
  });

  it("搬回项目库", () => {
    const moving = state().tiers[0].items[0].id;
    state().moveItem(moving, null, 0);
    expect(state().pool[0].id).toBe(moving);
  });

  it("目标不存在时不动数据", () => {
    const before = state().tiers[0].items.length;
    state().moveItem(state().tiers[0].items[0].id, "不存在的档位", 0);
    expect(state().tiers[0].items).toHaveLength(before);
  });
});

describe("档位操作", () => {
  it("删除档位时项目回到项目库，不会丢", () => {
    const tier = state().tiers[0];
    const count = tier.items.length;

    state().deleteTier(tier.id);

    expect(state().tiers.some(t => t.id === tier.id)).toBe(false);
    expect(state().pool).toHaveLength(count);
    expect(state().presetId).toBe("custom");
  });

  it("套用预设：保留项目时按位置映射，装不下的回项目库", () => {
    // hangla 预设 5 档 → rarity 预设 4 档，第 5 档的项目应落到项目库
    const last = state().tiers[4].items.map(i => i.id);

    state().applyPreset("rarity", true);

    expect(state().tiers).toHaveLength(4);
    expect(state().tiers[0].items.map(i => i.name)).toContain("ChatGPT");
    for (const id of last) expect(state().pool.some(i => i.id === id)).toBe(true);
  });

  it("套用预设：不保留时全部回项目库", () => {
    const total = state().tiers.reduce((a, t) => a + t.items.length, 0);
    state().applyPreset("classic", false);
    expect(state().pool).toHaveLength(total);
  });
});

describe("图片入池", () => {
  it("指定档位时直接落进该档位", () => {
    const tierId = state().tiers[2].id;
    state().addImagesToPool([{ id: "img1", name: "图" }], tierId);
    expect(state().tiers[2].items.some(i => i.id === "img1")).toBe(true);
    expect(state().pool).toHaveLength(0);
  });

  it("档位不存在时退回项目库", () => {
    state().addImagesToPool([{ id: "img2", name: "图" }], "不存在");
    expect(state().pool.some(i => i.id === "img2")).toBe(true);
  });
});

describe("快照", () => {
  it("最多保留 30 份，最新的在最前", () => {
    for (let i = 0; i < 35; i++) {
      state().setTitle("榜单 " + i);
      state().saveSnapshot();
    }
    expect(state().snapshots).toHaveLength(30);
    expect(state().snapshots[0].title).toBe("榜单 34");
  });

  it("快照与当前榜单互不影响", () => {
    const original = state().tiers[0].items[0].name;
    state().saveSnapshot();
    state().updateItem(state().tiers[0].items[0].id, { name: "改过了" });

    expect(state().snapshots[0].board.tiers[0].items[0].name).toBe(original);
  });

  it("恢复快照会覆盖当前榜单", () => {
    state().saveSnapshot();
    const snapId = state().snapshots[0].id;
    state().setTitle("临时改的");
    state().deleteTier(state().tiers[0].id);

    expect(state().loadSnapshot(snapId)).toBe(true);
    expect(state().title).toBe("2026 年 AI 大模型从夯到拉");
    expect(state().tiers).toHaveLength(5);
  });

  it("恢复不存在的快照返回 false", () => {
    expect(state().loadSnapshot("没有这个")).toBe(false);
  });
});
