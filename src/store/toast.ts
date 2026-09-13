import { create } from "zustand";
import { uid } from "../lib/utils";

type ToastItem = { id: string; msg: string };

/** 默认停留时长：中文提示读完大约要 2 秒，900ms 太短了 */
const DEFAULT_MS = 2200;

export const useToasts = create<{
  toasts: ToastItem[];
  push(msg: string, ms?: number): void;
  remove(id: string): void;
}>((set) => ({
  toasts: [],
  push: (msg, ms = DEFAULT_MS) => {
    const id = uid();
    set(s => ({ toasts: [...s.toasts.slice(-2), { id, msg }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), ms);
  },
  remove: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

export const toast = (msg: string, ms?: number) => useToasts.getState().push(msg, ms);
