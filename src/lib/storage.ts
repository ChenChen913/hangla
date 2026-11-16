import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * 存档存储层。夹在 zustand persist 和 localStorage 中间，干四件事：
 *
 * 1. **图片驻留（intern）**：data URL 统一收进同一份存档的图片表，正文里只留 \u0000img:N 引用。
 *    同一张图被多份快照引用时只存一份——否则"最多 30 份快照"会在第 2 份就把 5MB 配额撑爆。
 * 2. **延迟合并写入**：拖拽经过档位、拉滑杆这类高频状态变更不必每次整份序列化写盘。
 * 3. **失败兜底**：localStorage 配额满会抛 QuotaExceededError（zustand 自己的 setItem 不 catch），
 *    这里捕获后回调通知界面，避免"界面上加进去了、刷新后没了"的静默丢数据。
 * 4. **存储可用性探测**：读写删三件事都真的试一遍，不行就退回内存实现并如实上报。
 *
 * ## 为什么是单 Key
 *
 * v1.2 及以前是「正文 hangla.v3 + 图片库 hangla.v3::images」两个 key，靠"先写正文、
 * 失败再把正文写回旧值"来保证两代数据一致。这套回滚有三个无法修补的洞：
 *
 * - 回滚本身也可能失败（配额满时最需要回滚，也最可能写不进去），磁盘上就留下
 *   「新正文 + 旧图片库」，引用下标整体错位，图片会串到别的条目上；
 * - 两个标签页交错写（A 写正文 → B 写正文+图库 → A 写图库）能稳定造出错配；
 * - 正文写成功、图片库写失败之后，只要进程被杀（关标签页 / 手机切后台），
 *   连回滚的机会都没有。
 *
 * 现在把正文和图片表放进**同一个 JSON**：一次 setItem 要么整份成功、要么整份失败，
 * 磁盘上永远是「上一份完整存档」或「这一份完整存档」。不再需要回滚，也不再有两个 key
 * 谁先谁后的问题。旧格式（双 key）仍然能读，首次成功写入后自动收敛成新格式并清掉旧图片库。
 */

/** 引用 token 前缀。只出现在 image 字段上，用户自己起的名字不会与之冲突 */
const TOKEN = "\u0000img:";
const TOKEN_RE = /^\u0000img:(\d+)$/;
/** 旧版图片库后缀，只用于读取与清理 */
const LEGACY_BANK_SUFFIX = "::images";
/** 新格式标记与版本 */
const ENVELOPE = "__hangla";
const FORMAT = 2;

/**
 * 持久化 key。正文与图片表都在这个 key 里（见文件头注释）。
 * 放在存储层而不是 store 里，是因为探测逻辑需要知道"这个应用有没有已存数据"。
 */
export const STORAGE_KEY = "hangla.v3";

/** 各家浏览器配额不同（实测 Chrome 约 5MB），留出余量做"快满了"提示 */
export const STORAGE_SOFT_LIMIT = 4 * 1024 * 1024;

export type StorageMode = "persistent" | "memory";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 内存降级用的单例：多次探测必须落在同一份 Map 上，否则迁移写入的数据下次读不到 */
const memoryStore = new Map<string, string>();
const memoryBackend: StorageLike = {
  getItem: k => memoryStore.get(k) ?? null,
  setItem: (k, v) => void memoryStore.set(k, v),
  removeItem: k => void memoryStore.delete(k),
};

/** 仅供测试清场：内存后端是模块级单例，用例之间必须隔离 */
export function resetMemoryStorage(): void {
  memoryStore.clear();
}

/**
 * 探测 localStorage 是否真的可用。
 *
 * 这里有一条容易踩的坑：**不能只用"试写探针"来判断可用性**。
 * 配额已满（很常见：用户存了六十多张图）时，哪怕写 1 个字节也会抛 QuotaExceededError，
 * 但用户的存档明明还读得出来。如果把这种情况判成"存储不可用"而退回内存后端，
 * 应用启动时就会看到一个空榜单——用户会以为数据全丢了。
 *
 * 所以顺序是：
 * 1. 连读都抛错（隐私模式 / 禁用站点数据）→ 内存；
 * 2. 已经有存档 → 认定可持久化。写失败交给 onWriteError 提示"存储已满"，
 *    这是可恢复的（删几张图就能继续写），不能把已有数据藏起来；
 * 3. 还没有存档 → 试写一个探针键确认环境允许写入；失败才退回内存。
 */
export function probeStorage(knownKeys: string[] = [STORAGE_KEY]): { backend: StorageLike; mode: StorageMode } {
  try {
    const ls = typeof localStorage !== "undefined" ? localStorage : null;
    if (!ls) return { backend: memoryBackend, mode: "memory" };

    let hasData = false;
    try {
      // 任一已知存档键有内容，就说明读能力正常且用户有数据要保住
      hasData = knownKeys.some(k => ls.getItem(k) !== null);
    } catch {
      return { backend: memoryBackend, mode: "memory" };
    }
    if (hasData) return { backend: ls, mode: "persistent" };

    const probeKey = "__hangla_probe__" + Math.random().toString(36).slice(2);
    try {
      ls.setItem(probeKey, "1");
    } catch {
      return { backend: memoryBackend, mode: "memory" };
    }
    try {
      ls.removeItem(probeKey);
    } catch {
      /* 删不掉只是留一个 20 字节的探针键，不影响持久化能力 */
    }
    return { backend: ls, mode: "persistent" };
  } catch {
    /* 无 DOM / 访问 localStorage 本身抛错 */
    return { backend: memoryBackend, mode: "memory" };
  }
}

/** 当前环境的存储模式（启动横幅、写失败提示都按它区分措辞） */
export function getStorageMode(): StorageMode {
  return probeStorage().mode;
}

function safeGet(backend: StorageLike, key: string): string | null {
  try {
    return backend.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(backend: StorageLike, key: string, value: string): { ok: boolean; error?: unknown } {
  try {
    backend.setItem(key, value);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function safeRemove(backend: StorageLike, key: string): void {
  try {
    backend.removeItem(key);
  } catch {
    /* 删不掉不影响读取；正文是唯一权威数据源，图片表由正文决定 */
  }
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

/** 把存档里的 token 还原成 data URL；下标越界（图片表损坏）时退回空串，UI 按"没有图"处理 */
function resolveTokens(node: unknown, images: string[]): unknown {
  return mapImages(node, s => {
    const m = TOKEN_RE.exec(s);
    if (!m) return s;
    const img = images[Number(m[1])];
    return typeof img === "string" ? img : "";
  });
}

export type BoardStorageOptions = {
  /** 合并写入的等待时间（毫秒） */
  delay?: number;
  /** 写盘失败（多半是配额满） */
  onWriteError?(error: unknown): void;
  /** 体积超过软上限 */
  onNearLimit?(bytes: number): void;
  /** 测试注入：绕过真实 localStorage（含探测） */
  backend?: StorageLike;
};

export type BoardStorage<S> = PersistStorage<S, unknown> & { readonly mode: StorageMode };

export function createBoardStorage<S = unknown>(options: BoardStorageOptions = {}): BoardStorage<S> {
  const { delay = 300, onWriteError, onNearLimit } = options;
  const { backend, mode } = options.backend
    ? { backend: options.backend, mode: "persistent" as StorageMode }
    : probeStorage();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: unknown } | null = null;
  let nearLimitReported = false;

  const legacyKey = (name: string) => name + LEGACY_BANK_SUFFIX;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** 旧格式的图片库（单独一个 key）；读不出来就当空表，由 token 解析退回空串 */
  function readLegacyBank(name: string): string[] {
    const raw = safeGet(backend, legacyKey(name));
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string" && x.startsWith("data:")) : [];
    } catch {
      return [];
    }
  }

  /** 收集本次要落盘的图片并换成 token；未引用的图自然不会被带走（空间回收） */
  function pack(value: unknown): { body: string; images: string[] } {
    const images: string[] = [];
    const index = new Map<string, number>();
    const interned = mapImages(value, url => {
      if (!url.startsWith("data:")) return url;
      let i = index.get(url);
      if (i === undefined) {
        i = images.length;
        images.push(url);
        index.set(url, i);
      }
      return TOKEN + i;
    });
    return {
      body: JSON.stringify({ [ENVELOPE]: FORMAT, images, value: interned }),
      images,
    };
  }

  function flush() {
    clearTimer();
    const job = pending;
    pending = null;
    if (!job) return;
    const { name, value } = job;
    const { body } = pack(value);

    // 单次写入：失败时磁盘上仍是上一份完整存档，没有任何"回滚"动作可失败
    const write = safeSet(backend, name, body);
    if (!write.ok) {
      onWriteError?.(write.error);
      return;
    }

    // 旧格式的图片库已经没有用了，清掉避免同一批图片在配额里存两遍
    safeRemove(backend, legacyKey(name));

    if (body.length > STORAGE_SOFT_LIMIT && !nearLimitReported) {
      nearLimitReported = true;
      onNearLimit?.(body.length);
    } else if (body.length < STORAGE_SOFT_LIMIT) {
      // 删掉图片降回安全线以下后重新武装：否则提示过一次就再也不提了
      nearLimitReported = false;
    }
  }

  function schedule(name: string, value: unknown) {
    pending = { name, value };
    clearTimer();
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
    mode,
    getItem(name) {
      const raw = safeGet(backend, name);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && parsed[ENVELOPE] === FORMAT && Array.isArray(parsed.images)) {
          // 信封结构对、但 value 不是对象：当作损坏，别把 undefined 交给 persist
          if (!parsed.value || typeof parsed.value !== "object") return null;
          const images = parsed.images.filter((x): x is string => typeof x === "string");
          return resolveTokens(parsed.value, images) as StorageValue<S>;
        }
        // 旧格式：正文 + 独立的 hangla.v3::images
        return resolveTokens(parsed, readLegacyBank(name)) as StorageValue<S>;
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      schedule(name, value);
    },
    removeItem(name) {
      clearTimer();
      pending = null;
      safeRemove(backend, name);
      safeRemove(backend, legacyKey(name));
    },
  };
}
