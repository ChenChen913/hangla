import { describe, expect, it, vi } from "vitest";
import { STORAGE_SOFT_LIMIT, createBoardStorage } from "./storage";

const NAME = "test.board";
const BANK = NAME + "::images";
const IMG = "data:image/png;base64," + "A".repeat(64);

/** 装一个可观测的 localStorage 替身（node 环境默认没有） */
function installStorage(opts: { failWrite?: boolean } = {}) {
  const map = new Map<string, string>();
  const setItem = vi.fn((k: string, v: string) => {
    if (opts.failWrite) {
      const err = new Error("Setting the value of 'x' exceeded the quota.");
      err.name = "QuotaExceededError";
      throw err;
    }
    map.set(k, v);
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem,
    removeItem: (k: string) => void map.delete(k),
  });
  return { map, setItem };
}

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

/** 可让指定 key 恰好失败一次的 localStorage 替身（模拟配额在第二次写时写满） */
function installStorageWithFailures() {
  const map = new Map<string, string>();
  const failNext = new Set<string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failNext.delete(k)) {
        const err = new Error("Setting the value of 'x' exceeded the quota.");
        err.name = "QuotaExceededError";
        throw err;
      }
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  });
  return { map, failNext };
}

describe("存档存储层", () => {
  it("同一张图被多处引用时只落盘一份，读回来还是完整 data URL", async () => {
    const { map } = installStorage();
    const storage = createBoardStorage({ delay: 5 });
    const value = { state: { a: { image: IMG }, b: { image: IMG } }, version: 10 };

    storage.setItem(NAME, value);
    await tick();

    const raw = map.get(NAME)!;
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("data:image"); // 正文里只剩引用
    expect(JSON.parse(map.get(BANK)!)).toHaveLength(1); // 图片库只有一份

    const back = await storage.getItem(NAME);
    expect(back).toEqual(value);
  });

  it("图片不再被引用时回收，不留垃圾", async () => {
    const { map } = installStorage();
    const storage = createBoardStorage({ delay: 5 });

    storage.setItem(NAME, { state: { a: { image: IMG } }, version: 10 });
    await tick();
    expect(map.has(BANK)).toBe(true);

    storage.setItem(NAME, { state: { a: { name: "没有图了" } }, version: 10 });
    await tick();
    expect(map.has(BANK)).toBe(false);
  });

  it("配额写满时回调通知，而不是把异常甩给调用方", async () => {
    installStorage({ failWrite: true });
    const onWriteError = vi.fn();
    const storage = createBoardStorage({ delay: 5, onWriteError });

    expect(() => storage.setItem(NAME, { state: { a: 1 }, version: 10 })).not.toThrow();
    await tick();
    expect(onWriteError).toHaveBeenCalledTimes(1);
    expect((onWriteError.mock.calls[0][0] as Error).name).toBe("QuotaExceededError");
  });

  it("高频改动合并成一次写盘", async () => {
    const { setItem } = installStorage();
    const storage = createBoardStorage({ delay: 10 });

    for (let i = 0; i < 5; i++) storage.setItem(NAME, { state: { i }, version: 10 });
    await tick(40);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("体积超过软上限时提醒一次", async () => {
    installStorage();
    const onNearLimit = vi.fn();
    const storage = createBoardStorage({ delay: 5, onNearLimit });
    const big = "x".repeat(STORAGE_SOFT_LIMIT + 1024);

    storage.setItem(NAME, { state: { big }, version: 10 });
    storage.setItem(NAME, { state: { big }, version: 10 });
    await tick();
    expect(onNearLimit).toHaveBeenCalledTimes(1);
  });

  it("存档损坏时返回 null，不抛错", async () => {
    const { map } = installStorage();
    const storage = createBoardStorage({ delay: 5 });
    map.set(NAME, "{ 这不是 JSON");
    expect(await storage.getItem(NAME)).toBeNull();
  });

  it("正文写失败时回滚，图片库与正文保持同一代，不会串图", async () => {
    const { map, failNext } = installStorageWithFailures();
    const onWriteError = vi.fn();
    const storage = createBoardStorage({ delay: 5, onWriteError });
    const imgA = "data:image/png;base64," + "A".repeat(32);
    const imgB = "data:image/png;base64," + "B".repeat(32);
    const valueA = { state: { a: { image: imgA } }, version: 10 };

    storage.setItem(NAME, valueA);
    await tick();
    const bodyA = map.get(NAME)!;
    const bankA = map.get(BANK)!;

    failNext.add(NAME); // 第二次写：正文写失败
    storage.setItem(NAME, { state: { a: { image: imgB } }, version: 10 });
    await tick();

    expect(onWriteError).toHaveBeenCalledTimes(1);
    expect(map.get(NAME)).toBe(bodyA); // 正文被回滚
    expect(map.get(BANK)).toBe(bankA); // 图片库没有被换代
    const reopened = createBoardStorage({ delay: 5 });
    expect(await reopened.getItem(NAME)).toEqual(valueA);
  });

  it("正文成功、图片库写失败时同样回滚，读档仍是上一代数据", async () => {
    const { map, failNext } = installStorageWithFailures();
    const onWriteError = vi.fn();
    const storage = createBoardStorage({ delay: 5, onWriteError });
    const imgA = "data:image/png;base64," + "A".repeat(32);
    const imgB = "data:image/png;base64," + "B".repeat(32);
    const valueA = { state: { a: { image: imgA } }, version: 10 };

    storage.setItem(NAME, valueA);
    await tick();
    const bodyA = map.get(NAME)!;
    const bankA = map.get(BANK)!;

    failNext.add(BANK); // 第二次写：图片库写失败
    storage.setItem(NAME, { state: { a: { image: imgB } }, version: 10 });
    await tick();

    expect(onWriteError).toHaveBeenCalledTimes(1);
    expect(map.get(NAME)).toBe(bodyA);
    expect(map.get(BANK)).toBe(bankA);
    const reopened = createBoardStorage({ delay: 5 });
    expect(await reopened.getItem(NAME)).toEqual(valueA);
  });
});
