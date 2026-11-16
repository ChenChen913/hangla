import { beforeEach, describe, expect, it, vi } from "vitest";

// 只替换 IO 两端：读文件与 canvas 重编码在 node 环境里没有实现，
// 并发、失败隔离、进度、写库次数这些调度逻辑才是这里要验证的
vi.mock("./utils", async importOriginal => {
  const actual = await importOriginal<typeof import("./utils")>();
  return {
    ...actual,
    readFileAsDataURL: vi.fn(),
    encodeImage: vi.fn(),
  };
});

import { BOARD_LIMITS, IMAGE_MAX_BYTES, decodeBoard, encodeBoard, readFileAsDataURL, encodeImage } from "./utils";
import { addImageFilesToPool } from "./images";
import { freshBoard, resetHistory, useBoard } from "../store/board";
import { useUi } from "../store/ui";

const mockRead = vi.mocked(readFileAsDataURL);
const mockEncode = vi.mocked(encodeImage);

const file = (name: string, size = 1024) => new File([new Uint8Array(1)], name, { type: "image/png" });
const namedFile = (name: string, size: number) =>
  ({ name, size, type: "image/png" }) as unknown as File;

const DATA_URL = "data:image/png;base64,AAAA";

/** 把 store 重置到一个干净、没有历史的状态 */
function resetStore() {
  useBoard.setState({
    ...freshBoard(),
    tiers: useBoard.getState().tiers.map(t => ({ ...t, items: [] })),
    pool: [],
    snapshots: [],
  });
  resetHistory();
  useUi.setState({ imageProgress: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  mockRead.mockImplementation(async () => DATA_URL);
  mockEncode.mockImplementation(async url => url);
});

describe("批量图片处理", () => {
  it("有限并发：一次最多 3 张同时解码，不会把所有大图一起塞进内存", async () => {
    let inFlight = 0;
    let peak = 0;
    mockRead.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight -= 1;
      return DATA_URL;
    });

    await addImageFilesToPool(Array.from({ length: 11 }, (_, i) => file(`p${i}.png`)));

    expect(peak).toBe(3);
    expect(useBoard.getState().pool).toHaveLength(11);
  });

  it("结果顺序与选择顺序一致（并发完成先后不影响入库顺序）", async () => {
    mockRead.mockImplementation(async f => {
      // 让先发的慢、后发的快，故意打乱完成顺序
      await new Promise(r => setTimeout(r, f.name === "a.png" ? 20 : 1));
      return DATA_URL;
    });

    await addImageFilesToPool([file("a.png"), file("b.png"), file("c.png")]);

    expect(useBoard.getState().pool.map(i => i.name)).toEqual(["a", "b", "c"]);
  });

  it("单张失败不影响同批其他图片，批次正常结束", async () => {
    mockRead.mockImplementation(async f => {
      if (f.name.startsWith("bad")) throw new Error("读取失败");
      return DATA_URL;
    });

    await addImageFilesToPool([file("ok1.png"), file("bad.png"), file("ok2.png")]);

    expect(useBoard.getState().pool.map(i => i.name)).toEqual(["ok1", "ok2"]);
    expect(useUi.getState().imageProgress).toBeNull();
  });

  it("全部失败时不写库，进度条也收掉", async () => {
    mockRead.mockRejectedValue(new Error("全部读不出来"));

    await addImageFilesToPool([file("a.png"), file("b.png")]);

    expect(useBoard.getState().pool).toHaveLength(0);
    expect(useUi.getState().imageProgress).toBeNull();
  });

  it("解码失败（坏图）时跳过该图，不会把坏 data URL 原样写进项目库", async () => {
    mockEncode.mockRejectedValue(new Error("图片解码失败"));

    await addImageFilesToPool([file("broken.bmp")]);

    expect(useBoard.getState().pool).toHaveLength(0);
    expect(useUi.getState().imageProgress).toBeNull();
  });

  it("整批只写一次 store（避免 20 张图触发 20 次整份序列化写盘）", async () => {
    let poolChanges = 0;
    const unsub = useBoard.subscribe((s, prev) => {
      if (s.pool !== prev.pool) poolChanges += 1;
    });

    await addImageFilesToPool(Array.from({ length: 6 }, (_, i) => file(`p${i}.png`)));
    unsub();

    expect(poolChanges).toBe(1);
    expect(useBoard.getState().pool).toHaveLength(6);
  });

  it("进度会从 0 走到 total，结束后清空", async () => {
    const seen: number[] = [];
    const unsub = useUi.subscribe(s => {
      if (s.imageProgress) seen.push(s.imageProgress.done);
    });

    await addImageFilesToPool([file("a.png"), file("b.png"), file("c.png")]);
    unsub();

    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(3);
    expect(useUi.getState().imageProgress).toBeNull();
  });

  it("超过 20MB 的文件被跳过，其余照常处理", async () => {
    await addImageFilesToPool([
      namedFile("huge.png", IMAGE_MAX_BYTES + 1),
      namedFile("ok.png", 1024),
    ]);

    expect(useBoard.getState().pool.map(i => i.name)).toEqual(["ok"]);
  });

  it("非图片文件直接忽略，不进入处理队列", async () => {
    await addImageFilesToPool([{ name: "a.txt", size: 10, type: "text/plain" } as unknown as File]);

    expect(mockRead).not.toHaveBeenCalled();
    expect(useBoard.getState().pool).toHaveLength(0);
  });

  it("文件名超长时条目名按上限截断", async () => {
    await addImageFilesToPool([file("名".repeat(200) + ".png")]);

    expect(Array.from(useBoard.getState().pool[0].name)).toHaveLength(BOARD_LIMITS.itemName);
  });

  it("指定档位时直接落进该档位，失败项目也不会混进项目库", async () => {
    const tierId = useBoard.getState().tiers[2].id;
    mockRead.mockImplementation(async f => {
      if (f.name === "bad.png") throw new Error("坏图");
      return DATA_URL;
    });

    await addImageFilesToPool([file("ok.png"), file("bad.png")], tierId);

    expect(useBoard.getState().tiers[2].items.map(i => i.name)).toEqual(["ok"]);
    expect(useBoard.getState().pool).toHaveLength(0);
  });

  it("重编码仍然走 encodeImage（透明 PNG / JPEG 规则不被并发改造破坏）", async () => {
    mockEncode.mockResolvedValue("data:image/jpeg;base64,ENCODED");

    await addImageFilesToPool([file("photo.png")]);

    expect(mockEncode).toHaveBeenCalledWith(DATA_URL);
    expect(useBoard.getState().pool[0].image).toBe("data:image/jpeg;base64,ENCODED");
  });
});

describe("图片数据进入分享 / 存档后的完整性", () => {
  it("并发处理出来的图片能完整进分享链接并解码回来", async () => {
    const image = "data:image/png;base64," + "A".repeat(512);
    mockEncode.mockResolvedValue(image);

    await addImageFilesToPool([file("a.png"), file("b.png")]);
    const s = useBoard.getState();
    const board = {
      title: s.title,
      subtitle: s.subtitle,
      style: s.style,
      mode: s.mode,
      presetId: s.presetId,
      tiers: s.tiers,
      pool: s.pool,
    };

    const back = decodeBoard(encodeBoard(board));
    expect(back?.pool.map(i => i.image)).toEqual([image, image]);
  });
});
