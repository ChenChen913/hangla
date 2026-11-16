/**
 * 同容器拖拽的落点换算。
 *
 * dnd-kit 在 onDragEnd 里给的是「被悬停项在数组中的下标」；
 * 而 store 的 moveItem 接收的是「移除自身后要插入的下标」。
 * 两者在向下拖时不相等：向下拖要 +1（插到目标项之后），
 * 向上拖用原下标（插到目标项之前），落在容器空白处则放末尾。
 */
export function resolveDropIndex(ids: string[], activeId: string, overId: string | null): number {
  const from = ids.indexOf(activeId);
  if (from < 0) return ids.length;
  if (overId === null) return ids.length;
  const over = ids.indexOf(overId);
  if (over < 0) return ids.length;
  if (over === from) return from;
  return over < from ? over : over + 1;
}

export type ItemLocation = {
  /** 档位 id，或项目库 "pool" */
  container: "pool" | string;
  /** 在所属容器里的下标 */
  index: number;
  /** 在 tiers 数组里的下标；项目库为 null */
  tierIndex: number | null;
};

/** 条目当前在哪个容器、第几位（上移/下移与换档的按钮状态都靠它） */
export function locateItem(
  board: { tiers: Array<{ id: string; items: Array<{ id: string }> }>; pool: Array<{ id: string }> },
  id: string,
): ItemLocation | null {
  for (let i = 0; i < board.tiers.length; i++) {
    const index = board.tiers[i].items.findIndex(x => x.id === id);
    if (index >= 0) return { container: board.tiers[i].id, index, tierIndex: i };
  }
  const index = board.pool.findIndex(x => x.id === id);
  return index >= 0 ? { container: "pool", index, tierIndex: null } : null;
}
