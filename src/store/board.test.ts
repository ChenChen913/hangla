import { beforeEach, describe, expect, it } from "vitest";
import type { Item } from "../types";
import { freshBoard, resetHistory, useBoard } from "./board";
import { BOARD_LIMITS, DEFAULT_DISPLAY } from "../lib/utils";

function reset() {
  useBoard.setState({ ...freshBoard(), snapshots: [], display: { ...DEFAULT_DISPLAY } });
  // 撤销栈是模块级的，必须显式清空：不能靠"上一个用例刚好没留下历史"
  resetHistory();
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

describe("undo / redo", () => {
  it("撤销把新增的档位收回去，重做再推回来", () => {
    const before = state().tiers.length;
    state().addTier();
    expect(state().tiers.length).toBe(before + 1);

    state().undo();
    expect(state().tiers.length).toBe(before);

    state().redo();
    expect(state().tiers.length).toBe(before + 1);
  });

  it("跨档位拖拽能整步撤销（不会被合并窗口吃掉）", () => {
    const [t0, t1] = state().tiers;
    const moving = t0.items[0].id;

    state().moveItem(moving, t1.id, 0);
    expect(state().tiers[0].items.some(i => i.id === moving)).toBe(false);

    state().undo();
    expect(state().tiers[0].items.some(i => i.id === moving)).toBe(true);
    expect(state().tiers[1].items.some(i => i.id === moving)).toBe(false);
  });

  it("撤销不回退呈现设置（字体大小不进历史）", () => {
    state().setDisplay({ cardFontSize: 22 });
    state().addTier();
    state().undo();
    expect(state().display.cardFontSize).toBe(22);
  });

  it("没有可撤销的步骤时调用 undo 不抛错", () => {
    const snapshot = { ...state() };
    for (let i = 0; i < 60; i++) state().undo();
    expect(state().tiers.length).toBeGreaterThan(0);
    expect(snapshot.title).toBe(state().title);
  });

  it("历史步数会同步到 store，供按钮置灰", () => {
    state().addTier();
    expect(state().history.past).toBeGreaterThan(0);
    state().undo();
    expect(state().history.future).toBeGreaterThan(0);
  });
});

describe("历史栈的隔离与边界", () => {
  it("每个用例开始时撤销栈是空的（不依赖上个用例留下的状态）", () => {
    expect(state().history).toEqual({ past: 0, future: 0 });
    state().addTier();
    expect(state().history.past).toBe(1);
  });

  it("连续输入标题合并成一步，撤销回到输入之前", () => {
    const original = state().title;
    state().setTitle("打");
    state().setTitle("打工");
    state().setTitle("打工人的一天");

    expect(state().history.past).toBe(1);
    state().undo();
    expect(state().title).toBe(original);
  });

  it("连续输入副标题合并成一步", () => {
    state().setSubtitle("副");
    state().setSubtitle("副标题");
    expect(state().history.past).toBe(1);

    state().undo();
    expect(state().subtitle).toBe(freshBoard().subtitle);
  });

  it("撤销之后重新编辑会清空 redo", () => {
    state().addTier();
    state().undo();
    expect(state().history.future).toBe(1);

    state().addTier();
    expect(state().history.future).toBe(0);
  });

  it("撤销之后紧跟结构修改：新操作独立记录，不会被并进上一条", () => {
    state().addTier();
    const afterAdd = state().tiers.length;
    state().undo();
    state().addTier();

    expect(state().tiers).toHaveLength(afterAdd);
    expect(state().history.past).toBe(1);
  });

  it("删除档位可整步撤销，项目回到原档位", () => {
    const tier = state().tiers[0];
    const names = tier.items.map(i => i.name);

    state().deleteTier(tier.id);
    expect(state().tiers.some(t => t.id === tier.id)).toBe(false);

    state().undo();
    expect(state().tiers[0].id).toBe(tier.id);
    expect(state().tiers[0].items.map(i => i.name)).toEqual(names);
  });

  it("恢复快照可以撤销回快照之前的内容", () => {
    state().saveSnapshot();
    const snap = state().snapshots[0];
    const original = state().title;

    state().setTitle("改过的标题");
    state().loadSnapshot(snap.id);
    expect(state().title).toBe(original);

    state().undo();
    expect(state().title).toBe("改过的标题");
  });

  it("恢复示例榜单可以撤销", () => {
    state().setTitle("我的自定义榜单");
    state().resetBoard();
    expect(state().title).not.toBe("我的自定义榜单");

    state().undo();
    expect(state().title).toBe("我的自定义榜单");
  });

  it("超过 50 步只保留最近 50 步，继续撤销不会抛错", () => {
    for (let i = 0; i < 55; i++) state().setStyle(i % 2 ? "tier" : "classic");
    expect(state().history.past).toBe(50);

    for (let i = 0; i < 60; i++) state().undo();
    expect(state().history.past).toBe(0);
  });

  it("重新水合（模拟刷新）会清空历史", async () => {
    state().addTier();
    expect(state().history.past).toBeGreaterThan(0);

    await useBoard.persist.rehydrate();

    expect(state().history).toEqual({ past: 0, future: 0 });
  });
});

describe("快照的显示设置归属", () => {
  it("保存时记录 display，恢复时一并还原", () => {
    state().setDisplay({ cardFontSize: 20, showNames: false, tiltMax: 30 });
    state().saveSnapshot();
    const snap = state().snapshots[0];

    expect(snap.display).toMatchObject({ cardFontSize: 20, showNames: false, tiltMax: 30 });

    state().setDisplay({ cardFontSize: 13, showNames: true, tiltMax: 10 });
    expect(state().loadSnapshot(snap.id)).toBe(true);

    expect(state().display.cardFontSize).toBe(20);
    expect(state().display.showNames).toBe(false);
    expect(state().display.tiltMax).toBe(30);
  });

  it("撤销「恢复快照」只回退榜单内容，不回退显示设置", () => {
    state().setDisplay({ cardFontSize: 20 });
    state().saveSnapshot();
    const snap = state().snapshots[0];
    state().setDisplay({ cardFontSize: 13 });
    state().loadSnapshot(snap.id);

    state().undo();

    // 文档里写明的边界：撤销是"撤销内容"，不是"撤销外观"
    expect(state().display.cardFontSize).toBe(20);
  });

  it("旧快照（没有 display 字段）恢复时不动本机显示设置", () => {
    useBoard.setState({
      snapshots: [{ id: "old", title: "旧快照", savedAt: 1, board: freshBoard() }],
    });
    state().setDisplay({ cardFontSize: 22, showImages: false });

    state().loadSnapshot("old");

    expect(state().display.cardFontSize).toBe(22);
    expect(state().display.showImages).toBe(false);
  });
});

describe("导入 JSON：只进快照，不碰编辑器", () => {
  const imported = {
    title: "导入的榜单",
    tiers: [{ id: "t", name: "夯", color: "#abc", items: [{ id: "i", name: "项目" }] }],
  };

  it("导入不改变编辑器内容，也不产生撤销步骤", () => {
    const title = state().title;
    const tiers = state().tiers;
    const past = state().history.past;

    const result = state().importBoardAsSnapshot(imported);

    expect(result).toEqual({ ok: true, title: "导入的榜单" });
    expect(state().title).toBe(title);
    expect(state().tiers).toBe(tiers);
    expect(state().history.past).toBe(past);
    expect(state().snapshots[0].title).toBe("导入的榜单");
    expect(state().snapshots[0].display).toEqual(state().display);
  });

  it("没有有效档位时拒绝导入，不留下空快照", () => {
    const result = state().importBoardAsSnapshot({ title: "空", tiers: [] });
    expect(result.ok).toBe(false);
    expect(state().snapshots).toHaveLength(0);
  });

  it("超量数据在导入时被规范化，不会原样进快照", () => {
    const many = Array.from({ length: BOARD_LIMITS.tiers + 5 }, (_, i) => ({
      id: "t" + i,
      name: "档".repeat(50),
      color: "javascript:alert(1)",
      items: [{ id: "i" + i, name: "名".repeat(200) }],
    }));

    state().importBoardAsSnapshot({ title: "超量", tiers: many });

    const board = state().snapshots[0].board;
    expect(board.tiers).toHaveLength(BOARD_LIMITS.tiers);
    expect(board.tiers[0].name).toHaveLength(BOARD_LIMITS.tierName);
    expect(board.tiers[0].items[0].name).toHaveLength(BOARD_LIMITS.itemName);
    expect(board.tiers[0].color).toBe("#9AA5B1");
  });

  it("快照数量超过上限时丢弃最旧的", () => {
    for (let i = 0; i < 35; i++) state().importBoardAsSnapshot({ ...imported, title: "导入 " + i });
    expect(state().snapshots).toHaveLength(30);
    expect(state().snapshots[0].title).toBe("导入 34");
  });
});

describe("编辑入口的上限保护", () => {
  it("档位数量到上限后不再新增", () => {
    useBoard.setState({
      tiers: Array.from({ length: BOARD_LIMITS.tiers }, (_, i) => ({
        id: "t" + i,
        name: "档位",
        color: "#9AA5B1",
        items: [],
      })),
    });

    state().addTier();
    expect(state().tiers).toHaveLength(BOARD_LIMITS.tiers);
  });

  it("项目库到上限后不再新增", () => {
    const pool: Item[] = Array.from({ length: BOARD_LIMITS.pool }, (_, i) => ({ id: "p" + i, name: "项目" }));
    useBoard.setState({ pool });

    state().addItemToPool({ id: "new", name: "挤不进去" });
    expect(state().pool).toHaveLength(BOARD_LIMITS.pool);
  });

  it("拖进已满的档位会被拒绝，数据留在原处", () => {
    const items: Item[] = Array.from({ length: BOARD_LIMITS.itemsPerTier }, (_, i) => ({ id: "t0-" + i, name: "项目" }));
    useBoard.setState({ ...freshBoard(), tiers: [{ ...state().tiers[0], items }], pool: [{ id: "p", name: "待拖入" }] });

    state().moveItem("p", state().tiers[0].id, 0);

    expect(state().pool.some(i => i.id === "p")).toBe(true);
    expect(state().tiers[0].items).toHaveLength(BOARD_LIMITS.itemsPerTier);
  });

  it("updateItem 统一夹紧名称长度与歪斜角度", () => {
    const id = state().tiers[0].items[0].id;
    state().updateItem(id, { name: "名".repeat(200), tilt: 999 });

    const item = state().tiers[0].items[0];
    expect(Array.from(item.name)).toHaveLength(BOARD_LIMITS.itemName);
    expect(item.tilt).toBe(BOARD_LIMITS.tilt);
  });

  it("updateTier 拒绝非法颜色，名称超长截断", () => {
    const id = state().tiers[0].id;
    state().updateTier(id, { name: "档".repeat(50), color: "url(https://evil)" });

    expect(state().tiers[0].name).toHaveLength(BOARD_LIMITS.tierName);
    expect(state().tiers[0].color).toBe("#9AA5B1");
  });

  it("setDisplay 越界值被夹回面板范围", () => {
    state().setDisplay({ cardFontSize: 999, tiltMax: -100, rowGap: NaN });
    expect(state().display.cardFontSize).toBe(24);
    expect(state().display.tiltMax).toBe(5);
    expect(state().display.rowGap).toBe(DEFAULT_DISPLAY.rowGap);
  });
});

describe("不依赖拖拽的移动（触屏备用路径）", () => {
  it("档位内上移 / 下移一位", () => {
    const tier = state().tiers[0];
    const [a, b] = tier.items.map(i => i.id);

    expect(state().nudgeItem(b, -1)).toBe(true);
    expect(state().tiers[0].items.map(i => i.id)).toEqual([b, a]);

    expect(state().nudgeItem(b, 1)).toBe(true);
    expect(state().tiers[0].items.map(i => i.id)).toEqual([a, b]);
  });

  it("项目库内上移 / 下移一位", () => {
    useBoard.setState({ pool: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }] });

    expect(state().nudgeItem("p2", -1)).toBe(true);
    expect(state().pool.map(i => i.id)).toEqual(["p2", "p1"]);
    expect(state().nudgeItem("p2", 1)).toBe(true);
    expect(state().pool.map(i => i.id)).toEqual(["p1", "p2"]);
  });

  it("已经在两端时返回 false，数据不动", () => {
    const tier = state().tiers[0];
    const first = tier.items[0].id;
    const last = tier.items[tier.items.length - 1].id;

    expect(state().nudgeItem(first, -1)).toBe(false);
    expect(state().nudgeItem(last, 1)).toBe(false);
    expect(state().tiers[0].items[0].id).toBe(first);
  });

  it("移到下一档：追加到目标档位末尾，并从原档位移除", () => {
    const moving = state().tiers[0].items[0].id;
    const targetBefore = state().tiers[1].items.map(i => i.id);

    expect(state().shiftItem(moving, 1)).toBe(true);

    expect(state().tiers[0].items.some(i => i.id === moving)).toBe(false);
    expect(state().tiers[1].items.map(i => i.id)).toEqual([...targetBefore, moving]);
  });

  it("移到上一档：回到前一个档位", () => {
    const moving = state().tiers[2].items[0].id;
    expect(state().shiftItem(moving, -1)).toBe(true);
    expect(state().tiers[1].items.some(i => i.id === moving)).toBe(true);
  });

  it("最后一个档位继续下移会回到项目库；项目库上移回到最后一个档位", () => {
    const lastTier = state().tiers[4];
    const moving = lastTier.items[0].id;
    expect(state().shiftItem(moving, 1)).toBe(true);
    expect(state().pool.some(i => i.id === moving)).toBe(true);

    expect(state().shiftItem(moving, -1)).toBe(true);
    expect(state().tiers[4].items.some(i => i.id === moving)).toBe(true);
    expect(state().pool.some(i => i.id === moving)).toBe(false);
  });

  it("第一档继续上移返回 false", () => {
    const moving = state().tiers[0].items[0].id;
    expect(state().shiftItem(moving, -1)).toBe(false);
    expect(state().tiers[0].items[0].id).toBe(moving);
  });

  it("目标档位已满时拒绝移动，条目还在原处", () => {
    const items: Item[] = Array.from({ length: BOARD_LIMITS.itemsPerTier }, (_, i) => ({ id: "full-" + i, name: "满" }));
    useBoard.setState({
      ...freshBoard(),
      tiers: state().tiers.map((t, i) => (i === 1 ? { ...t, items } : t)),
    });
    const moving = state().tiers[0].items[0].id;

    expect(state().shiftItem(moving, 1)).toBe(false);
    expect(state().tiers[0].items[0].id).toBe(moving);
  });

  it("移动会被记入撤销栈，可以整体回退", () => {
    const moving = state().tiers[0].items[0].id;
    state().shiftItem(moving, 1);
    state().undo();
    expect(state().tiers[0].items.some(i => i.id === moving)).toBe(true);
  });
});

describe("档位排序（触屏备用操作）", () => {
  it("上移 / 下移一位", () => {
    const [a, b] = state().tiers.map(t => t.id);

    expect(state().moveTier(b, -1)).toBeUndefined();
    expect(state().tiers.map(t => t.id).slice(0, 2)).toEqual([b, a]);

    state().moveTier(b, 1);
    expect(state().tiers.map(t => t.id).slice(0, 2)).toEqual([a, b]);
  });

  it("第一档上移 / 最后一档下移都不动数据", () => {
    const before = state().tiers.map(t => t.id);
    state().moveTier(before[0], -1);
    state().moveTier(before[before.length - 1], 1);
    expect(state().tiers.map(t => t.id)).toEqual(before);
  });
});
