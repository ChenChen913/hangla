import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Board, DisplaySettings, Item, Snapshot, Tier } from "../types";
import { presetTiers } from "../lib/presets";
import { MODE_NAMES, STYLE_NAMES } from "../lib/themes";
import { clamp, normalizeBoard, uid } from "../lib/utils";
import { toast } from "./toast";

const PALETTE = ["#E8934A", "#55A878", "#7D96B8", "#B583D6", "#E15D5D", "#E9B44C", "#9AA5B1"];

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
  setTitle(title: string): void;
  setSubtitle(subtitle: string): void;
  setStyle(style: string): void;
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
  addImagesToPool(items: Item[]): void;
  updateItem(id: string, patch: Partial<Omit<Item, "id">>): void;
  removeItem(id: string): void;
  moveItem(id: string, toTierId: string | null, index: number): void;
  importBoard(b: Partial<Board>): void;
  resetBoard(): void;
  saveSnapshot(): void;
  deleteSnapshot(id: string): void;
  loadSnapshot(id: string): boolean;
  setDisplay(patch: Partial<DisplaySettings>): void;
};

export const useBoard = create<BoardStore>()(
  persist(
    (set, get) => ({
      ...freshBoard(),
      snapshots: [],
      display: { showImages: true, showNames: true, tiltImages: false, tiltMax: 20, cardFont: "", cardFontSize: 15, cardFontWeight: 500, cardImageSize: 56, labelFont: "standard", labelAnim: "standard", labelFlat: false, rowGap: 12 },

      setTitle: title => set({ title }),
      setSubtitle: subtitle => set({ subtitle: subtitle || undefined }),
      setStyle: style => set({ style }),
      toggleMode: () => {
        const s = get();
        const next = s.mode === "day" ? "night" : "day";
        set({ mode: next });
        toast(`已切换到${STYLE_NAMES[(s.style as keyof typeof STYLE_NAMES)] ?? ""}${MODE_NAMES[next]}配色`);
      },

      addTier: () =>
        set(s => ({
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
        })),

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
          tiers: s.tiers.map(t => (t.id === id ? { ...t, ...patch } : t)),
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

      addItemToPool: item => set(s => ({ pool: [...s.pool, item] })),

      addImagesToPool: items => set(s => ({ pool: [...s.pool, ...items] })),

      updateItem: (id, patch) =>
        set(s => ({
          pool: s.pool.map(i => (i.id === id ? { ...i, ...patch } : i)),
          tiers: s.tiers.map(t => ({ ...t, items: t.items.map(i => (i.id === id ? { ...i, ...patch } : i)) })),
        })),

      removeItem: id =>
        set(s => ({
          pool: s.pool.filter(i => i.id !== id),
          tiers: s.tiers.map(t => ({ ...t, items: t.items.filter(i => i.id !== id) })),
        })),

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

      resetBoard: () => set({ ...freshBoard(), snapshots: get().snapshots }),

      saveSnapshot: () =>
        set(s => {
          const board: Board = {
            title: s.title,
            subtitle: s.subtitle,
            style: s.style,
            mode: s.mode,
            presetId: s.presetId,
            tiers: JSON.parse(JSON.stringify(s.tiers)),
            pool: JSON.parse(JSON.stringify(s.pool)),
          };
          const snap: Snapshot = { id: uid(), title: s.title || "未命名榜单", savedAt: Date.now(), board };
          return { snapshots: [snap, ...s.snapshots].slice(0, 30) };
        }),

      deleteSnapshot: id => set(s => ({ snapshots: s.snapshots.filter(x => x.id !== id) })),

      loadSnapshot: id => {
        const snap = get().snapshots.find(x => x.id === id);
        if (!snap) return false;
        set({ ...normalizeBoard(snap.board) });
        return true;
      },

      setDisplay: patch => set(s => ({ display: { ...s.display, ...patch } })),
    }),
    {
      name: "hangla.v3",
      version: 10,
      partialize: s => ({
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
      migrate: (persisted: unknown) => {
        const n = normalizeBoard(persisted);
        const snaps = Array.isArray((persisted as { snapshots?: Snapshot[] }).snapshots)
          ? ((persisted as { snapshots: Snapshot[] }).snapshots ?? []).map(x => ({
              ...x,
              board: normalizeBoard(x.board),
            }))
          : [];
        const d = ((persisted as { display?: Partial<DisplaySettings> }).display ?? {}) as Partial<DisplaySettings>;
        return {
          ...n,
          snapshots: snaps,
          display: {
            showImages: d.showImages ?? true,
            showNames: d.showNames ?? true,
            tiltImages: d.tiltImages ?? false,
            tiltMax: d.tiltMax ?? 20,
            cardFont: d.cardFont ?? "",
            cardFontSize: d.cardFontSize ?? 15,
            cardFontWeight: d.cardFontWeight ?? 500,
            cardImageSize: d.cardImageSize ?? 56,
            labelFont: d.labelFont === "artistic" ? "artistic" : "standard",
            labelAnim:
              d.labelAnim === "off" || d.labelAnim === "subtle" || d.labelAnim === "strong"
                ? d.labelAnim
                : "standard",
            labelFlat: d.labelFlat ?? false,
            rowGap: d.rowGap ?? 12,
          },
        };
      },
    },
  ),
);
