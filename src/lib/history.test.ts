import { describe, expect, it } from "vitest";
import type { Board } from "../types";
import { boardSnapshot, createHistory, sameBoard } from "./history";

const board = (title: string): Board => ({
  title,
  style: "classic",
  mode: "day",
  presetId: "hangla",
  tiers: [],
  pool: [],
});

describe("createHistory", () => {
  it("推一步就能撤销回推之前", () => {
    const h = createHistory();
    h.push(board("A"));
    const back = h.undo(board("B"));
    expect(back?.title).toBe("A");
    expect(h.sizes()).toEqual({ past: 0, future: 1 });
  });

  it("空栈撤销返回 null，不抛错", () => {
    expect(createHistory().undo(board("A"))).toBeNull();
  });

  it("撤销之后的重做能回到撤销前", () => {
    const h = createHistory();
    h.push(board("A"));
    h.undo(board("B"));
    expect(h.redo(board("A"))?.title).toBe("B");
  });

  it("撤销后产生新改动会清空重做栈", () => {
    const h = createHistory();
    h.push(board("A"));
    h.undo(board("B"));
    h.push(board("A"));
    expect(h.sizes().future).toBe(0);
    expect(h.redo(board("C"))).toBeNull();
  });

  it("可合并的连续输入只占一步", () => {
    const h = createHistory({ mergeWindow: 600 });
    h.push(board("A"), 1000, true);
    h.push(board("AB"), 1200, true);
    h.push(board("ABC"), 1400, true);
    expect(h.sizes().past).toBe(1);
    expect(h.undo(board("ABCD"))?.title).toBe("A");
  });

  it("超出合并窗口就另起一步", () => {
    const h = createHistory({ mergeWindow: 600 });
    h.push(board("A"), 1000, true);
    h.push(board("AB"), 2000, true);
    expect(h.sizes().past).toBe(2);
  });

  it("结构改动永不合并（哪怕挨得很近）", () => {
    const h = createHistory({ mergeWindow: 600 });
    h.push(board("A"), 1000, false);
    h.push(board("B"), 1010, false);
    expect(h.sizes().past).toBe(2);
  });

  it("打字紧跟在一记拖拽后面，不会被并进拖拽那一步", () => {
    const h = createHistory({ mergeWindow: 600 });
    h.push(board("A"), 1000, false); // 拖拽
    h.push(board("B"), 1010, true); // 紧接着打字
    expect(h.sizes().past).toBe(2);
    h.push(board("BC"), 1020, true); // 继续打
    expect(h.sizes().past).toBe(2);
  });

  it("超过上限时丢掉最老的一步", () => {
    const h = createHistory({ limit: 3 });
    for (const t of ["A", "B", "C", "D"]) h.push(board(t), Math.random() * 1e9, false);
    expect(h.sizes().past).toBe(3);
    expect(h.undo(board("E"))?.title).toBe("D");
  });

  it("clear 之后两边都空", () => {
    const h = createHistory();
    h.push(board("A"));
    h.undo(board("B"));
    h.clear();
    expect(h.sizes()).toEqual({ past: 0, future: 0 });
  });
});

describe("boardSnapshot / sameBoard", () => {
  it("只取可见榜单字段，display 之类的呈现设置不进历史", () => {
    const snap = boardSnapshot(board("A"));
    expect(Object.keys(snap).sort()).toEqual(["mode", "pool", "presetId", "style", "subtitle", "tiers", "title"]);
  });

  it("引用相同即视为没变（store 是结构共享的）", () => {
    const a = board("A");
    expect(sameBoard(a, a)).toBe(true);
    expect(sameBoard(a, board("A"))).toBe(false);
  });
});
