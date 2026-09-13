import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * 存档存储层。夹在 zustand persist 和 localStorage 中间，干三件事：
 *
 * 1. **图片驻留（intern）**：data URL 统一收进独立的图片库键，存档正文里只留 \u0000img:N 引用。
 *    同一张图被多份快照引用时只存一份——否则"最多 30 份快照"会在第 2 份就把 5MB 配额撑爆。
 * 2. **延迟合并写入**：拖拽经过档位、拉滑杆这类高频状态变更不必每次整份序列化写盘。
 * 3. **失败兜底**：localStorage 配额满会抛 QuotaExceededError（zustand 自己的 setItem 不 catch），
 *    这里捕获后回调通知界面，避免"界面上加进去了、刷新后没了"的静默丢数据。
 */

/** 引用 token 前缀。只出现在 image 字段上，用户自己起的名字不会与之冲突 */
const TOKEN = "\u0000img:";
const IMAGE_KEY_SUFFIX = "::images";

/** 各家浏览器配额不同（实测 Chrome 约 5MB），留出余量做"快满了"提示 */
export const STORAGE_SOFT_LIMIT = 4 * 1024 * 1024;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 优先用 localStorage；不可用（隐私模式 / 无 DOM）时退回内存实现，保证测试与降级都能跑 */
function pickBackend(): StorageLike {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.getItem("__hangla_probe__");
      return localStorage;
    }
  } catch {
    /* 隐私模式下访问 localStorage 会抛错，走内存兜底 */
  }
  const mem = new Map<string, string>();
  return {
    getItem: k => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: k => void mem.delete(k),
  };
}

/** 只在 image 字段上做替换，其余字符串原样保留 */
function mapImages<T>(node: T, fn: (value: string) => string): T {
  if (Array.isArray(node)) return node.map(n => mapImages(n, fn)) as unknown as T;
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = k === "image" && typeof v === "string" ? fn(v) : mapImages(v, fn);
    }
    return out as T;
  }
  return node;
}

export type BoardStorageOptions = {
  /** 合并写入的等待时间（毫秒） */
  delay?: number;
  /** 写盘失败（多半是配额满） */
  onWriteError?(error: unknown): void;
  /** 体积超过软上限 */
  onNearLimit?(bytes: number): void;
};

export function createBoardStorage<S = unknown>(options: BoardStorageOptions = {}): PersistStorage<S, unknown> {
  const { delay = 300, onWriteError, onNearLimit } = options;
  const backend = pickBackend();
  /** 图片库：data URL 数组，存档里的 \u0000img:N 指向它 */
  let bank: string[] = [];
  let loadedBankKey: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: unknown } | null = null;
  let nearLimitReported = false;

  const bankKey = (name: string) => name + IMAGE_KEY_SUFFIX;

  function loadBank(name: string) {
    if (loadedBankKey === name) return;
    loadedBankKey = name;
    bank = [];
    try {
      const raw = backend.getItem(bankKey(name));
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr)) bank = arr.filter((x): x is string => typeof x === "string");
    } catch {
      bank = [];
    }
  }

  function flush() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const job = pending;
    pending = null;
    if (!job) return;
    const { name, value } = job;
    loadBank(name);

    // 1) 新图入库，全部图片换成引用
    const used = new Set<number>();
    const interned = mapImages(value, url => {
      if (!url.startsWith("data:")) return url;
      let i = bank.indexOf(url);
      if (i < 0) {
        bank.push(url);
        i = bank.length - 1;
      }
      used.add(i);
      return TOKEN + i;
    });

    // 2) 丢掉没人引用的图（删项目 / 删快照后回收空间），同步重排引用下标
    const remap = new Map<number, number>();
    const kept: string[] = [];
    used.forEach(i => {
      remap.set(i, kept.length);
      kept.push(bank[i]);
    });
    const payload = mapImages(interned, s =>
      s.startsWith(TOKEN) ? TOKEN + (remap.get(Number(s.slice(TOKEN.length))) ?? 0) : s,
    );

    const body = JSON.stringify(payload);
    const bankBody = kept.length ? JSON.stringify(kept) : null;

    try {
      if (bankBody) backend.setItem(bankKey(name), bankBody);
      else backend.removeItem(bankKey(name));
      backend.setItem(name, body);
      bank = kept;
      const bytes = body.length + (bankBody?.length ?? 0);
      if (bytes > STORAGE_SOFT_LIMIT && !nearLimitReported) {
        nearLimitReported = true;
        onNearLimit?.(bytes);
      }
    } catch (error) {
      // 写盘失败不要静默：用户需要知道"刚才那一步没保存下来"
      onWriteError?.(error);
    }
  }

  function schedule(name: string, value: unknown) {
    pending = { name, value };
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  // 页面被隐藏 / 关闭前把待写的改动落盘，避免延迟写入丢最后一次修改
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem(name) {
      loadBank(name);
      let raw: string | null = null;
      try {
        raw = backend.getItem(name);
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as StorageValue<unknown>;
        // 磁盘上是"带图片引用的存档"，还原成真正的 data URL 后再交给 store
        return mapImages(parsed, s =>
          s.startsWith(TOKEN) ? bank[Number(s.slice(TOKEN.length))] ?? "" : s,
        ) as StorageValue<S>;
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      schedule(name, value);
    },
    removeItem(name) {
      pending = null;
      bank = [];
      loadedBankKey = null;
      backend.removeItem(name);
      backend.removeItem(bankKey(name));
    },
  };
}
