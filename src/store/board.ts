import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Board, DisplaySettings, Item, Snapshot, Tier } from "../types";
import type { Mode, StyleId } from "../lib/themes";
import { presetTiers } from "../lib/presets";
import { MODE_NAMES, STYLE_NAMES } from "../lib/themes";
import {
  BOARD_LIMITS,
  DEFAULT_DISPLAY,
  clamp,
  normalizeBoard,
  normalizeDisplay,
  normalizeItem,
  safeTierColor,
  truncateText,
  uid,
} from "../lib/utils";
import { STORAGE_KEY, createBoardStorage } from "../lib/storage";
import { locateItem } from "../lib/drag";
import { boardSnapshot, createHistory, sameBoard } from "../lib/history";
import { toast } from "./toast";

const PALETTE = ["#E8934A", "#55A878", "#7D96B8", "#B583D6", "#E15D5D", "#E9B44C", "#9AA5B1"];

/** 快照份数上限：再多就会把 localStorage 配额吃光，也没人会翻到第 31 份 */
export const MAX_SNAPSHOTS = 30;
// 持久化 key 定义在存储层（探测需要它），这里转出以保持既有引用路径
export { STORAGE_KEY };

export function freshBoard(): Board {
  const tiers = presetTiers("hangla")!;
  const put = (i: number, items: [string, string?][]) =>
    items.forEach(([name, desc]) => tiers[i].items.push({ id: uid(), name, desc }));
  put(0, [
    ["ChatGPT", "通用型 AI 助手的代名词"],
    ["Claude", "长文写作与代码能力顶尖"],
  ]);
  put(1, [
    ["Gemini", "多模态与搜索生态无敌"],
    ["DeepSeek", "开源之光，性价比爆表"],
  ]);
  put(2, [
    ["豆包", "中文场景顺手，全家桶联动"],
    ["Kimi", "长文本赛道起家"],
  ]);
  put(3, [
    ["元宝", "腾讯出品，稳扎稳打"],
    ["通义", "阿里开源家族门面"],
  ]);
  put(4, [["等你来补充", "谁会第一个拉完？"]]);
  return {
    title: "2026 年 AI 大模型从夯到拉",
    subtitle: "从夯到拉 · 主观锐评版",
    style: "classic",
    mode: "day",
    presetId: "hangla",
    tiers,
    pool: [],
  };
}

type BoardStore = Board & {
  snapshots: Snapshot[];
  display: DisplaySettings;
  /** 撤销 / 重做可用步数（只用于按钮置灰，不进 localStorage） */
  history: { past: number; future: number };
  setTitle(title: string): void;
  setSubtitle(subtitle: string): void;
  setStyle(style: StyleId): void;
  /** 切换当前风格的白天/黑夜 */
  toggleMode(): void;
  addTier(): void;
  deleteTier(id: string): void;
  updateTier(id: string, patch: Partial<Pick<Tier, "name" | "color">>): void;
  moveTier(id: string, dir: -1 | 1): void;
  /** 只替换档位配色（保留名称与项目），用于风格 ↔ 配色联动 */
  applyPresetColors(presetId: string): void;
  /** keepItems=true：项目按档位顺序跟着切到新档位（多余项目进项目库）；false：全部清回项目库 */
  applyPreset(presetId: string, keepItems?: boolean): void;
  addItemToPool(item: Item): void;
  /** toTierId 存在时直接落到该档位（把图片拖到档位行上），否则进项目库 */
  addImagesToPool(items: Item[], toTierId?: string): void;
  updateItem(id: string, patch: Partial<Omit<Item, "id">>): void;
  removeItem(id: string): void;
  /** 在当前容器内上移 / 下移一位（不依赖拖拽的备用操作）；越界返回 false */
  nudgeItem(id: string, dir: -1 | 1): boolean;
  /** 移到相邻档位（最后一个档位的下一档是项目库，项目库的上一档是最后一个档位） */
  shiftItem(id: string, dir: -1 | 1): boolean;
  moveItem(id: string, toTierId: string | null, index: number): void;
  importBoard(b: Partial<Board>): void;
  /**
   * 只把数据存成快照，**不碰编辑器**。
   * 导入 JSON 走这条：失败时编辑器一个字节都不会变，成功也不会污染撤销栈。
   */
  importBoardAsSnapshot(raw: unknown): { ok: true; title: string } | { ok: false; reason: string };
  resetBoard(): void;
  saveSnapshot(): void;
  deleteSnapshot(id: string): void;
  loadSnapshot(id: string): boolean;
  setDisplay(patch: Partial<DisplaySettings>): void;
  undo(): void;
  redo(): void;
};

/** 落盘的部分（与 partialize 一一对应） */
export type PersistedBoard = {
  title: string;
  subtitle?: string;
  style: StyleId;
  mode: Mode;
  presetId: string;
  tiers: Tier[];
  pool: Item[];
  snapshots: Snapshot[];
  display: DisplaySettings;
};

/** 撤销栈只在内存里：不进 localStorage，否则历史会把图片配额一起吃光 */
const undoStack = createHistory({ limit: 50, mergeWindow: 600 });
/** 撤销 / 重做落状态时不要再记一条历史 */
let restoring = false;

/** 清空撤销栈。刷新 / 跨标签页水合时调用；测试用它隔离用例之间的历史 */
export function resetHistory(): void {
  undoStack.clear();
  useBoard.setState({ history: undoStack.sizes() });
}

/** 快照规范化：旧快照没有 display，保持 undefined（= 沿用本机设置） */
function normalizeSnapshot(raw: unknown, seen: Set<string>): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const board = normalizeBoard(r.board);
  const candidate =
    typeof r.id === "string" && r.id.trim() !== "" && r.id.length <= BOARD_LIMITS.id ? r.id : uid();
  const id = seen.has(candidate) ? uid() : candidate;
  seen.add(id);
  const rawTitle = typeof r.title === "string" ? r.title : board.title;
  return {
    id,
    title: truncateText(rawTitle.trim(), BOARD_LIMITS.title) || "未命名榜单",
    savedAt: typeof r.savedAt === "number" && Number.isFinite(r.savedAt) ? r.savedAt : Date.now(),
    board,
    display: r.display == null ? undefined : normalizeDisplay(r.display),
  };
}

export const useBoard = create<BoardStore>()(
  persist(
    (set, get) => ({
      ...freshBoard(),
      snapshots: [],
      history: { past: 0, future: 0 },
      display: { ...DEFAULT_DISPLAY },

      setTitle: title => set({ title: truncateText(title, BOARD_LIMITS.title) }),
      setSubtitle: subtitle => {
        const t = truncateText(subtitle, BOARD_LIMITS.subtitle);
        set({ subtitle: t || undefined });
      },
      setStyle: style => set({ style }),
      toggleMode: () => {
        const s = get();
        const next: Mode = s.mode === "day" ? "night" : "day";
        set({ mode: next });
        toast(`已切换到${STYLE_NAMES[s.style] ?? ""}${MODE_NAMES[next]}配色`);
      },

      addTier: () => {
        const s = get();
        if (s.tiers.length >= BOARD_LIMITS.tiers) {
          toast(`最多 ${BOARD_LIMITS.tiers} 个档位，再多屏幕也放不下`);
          return;
        }
        set({
          tiers: [
            ...s.tiers,
            {
              id: uid(),
              name: "新档位",
              color: PALETTE[s.tiers.length % PALETTE.length],
              items: [],
            },
          ],
          presetId: "custom",
        });
      },

      deleteTier: id =>
        set(s => {
          const tier = s.tiers.find(t => t.id === id);
          if (!tier) return {};
          return {
            tiers: s.tiers.filter(t => t.id !== id),
            pool: [...s.pool, ...tier.items],
            presetId: "custom",
          };
        }),

      updateTier: (id, patch) =>
        set(s => ({
          tiers: s.tiers.map(t =>
            t.id === id
              ? {
                  ...t,
                  name: patch.name === undefined ? t.name : truncateText(patch.name.trim(), BOARD_LIMITS.tierName) || t.name,
                  color: patch.color === undefined ? t.color : safeTierColor(patch.color),
                }
              : t,
          ),
          presetId: "custom",
        })),

      moveTier: (id, dir) =>
        set(s => {
          const i = s.tiers.findIndex(t => t.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= s.tiers.length) return {};
          const tiers = [...s.tiers];
          [tiers[i], tiers[j]] = [tiers[j], tiers[i]];
          return { tiers, presetId: "custom" };
        }),

      applyPresetColors: presetId =>
        set(s => {
          const p = presetTiers(presetId);
          if (!p) return {};
          return {
            tiers: s.tiers.map((t, i) => ({ ...t, color: p[i]?.color ?? t.color })),
            presetId: "custom",
          };
        }),

      applyPreset: (presetId, keepItems = false) =>
        set(s => {
          const tiers = presetTiers(presetId);
          if (!tiers) return {};
          if (keepItems) {
            // 项目按档位位置映射到新档位；新档位装不下的进项目库
            tiers.forEach((t, i) => {
              t.items = [...(s.tiers[i]?.items ?? [])];
            });
            const overflow = s.tiers.slice(tiers.length).flatMap(t => t.items);
            return { tiers, pool: [...s.pool, ...overflow], presetId };
          }
          return { tiers, pool: [...s.pool, ...s.tiers.flatMap(t => t.items)], presetId };
        }),

      addItemToPool: item => {
        const s = get();
        if (s.pool.length >= BOARD_LIMITS.pool) {
          toast(`项目库最多 ${BOARD_LIMITS.pool} 项，先清理一些再添加`);
          return;
        }
        set({ pool: [...s.pool, normalizeItem({ ...item, id: item.id })] });
      },

      addImagesToPool: (items, toTierId) => {
        if (!items.length) return;
        const s = get();
        const safeItems = items.map(i => normalizeItem(i));
        const tier = toTierId ? s.tiers.find(t => t.id === toTierId) : undefined;
        if (tier) {
          const room = Math.max(0, BOARD_LIMITS.itemsPerTier - tier.items.length);
          const add = safeItems.slice(0, room);
          if (!add.length) {
            toast(`这个档位已经有 ${BOARD_LIMITS.itemsPerTier} 项了，先挪走一些`);
            return;
          }
          if (add.length < safeItems.length) toast(`${safeItems.length - add.length} 张图片超出单档上限，已跳过`, 4000);
          set({ tiers: s.tiers.map(t => (t.id === tier.id ? { ...t, items: [...t.items, ...add] } : t)) });
          return;
        }
        const room = Math.max(0, BOARD_LIMITS.pool - s.pool.length);
        const add = safeItems.slice(0, room);
        if (!add.length) {
          toast(`项目库已经有 ${BOARD_LIMITS.pool} 项了，先清理一些`);
          return;
        }
        if (add.length < safeItems.length) toast(`${safeItems.length - add.length} 张图片超出项目库上限，已跳过`, 4000);
        set({ pool: [...s.pool, ...add] });
      },

      updateItem: (id, patch) =>
        set(s => {
          // 走和导入同一条规范化路径：名称 / 描述 / 图片 / 角度都在这里被夹紧
          const apply = (i: Item) =>
            i.id === id ? { ...normalizeItem({ ...i, ...patch, id: i.id }), id: i.id } : i;
          return {
            pool: s.pool.map(apply),
            tiers: s.tiers.map(t => ({ ...t, items: t.items.map(apply) })),
          };
        }),

      removeItem: id =>
        set(s => ({
          pool: s.pool.filter(i => i.id !== id),
          tiers: s.tiers.map(t => ({ ...t, items: t.items.filter(i => i.id !== id) })),
        })),

      nudgeItem: (id, dir) => {
        const s = get();
        const loc = locateItem(s, id);
        if (!loc) return false;
        const list = loc.container === "pool" ? s.pool : s.tiers[loc.tierIndex!].items;
        const target = loc.index + dir;
        if (target < 0 || target >= list.length) return false;

        // 直接换位，不复用 moveItem 的"插入下标"语义：那个语义对同容器下移要 +2，容易算错
        const next = [...list];
        const [item] = next.splice(loc.index, 1);
        next.splice(target, 0, item);

        if (loc.container === "pool") set({ pool: next });
        else set({ tiers: s.tiers.map(t => (t.id === loc.container ? { ...t, items: next } : t)) });
        return true;
      },

      shiftItem: (id, dir) => {
        const s = get();
        const loc = locateItem(s, id);
        if (!loc) return false;
        // 容器顺序：档位 1..N，最后是项目库
        const order = [...s.tiers.map(t => t.id), "pool"];
        const from = order.indexOf(loc.container);
        const to = from + dir;
        if (from < 0 || to < 0 || to >= order.length) return false;
        const targetId = order[to];
        const item =
          loc.container === "pool" ? s.pool[loc.index] : s.tiers[loc.tierIndex!].items[loc.index];

        if (targetId === "pool") {
          if (s.pool.length >= BOARD_LIMITS.pool) {
            toast(`项目库最多 ${BOARD_LIMITS.pool} 项`);
            return false;
          }
          const tiers = s.tiers.map(t =>
            t.id === loc.container ? { ...t, items: t.items.filter(i => i.id !== id) } : t,
          );
          set({ tiers, pool: [...s.pool, item] });
          return true;
        }

        const target = s.tiers.find(t => t.id === targetId)!;
        if (target.items.length >= BOARD_LIMITS.itemsPerTier) {
          toast(`这个档位最多 ${BOARD_LIMITS.itemsPerTier} 项`);
          return false;
        }
        const cleaned = s.tiers.map(t =>
          t.id === loc.container ? { ...t, items: t.items.filter(i => i.id !== id) } : t,
        );
        set({
          tiers: cleaned.map(t => (t.id === targetId ? { ...t, items: [...t.items, item] } : t)),
          ...(loc.container === "pool" ? { pool: s.pool.filter(i => i.id !== id) } : {}),
        });
        return true;
      },

      moveItem: (id, toTierId, index) =>
        set(s => {
          const pool = [...s.pool];
          const tiers = s.tiers.map(t => ({ ...t, items: [...t.items] }));

          let where: "pool" | string | null = null;
          let fromIdx = -1;
          const pi = pool.findIndex(i => i.id === id);
          if (pi >= 0) {
            where = "pool";
            fromIdx = pi;
          } else {
            for (const t of tiers) {
              const i = t.items.findIndex(x => x.id === id);
              if (i >= 0) {
                where = t.id;
                fromIdx = i;
                break;
              }
            }
          }
          if (!where || fromIdx < 0) return {};

          const item = where === "pool" ? pool[fromIdx] : tiers.find(t => t.id === where)!.items[fromIdx];

          const targetKey = toTierId ?? "pool";
          // 目标是同一档位时只是排序，不算新增占位
          if (where !== targetKey) {
            if (toTierId === null) {
              if (pool.length >= BOARD_LIMITS.pool) {
                toast(`项目库最多 ${BOARD_LIMITS.pool} 项`);
                return {};
              }
            } else {
              const target = tiers.find(t => t.id === toTierId);
              if (!target) return {};
              if (target.items.length >= BOARD_LIMITS.itemsPerTier) {
                toast(`这个档位最多 ${BOARD_LIMITS.itemsPerTier} 项`);
                return {};
              }
            }
          }

          let idx = index;
          if (where === targetKey && fromIdx < idx) idx -= 1;

          if (where === "pool") pool.splice(fromIdx, 1);
          else tiers.find(t => t.id === where)!.items.splice(fromIdx, 1);

          if (toTierId === null) {
            pool.splice(clamp(idx, 0, pool.length), 0, item);
            return { pool, tiers };
          }
          const target = tiers.find(t => t.id === toTierId);
          if (!target) return {};
          target.items.splice(clamp(idx, 0, target.items.length), 0, item);
          return { pool, tiers };
        }),

      importBoard: b =>
        set(s => {
          const n = normalizeBoard({ ...s, ...b });
          return {
            title: n.title,
            subtitle: n.subtitle,
            style: n.style,
            mode: n.mode,
            presetId: n.presetId,
            tiers: n.tiers,
            pool: n.pool,
          };
        }),

      importBoardAsSnapshot: raw => {
        const n = normalizeBoard(raw);
        if (n.tiers.length === 0) return { ok: false, reason: "榜单里没有任何有效档位" };
        const snap: Snapshot = {
          id: uid(),
          title: n.title || "未命名榜单",
          savedAt: Date.now(),
          board: n,
          // 导入的 JSON 不带显示设置：用本机当前的，之后预览 / 恢复都能复现
          display: { ...get().display },
        };
        set(s => ({ snapshots: [snap, ...s.snapshots].slice(0, MAX_SNAPSHOTS) }));
        return { ok: true, title: snap.title };
      },

      resetBoard: () => set({ ...freshBoard(), snapshots: get().snapshots }),

      saveSnapshot: () =>
        set(s => {
          const board: Board = {
            title: s.title,
            subtitle: s.subtitle,
            style: s.style,
            mode: s.mode,
            presetId: s.presetId,
            // store 的更新全部是结构共享的不可变写法，快照只需复制容器层：
            // 条目对象与图片字符串与当前榜单共用，避免 30 份快照各存一份 base64 拷贝。
            tiers: s.tiers.map(t => ({ ...t, items: [...t.items] })),
            pool: [...s.pool],
          };
          const snap: Snapshot = {
            id: uid(),
            title: s.title || "未命名榜单",
            savedAt: Date.now(),
            board,
            // 快照是一份「成品」：连当时的字号 / 歪斜 / 图片显隐一起存，
            // 预览和恢复才能和保存时长得一模一样
            display: { ...s.display },
          };
          return { snapshots: [snap, ...s.snapshots].slice(0, MAX_SNAPSHOTS) };
        }),

      deleteSnapshot: id => set(s => ({ snapshots: s.snapshots.filter(x => x.id !== id) })),

      loadSnapshot: id => {
        const snap = get().snapshots.find(x => x.id === id);
        if (!snap) return false;
        set({
          ...normalizeBoard(snap.board),
          // 旧快照没有 display：只恢复榜单内容，本机显示设置保持不动
          ...(snap.display ? { display: normalizeDisplay(snap.display) } : {}),
        });
        return true;
      },

      setDisplay: patch => set(s => ({ display: normalizeDisplay({ ...s.display, ...patch }) })),

      undo: () => {
        const prev = undoStack.undo(boardSnapshot(get()));
        if (!prev) return;
        restoring = true;
        try {
          set({ ...prev, history: undoStack.sizes() });
        } finally {
          restoring = false;
        }
      },

      redo: () => {
        const next = undoStack.redo(boardSnapshot(get()));
        if (!next) return;
        restoring = true;
        try {
          set({ ...next, history: undoStack.sizes() });
        } finally {
          restoring = false;
        }
      },
    }),
    {
      name: STORAGE_KEY,
      version: 10,
      // 存储层负责：图片驻留去重、单 Key 原子写入、写失败兜底、存储可用性探测
      storage: createBoardStorage<PersistedBoard>({
        onWriteError: () =>
          toast("浏览器存储已满，刚才这一步没保存下来——先导出 PNG 备份，再删掉几张图片重试", 6000),
        onNearLimit: bytes =>
          toast(`浏览器存储快用满了（${(bytes / 1024 / 1024).toFixed(1)}MB），建议先导出 PNG 备份`, 5000),
      }),
      partialize: (s): PersistedBoard => ({
        title: s.title,
        subtitle: s.subtitle,
        style: s.style,
        mode: s.mode,
        presetId: s.presetId,
        tiers: s.tiers,
        pool: s.pool,
        snapshots: s.snapshots,
        display: s.display,
      }),
      migrate: (persisted: unknown): PersistedBoard => {
        // 存档来自旧版本 / 被手工改过，任何字段都可能缺或类型不对：
        // 统一走 normalizeBoard + normalizeDisplay，逐项夹到合法范围
        const seen = new Set<string>();
        const raw = (persisted && typeof persisted === "object" ? persisted : {}) as Record<string, unknown>;
        const snaps = (Array.isArray(raw.snapshots) ? raw.snapshots : [])
          .map(x => normalizeSnapshot(x, seen))
          .filter((x): x is Snapshot => x !== null)
          .slice(0, MAX_SNAPSHOTS);
        return {
          ...normalizeBoard(raw),
          snapshots: snaps,
          display: normalizeDisplay(raw.display),
        };
      },
    },
  ),
);

/**
 * 自动记录历史：不改动任何 action，靠订阅比对「可见榜单字段」有没有变。
 * 只影响呈现的字段（display / snapshots）不记历史，撤销不会莫名其妙地改字体大小。
 */
useBoard.subscribe((state, prev) => {
  if (restoring) return;
  const before = boardSnapshot(prev);
  const after = boardSnapshot(state);
  if (sameBoard(before, after)) return;
  // 只有标题 / 副标题变了才算「可合并」的连续输入；档位、条目、风格、明暗一变就是独立一步
  const structural =
    before.tiers !== after.tiers ||
    before.pool !== after.pool ||
    before.style !== after.style ||
    before.mode !== after.mode ||
    before.presetId !== after.presetId;
  undoStack.push(before, Date.now(), !structural);
  useBoard.setState({ history: undoStack.sizes() });
});

// 刷新页面 / 跨标签页重新水合不是用户操作：清空历史，
// 否则「撤销」会把这之后的编辑倒退回存档里没有的状态。
useBoard.persist.onFinishHydration(() => {
  resetHistory();
});
if (useBoard.persist.hasHydrated()) resetHistory();
