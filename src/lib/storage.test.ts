import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY,
  STORAGE_SOFT_LIMIT,
  createBoardStorage,
  getStorageMode,
  probeStorage,
  resetMemoryStorage,
} from "./storage";

const NAME = "test.board";
const LEGACY_BANK = NAME + "::images";
const IMG_A = "data:image/png;base64," + "A".repeat(64);
const IMG_B = "data:image/png;base64," + "B".repeat(64);

const quotaError = () => {
  const err = new Error("Setting the value of 'x' exceeded the quota.");
  err.name = "QuotaExceededError";
  return err;
};

type FakeStorage = {
  map: Map<string, string>;
  backend: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  fail: { set: Set<string>; get: Set<string>; remove: Set<string>; allSet: boolean };
  setCalls: number;
};

/** 可观测、可精确注入故障的 localStorage 替身 */
function fakeStorage(): FakeStorage {
  const map = new Map<string, string>();
  const fail = { set: new Set<string>(), get: new Set<string>(), remove: new Set<string>(), allSet: false };
  let setCalls = 0;
  const backend = {
    getItem: (k: string) => {
      if (fail.get.has(k)) throw new Error("storage read failed");
      return map.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      setCalls += 1;
      if (fail.allSet || fail.set.has(k)) throw quotaError();
      map.set(k, v);
    },
    removeItem: (k: string) => {
      if (fail.remove.has(k)) throw new Error("storage remove failed");
      map.delete(k);
    },
  };
  return {
    map,
    backend,
    fail,
    get setCalls() {
      return setCalls;
    },
  };
}

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

/** 当前落盘的正文字符串（单 Key：正文与图片表在同一个 JSON 里） */
const rawBody = (s: FakeStorage) => s.map.get(NAME)!;
const imagesInBody = (s: FakeStorage) => JSON.parse(rawBody(s)).images as string[];

beforeEach(() => {
  resetMemoryStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("存储可用性探测", () => {
  it("localStorage 完全不存在时退回内存，不抛错", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(probeStorage().mode).toBe("memory");
    expect(getStorageMode()).toBe("memory");
  });

  it("getItem 抛错（隐私模式）时退回内存", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    expect(probeStorage().mode).toBe("memory");
  });

  it("setItem 抛错（配额为 0 / 无痕模式）时退回内存，而不是假装能保存", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw quotaError();
      },
      removeItem: () => undefined,
    });
    expect(probeStorage().mode).toBe("memory");
  });

  it("removeItem 抛错不影响持久化判定，删除失败也不会把异常甩给调用方", async () => {
    const map = new Map<string, string>();
    const backend = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: () => {
        throw new Error("remove blocked");
      },
    };
    vi.stubGlobal("localStorage", backend);
    expect(probeStorage().mode).toBe("persistent");

    const storage = createBoardStorage({ delay: 1 });
    storage.setItem(NAME, { state: { a: 1 }, version: 10 });
    await tick();
    expect(() => storage.removeItem(NAME)).not.toThrow();
  });

  it("配额已满但存档还在时仍然用 localStorage，不能让已有数据看起来消失", async () => {
    const map = new Map([[STORAGE_KEY, JSON.stringify({ state: { title: "已存在的榜单" }, version: 10 })]]);
    const backend = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: () => {
        throw quotaError();
      },
      removeItem: (k: string) => void map.delete(k),
    };
    vi.stubGlobal("localStorage", backend);

    // 关键：写 1 个字节也会失败，但读是正常的 → 不能判成"存储不可用"
    expect(probeStorage().mode).toBe("persistent");
    expect(getStorageMode()).toBe("persistent");

    const onWriteError = vi.fn();
    const storage = createBoardStorage({ delay: 1, onWriteError });
    expect(await storage.getItem(STORAGE_KEY)).toEqual({ state: { title: "已存在的榜单" }, version: 10 });

    storage.setItem(STORAGE_KEY, { state: { title: "改不动" }, version: 10 });
    await tick();
    expect(onWriteError).toHaveBeenCalledTimes(1);
    // 旧数据仍然在，且读得出来
    expect(await storage.getItem(STORAGE_KEY)).toEqual({ state: { title: "已存在的榜单" }, version: 10 });
  });

  it("降级到内存后仍然可以正常读 / 写 / 删，应用能继续用", async () => {
    vi.stubGlobal("localStorage", undefined);
    const storage = createBoardStorage({ delay: 1 });
    expect(storage.mode).toBe("memory");

    const value = { state: { title: "内存里的榜单" }, version: 10 };
    storage.setItem(NAME, value);
    await tick();
    expect(await storage.getItem(NAME)).toEqual(value);

    storage.removeItem(NAME);
    expect(await storage.getItem(NAME)).toBeNull();
  });

  it("多次探测共用同一份内存数据（迁移写入后 store 能读到）", async () => {
    vi.stubGlobal("localStorage", undefined);
    const first = createBoardStorage({ delay: 1 });
    first.setItem(NAME, { state: { a: 1 }, version: 10 });
    await tick();
    const second = createBoardStorage({ delay: 1 });
    expect(await second.getItem(NAME)).toEqual({ state: { a: 1 }, version: 10 });
  });
});

describe("存档存储层：单 Key 原子写", () => {
  it("同一张图被多处引用时只落盘一份，读回来还是完整 data URL", async () => {
    const s = fakeStorage();
    const storage = createBoardStorage({ delay: 1, backend: s.backend });
    const value = { state: { a: { image: IMG_A }, b: { image: IMG_A } }, version: 10 };

    storage.setItem(NAME, value);
    await tick();

    // 引用区（value）里只剩 token，data URL 只在图片表出现一次
    const body = JSON.parse(rawBody(s)) as { value: unknown; images: string[] };
    expect(JSON.stringify(body.value)).not.toContain("data:image");
    expect(JSON.stringify(body.value)).toContain("\\u0000img:0");
    expect(body.images).toHaveLength(1); // 图片表只有一份
    expect(await storage.getItem(NAME)).toEqual(value);
  });

  it("图片不再被引用时回收，不在存档里留垃圾", async () => {
    const s = fakeStorage();
    const storage = createBoardStorage({ delay: 1, backend: s.backend });

    storage.setItem(NAME, { state: { a: { image: IMG_A } }, version: 10 });
    await tick();
    expect(imagesInBody(s)).toHaveLength(1);

    storage.setItem(NAME, { state: { a: { name: "没有图了" } }, version: 10 });
    await tick();
    expect(imagesInBody(s)).toHaveLength(0);
    expect(await storage.getItem(NAME)).toEqual({ state: { a: { name: "没有图了" } }, version: 10 });
  });

  it("多份快照共享同一张图时只存一份（内存与磁盘都不膨胀）", async () => {
    const s = fakeStorage();
    const storage = createBoardStorage({ delay: 1, backend: s.backend });
    const value = {
      state: {
        tiers: [{ items: [{ image: IMG_A }] }],
        snapshots: [{ board: { tiers: [{ items: [{ image: IMG_A }] }] } }, { board: { tiers: [] } }],
      },
      version: 10,
    };

    storage.setItem(NAME, value);
    await tick();

    expect(imagesInBody(s)).toHaveLength(1);
    expect(await storage.getItem(NAME)).toEqual(value);
  });

  it("高频改动合并成一次写盘", async () => {
    const s = fakeStorage();
    const storage = createBoardStorage({ delay: 10, backend: s.backend });

    for (let i = 0; i < 5; i++) storage.setItem(NAME, { state: { i }, version: 10 });
    await tick(40);
    expect(s.setCalls).toBe(1);
    expect(await storage.getItem(NAME)).toEqual({ state: { i: 4 }, version: 10 });
  });

  it("体积超过软上限时提醒一次；降回安全线以下后重新武装", async () => {
    const s = fakeStorage();
    const onNearLimit = vi.fn();
    const storage = createBoardStorage({ delay: 1, backend: s.backend, onNearLimit });
    const big = "x".repeat(STORAGE_SOFT_LIMIT + 1024);

    storage.setItem(NAME, { state: { big }, version: 10 });
    await tick();
    storage.setItem(NAME, { state: { big }, version: 10 });
    await tick();
    expect(onNearLimit).toHaveBeenCalledTimes(1);

    storage.setItem(NAME, { state: { small: 1 }, version: 10 });
    await tick();
    storage.setItem(NAME, { state: { big }, version: 10 });
    await tick();
    expect(onNearLimit).toHaveBeenCalledTimes(2);
  });

  it("存档损坏时返回 null，不抛错", async () => {
    const s = fakeStorage();
    const storage = createBoardStorage({ delay: 1, backend: s.backend });
    s.map.set(NAME, "{ 这不是 JSON");
    expect(await storage.getItem(NAME)).toBeNull();
  });

  it("removeItem 同时清掉正文与遗留的旧图片库", async () => {
    const s = fakeStorage();
    const storage = createBoardStorage({ delay: 1, backend: s.backend });
    s.map.set(LEGACY_BANK, JSON.stringify([IMG_A]));

    storage.removeItem(NAME);

    expect(s.map.has(NAME)).toBe(false);
    expect(s.map.has(LEGACY_BANK)).toBe(false);
  });
});

describe("存档存储层：失败注入（单 Key 不存在半份数据）", () => {
  it("写失败时旧存档仍可完整读取，读到的是上一代而不是半份新数据", async () => {
    const s = fakeStorage();
    const onWriteError = vi.fn();
    const storage = createBoardStorage({ delay: 1, backend: s.backend, onWriteError });
    const valueA = { state: { a: { image: IMG_A } }, version: 10 };

    storage.setItem(NAME, valueA);
    await tick();
    const bodyA = rawBody(s);

    s.fail.allSet = true;
    storage.setItem(NAME, { state: { a: { image: IMG_B } }, version: 10 });
    await tick();

    expect(onWriteError).toHaveBeenCalledTimes(1);
    expect(rawBody(s)).toBe(bodyA); // 一个字节都没动
    // 重新打开（模拟刷新）仍是完整旧档
    const reopened = createBoardStorage({ delay: 1, backend: s.backend });
    expect(await reopened.getItem(NAME)).toEqual(valueA);
  });

  it("连续两次写入失败：每次都通知，旧存档始终完整", async () => {
    const s = fakeStorage();
    const onWriteError = vi.fn();
    const storage = createBoardStorage({ delay: 1, backend: s.backend, onWriteError });
    const valueA = { state: { a: { image: IMG_A } }, version: 10 };
    storage.setItem(NAME, valueA);
    await tick();
    const bodyA = rawBody(s);

    s.fail.allSet = true;
    storage.setItem(NAME, { state: { a: { image: IMG_B } }, version: 10 });
    await tick();
    storage.setItem(NAME, { state: { a: { image: IMG_B }, b: 2 }, version: 10 });
    await tick();

    expect(onWriteError).toHaveBeenCalledTimes(2);
    expect(rawBody(s)).toBe(bodyA);
    const reopened = createBoardStorage({ delay: 1, backend: s.backend });
    expect(await reopened.getItem(NAME)).toEqual(valueA);
  });

  it("失败一次后恢复写入：新数据完整落盘，图片表与正文同代", async () => {
    const s = fakeStorage();
    const storage = createBoardStorage({ delay: 1, backend: s.backend });
    storage.setItem(NAME, { state: { a: { image: IMG_A } }, version: 10 });
    await tick();

    s.fail.allSet = true;
    storage.setItem(NAME, { state: { a: { image: IMG_B } }, version: 10 });
    await tick();
    s.fail.allSet = false;
    storage.setItem(NAME, { state: { a: { image: IMG_B } }, version: 10 });
    await tick();

    expect(imagesInBody(s)).toEqual([IMG_B]);
    const reopened = createBoardStorage({ delay: 1, backend: s.backend });
    expect(await reopened.getItem(NAME)).toEqual({ state: { a: { image: IMG_B } }, version: 10 });
  });

  it("两个标签页交错写入不会造成正文与图片错配（旧双 Key 会）", async () => {
    const s = fakeStorage();
    const tabA = createBoardStorage({ delay: 1, backend: s.backend });
    const tabB = createBoardStorage({ delay: 1, backend: s.backend });
    const valueA1 = { state: { a: { image: IMG_A } }, version: 10 };
    const valueB = { state: { b: { image: IMG_B } }, version: 10 };
    const valueA2 = { state: { a: { image: IMG_A }, c: { image: IMG_B } }, version: 10 };

    tabA.setItem(NAME, valueA1);
    await tick();
    tabB.setItem(NAME, valueB);
    await tick();
    tabA.setItem(NAME, valueA2);
    await tick();

    const reopened = createBoardStorage({ delay: 1, backend: s.backend });
    expect(await reopened.getItem(NAME)).toEqual(valueA2);
  });

  it("pagehide 时强制落盘，延迟窗口内的最后一次修改不丢", async () => {
    const s = fakeStorage();
    const listeners: Record<string, Array<() => void>> = {};
    vi.stubGlobal("window", {
      addEventListener: (type: string, cb: () => void) => (listeners[type] ??= []).push(cb),
    });
    vi.stubGlobal("document", {
      addEventListener: () => undefined,
      visibilityState: "visible",
    });

    const storage = createBoardStorage({ delay: 60_000, backend: s.backend });
    storage.setItem(NAME, { state: { a: 1 }, version: 10 });
    expect(s.map.has(NAME)).toBe(false); // 还在延迟窗口里

    listeners.pagehide?.forEach(fn => fn());

    expect(s.map.has(NAME)).toBe(true);
    expect(await storage.getItem(NAME)).toEqual({ state: { a: 1 }, version: 10 });
  });
});

describe("存档存储层：旧版双 Key 兼容", () => {
  it("能读旧格式（正文 + 独立图片库），首次写入后自动收敛成单 Key 并清掉旧图片库", async () => {
    const s = fakeStorage();
    s.map.set(
      NAME,
      JSON.stringify({ state: { a: { image: "\u0000img:0" } }, version: 10 }),
    );
    s.map.set(LEGACY_BANK, JSON.stringify([IMG_A]));

    const storage = createBoardStorage({ delay: 1, backend: s.backend });
    const legacyRead = await storage.getItem(NAME);
    expect(legacyRead).toEqual({ state: { a: { image: IMG_A } }, version: 10 });

    storage.setItem(NAME, { state: { a: { image: IMG_B } }, version: 10 });
    await tick();

    expect(s.map.has(LEGACY_BANK)).toBe(false);
    expect(imagesInBody(s)).toEqual([IMG_B]);
    const reopened = createBoardStorage({ delay: 1, backend: s.backend });
    expect(await reopened.getItem(NAME)).toEqual({ state: { a: { image: IMG_B } }, version: 10 });
  });

  it("旧图片库损坏时正文仍能读出来，图片退化为空而不是整份存档作废", async () => {
    const s = fakeStorage();
    s.map.set(
      NAME,
      JSON.stringify({ state: { title: "旧榜单", a: { image: "\u0000img:0" } }, version: 10 }),
    );
    s.map.set(LEGACY_BANK, "{ 损坏的图片库");

    const storage = createBoardStorage({ delay: 1, backend: s.backend });
    const back = (await storage.getItem(NAME)) as { state: { title: string; a: { image: string } } };

    expect(back.state.title).toBe("旧榜单");
    expect(back.state.a.image).toBe("");
  });

  it("图片索引越界时只丢图片，不抛错也不影响其他字段", async () => {
    const s = fakeStorage();
    s.map.set(
      NAME,
      JSON.stringify({ state: { title: "越界", a: { image: "\u0000img:9" } }, version: 10 }),
    );
    s.map.set(LEGACY_BANK, JSON.stringify([IMG_A]));

    const storage = createBoardStorage({ delay: 1, backend: s.backend });
    const back = (await storage.getItem(NAME)) as { state: { title: string; a: { image: string } } };

    expect(back.state.title).toBe("越界");
    expect(back.state.a.image).toBe("");
  });

  it("普通字符串里出现 \\u0000img: 字样不会被误当成图片引用", async () => {
    const s = fakeStorage();
    const storage = createBoardStorage({ delay: 1, backend: s.backend });
    const value = { state: { name: "\u0000img:3 只是名字" }, version: 10 };

    storage.setItem(NAME, value);
    await tick();

    expect(await storage.getItem(NAME)).toEqual(value);
  });
});

describe("存档存储层：空间回收与删除交错", () => {
  it("删除一份快照后，只有它独占的图片被回收，共享图片留下", async () => {
    const s = fakeStorage();
    const storage = createBoardStorage({ delay: 1, backend: s.backend });
    const snap = (image: string) => ({ board: { tiers: [{ items: [{ image }] }] } });

    storage.setItem(NAME, { state: { snapshots: [snap(IMG_A), snap(IMG_B)] }, version: 10 });
    await tick();
    expect(imagesInBody(s).sort()).toEqual([IMG_A, IMG_B].sort());

    // 删掉引用 IMG_B 的那份
    storage.setItem(NAME, { state: { snapshots: [snap(IMG_A)] }, version: 10 });
    await tick();

    expect(imagesInBody(s)).toEqual([IMG_A]);
    const back = (await storage.getItem(NAME)) as { state: { snapshots: Array<{ board: { tiers: Array<{ items: Array<{ image: string }> }> } }> } };
    expect(back.state.snapshots[0].board.tiers[0].items[0].image).toBe(IMG_A);
  });

  it("removeItem 会取消尚未落盘的写入，不会删完又被 flush 写回来", async () => {
    const s = fakeStorage();
    const storage = createBoardStorage({ delay: 5, backend: s.backend });

    storage.setItem(NAME, { state: { a: 1 }, version: 10 });
    storage.removeItem(NAME);
    await tick(40);

    expect(s.map.has(NAME)).toBe(false);
    expect(s.setCalls).toBe(0);
  });
});
