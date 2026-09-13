import { create } from "zustand";
import type { Item } from "../types";

/** 编辑器浮层 UI 状态（跨组件打开弹窗用） */
type UiStore = {
  itemDialog: { open: boolean; item: Item | null };
  shareOpen: boolean;
  openItemDialog(item?: Item): void;
  closeItemDialog(): void;
  setShareOpen(open: boolean): void;
};

export const useUi = create<UiStore>(set => ({
  itemDialog: { open: false, item: null },
  shareOpen: false,
  openItemDialog: item => set({ itemDialog: { open: true, item: item ?? null } }),
  closeItemDialog: () => set({ itemDialog: { open: false, item: null } }),
  setShareOpen: shareOpen => set({ shareOpen }),
}));
