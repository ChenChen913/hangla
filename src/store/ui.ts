import { create } from "zustand";
import type { Item } from "../types";

/** 待保存的导出图（Blob + 预览地址）；只在内存里，关掉面板即释放 */
export type PendingImage = {
  url: string;
  blob: Blob;
  filename: string;
};

/** 编辑器浮层 UI 状态（跨组件打开弹窗用） */
type UiStore = {
  itemDialog: { open: boolean; item: Item | null };
  shareOpen: boolean;
  /** 批量图片处理进度（只存在内存里，不写 localStorage） */
  imageProgress: { done: number; total: number } | null;
  /** 手机端导出 PNG 后的「保存图片」面板（桌面端直接下载，不经过这里） */
  pendingImage: PendingImage | null;
  openItemDialog(item?: Item): void;
  closeItemDialog(): void;
  setShareOpen(open: boolean): void;
  setImageProgress(progress: { done: number; total: number } | null): void;
  setPendingImage(image: PendingImage | null): void;
};

export const useUi = create<UiStore>(set => ({
  itemDialog: { open: false, item: null },
  shareOpen: false,
  imageProgress: null,
  pendingImage: null,
  openItemDialog: item => set({ itemDialog: { open: true, item: item ?? null } }),
  closeItemDialog: () => set({ itemDialog: { open: false, item: null } }),
  setShareOpen: shareOpen => set({ shareOpen }),
  setImageProgress: imageProgress => set({ imageProgress }),
  setPendingImage: pendingImage => set({ pendingImage }),
}));
