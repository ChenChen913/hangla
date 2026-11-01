import type { Board } from "../types";

/**
 * 撤销 / 重做栈。
 *
 * 设计取舍：
 * - **只存 Board 快照，且只存在内存里**：store 的更新全是结构共享的不可变写法，
 *   快照复用同一批条目对象与图片字符串，50 步也不会有额外内存压力；
 *   不进 localStorage，避免历史把 5MB 配额吃掉。
 * - **合并窗口**：标题逐字输入、副标题这类高频改动不该一步一条历史，
 *   `mergeWindow` 毫秒内的连续改动并成一步（保留最早的那个"改之前"状态）；
 *   结构改动（增删档位 / 拖拽 / 换风格）永不合并，每次都是独立的一步。
 * - 撤销 / 重做本身会重置合并窗口，避免紧接着的编辑被塞进上一条。
 */

export type HistoryOptions = {
  /** 最多保留多少步 */
  limit?: number;
  /** 合并窗口（毫秒）：窗口内的连续改动算一步 */
  mergeWindow?: number;
};

export type BoardHistory = {
  /**
   * 记一步「改动之前」的快照。
   * @param mergeable 可合并的改动（标题 / 副标题这类逐字输入）在窗口内并成一步；
   *                  结构改动（增删档位、拖拽、换风格）必须每步独立，否则一次撤销会回退好几件事。
   */
  push(snapshot: Board, at?: number, mergeable?: boolean): void;
  undo(current: Board): Board | null;
  redo(current: Board): Board | null;
  sizes(): { past: number; future: number };
  clear(): void;
};

export function createHistory(options: HistoryOptions = {}): BoardHistory {
  const limit = options.limit ?? 50;
  const mergeWindow = options.mergeWindow ?? 600;

  let past: Board[] = [];
  let future: Board[] = [];
  let lastAt = 0;
  /** 上一条历史是不是「可合并」的那种，避免打字紧跟在拖拽后面被并进拖拽那一步 */
  let lastMergeable = false;

  return {
    push(snapshot, at = Date.now(), mergeable = false) {
      future = [];
      // 合并：窗口内的连续同类改动不再新增历史点，已存的那条就是"这一串改动的起点"
      if (mergeable && lastMergeable && past.length > 0 && at - lastAt < mergeWindow) {
        lastAt = at;
        return;
      }
      past.push(snapshot);
      if (past.length > limit) past.shift();
      lastAt = at;
      lastMergeable = mergeable;
    },
    undo(current) {
      const prev = past.pop();
      if (!prev) return null;
      future.push(current);
      lastAt = 0;
      lastMergeable = false;
      return prev;
    },
    redo(current) {
      const next = future.pop();
      if (!next) return null;
      past.push(current);
      lastAt = 0;
      lastMergeable = false;
      return next;
    },
    sizes: () => ({ past: past.length, future: future.length }),
    clear() {
      past = [];
      future = [];
      lastAt = 0;
      lastMergeable = false;
    },
  };
}

/** 从 board 里取出需要进历史的那部分字段 */
export function boardSnapshot(s: Board): Board {
  return {
    title: s.title,
    subtitle: s.subtitle,
    style: s.style,
    mode: s.mode,
    presetId: s.presetId,
    tiers: s.tiers,
    pool: s.pool,
  };
}

/** 两份快照的可见状态是否一致（引用比较即可，store 是结构共享的） */
export function sameBoard(a: Board, b: Board): boolean {
  return (
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.style === b.style &&
    a.mode === b.mode &&
    a.presetId === b.presetId &&
    a.tiers === b.tiers &&
    a.pool === b.pool
  );
}
