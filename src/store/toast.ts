import { create } from "zustand";
import { uid } from "../lib/utils";

type ToastItem = { id: string; msg: string };

export const useToasts = create<{
  toasts: ToastItem[];
  push(msg: string): void;
  remove(id: string): void;
}>(set => ({
  toasts: [],
  push: msg => {
    const id = uid();
    set(s => ({ toasts: [...s.toasts.slice(-2), { id, msg }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 900);
  },
  remove: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

export const toast = (msg: string) => useToasts.getState().push(msg);
