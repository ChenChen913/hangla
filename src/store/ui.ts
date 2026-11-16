import { create } from "zustand";
import type { Item } from "../types";

/** 编辑器浮层 UI 状态（跨组件打开弹窗用） */
type UiStore = {
  itemDialog: { open: boolean; item: Item | null };
  shareOpen: boolean;
  /** 批量图片处理进度（只存在内存里，不写 localStorage） */
  imageProgress: { done: number; total: number } | null;
  openItemDialog(item?: Item): void;
  closeItemDialog(): void;
  setShareOpen(open: boolean): void;
  setImageProgress(progress: { done: number; total: number } | null): void;
};

export const useUi = create<UiStore>(set => ({
  itemDialog: { open: false, item: null },
  shareOpen: false,
  imageProgress: null,
  openItemDialog: item => set({ itemDialog: { open: true, item: item ?? null } }),
  closeItemDialog: () => set({ itemDialog: { open: false, item: null } }),
  setShareOpen: shareOpen => set({ shareOpen }),
  setImageProgress: imageProgress => set({ imageProgress }),
}));
