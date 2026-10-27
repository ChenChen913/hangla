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
