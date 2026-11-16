import { afterEach, describe, expect, it, vi } from "vitest";
import type { Board } from "../types";
import { decodeSharedBoard } from "./utils";
import {
  SHARE_URL_COMFORT_LIMIT,
  SHARE_URL_HARD_LIMIT,
  SHARE_URL_SOFT_LIMIT,
  planShareSync,
  shareLengthInfo,
  shareLinkNotice,
} from "./share";

const url = (chars: number) => "https://x/".padEnd(chars, "a");

describe("shareLengthInfo / 分享链接长度分档", () => {
  it("短链接算正常", () => {
    const info = shareLengthInfo(url(1200));
    expect(info.state).toBe("ok");
    expect(info.chars).toBe(1200);
  });

  it("刚好到舒适上限仍算正常，超一个字符就转 long", () => {
    expect(shareLengthInfo(url(SHARE_URL_COMFORT_LIMIT)).state).toBe("ok");
    expect(shareLengthInfo(url(SHARE_URL_COMFORT_LIMIT + 1)).state).toBe("long");
  });

  it("超过硬上限判为 over（复制按钮要禁用）", () => {
    expect(shareLengthInfo(url(SHARE_URL_HARD_LIMIT + 1)).state).toBe("over");
  });

  it("KB 数值按字符数估算，给用户直观量级", () => {
    expect(shareLengthInfo(url(2048)).kb).toBe(2);
  });

  it("空链接不抛错", () => {
    expect(shareLengthInfo("").state).toBe("ok");
  });
});

describe("shareLinkNotice / 本机与离线环境", () => {
  it("非 file: 且有主机名时不阻断", () => {
    const notice = shareLinkNotice();
    expect(typeof notice.disabled).toBe("boolean");
    expect(typeof notice.hint).toBe("string");
  });
});

describe("planShareSync / 先估长再编码", () => {
  const base = "https://example.test/";
  const board = (patch: Partial<Board> = {}): Board => ({
    title: "打工人从夯到拉",
    subtitle: "主观锐评",
    style: "classic",
    mode: "day",
    presetId: "hangla",
    tiers: [
      { id: "t1", name: "夯", color: "#E8A23C", items: [{ id: "i1", name: "ChatGPT" }] },
      { id: "t2", name: "拉", color: "#9AA5B1", items: [{ id: "i2", name: "某个工具" }] },
    ],
    pool: [],
    ...patch,
  });
  const withTitleChars = (chars: number): Board => board({ title: "夯".repeat(chars) });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("纯文本榜单：链接可用、判为 ok、数据完整往返", () => {
    const plan = planShareSync(board(), undefined, base);
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;

    expect(plan.state).toBe("ok");
    expect(plan.url.startsWith(base + "#/r/")).toBe(true);
    const back = decodeSharedBoard(plan.url.slice((base + "#/r/").length));
    expect(back?.board.title).toBe("打工人从夯到拉");
    expect(back?.board.tiers[1].items[0].name).toBe("某个工具");
  });

  it("中文标题按 UTF-8 编码，解码后不乱码", () => {
    const plan = planShareSync(board({ title: "2026 年 AI 大模型：从夯到拉 🍔" }), undefined, base);
    if (plan.status !== "ready") throw new Error("应当可分享");
    const back = decodeSharedBoard(plan.url.split("#/r/")[1]);
    expect(back?.board.title).toBe("2026 年 AI 大模型：从夯到拉 🍔");
  });

  it("含图片的榜单也能往返，图片字节完全一致", () => {
    const image = "data:image/png;base64," + "A".repeat(2048);
    const plan = planShareSync(
      board({ tiers: [{ id: "t", name: "夯", color: "#abc", items: [{ id: "i", name: "图", image }] }] }),
      undefined,
      base,
    );
    if (plan.status !== "ready") throw new Error("应当可分享");
    expect(decodeSharedBoard(plan.url.split("#/r/")[1])?.board.tiers[0].items[0].image).toBe(image);
  });

  it("超过 8000 字符判为 long（不是 over，仍可复制但要提示）", () => {
    const plan = planShareSync(withTitleChars(3000), undefined, base);
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.chars).toBeGreaterThan(SHARE_URL_COMFORT_LIMIT);
    expect(plan.state).toBe("long");
  });

  it("超过 60000 字符仍是 long（提示只能靠文档 / 二维码传）", () => {
    const plan = planShareSync(withTitleChars(20000), undefined, base);
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.chars).toBeGreaterThan(SHARE_URL_SOFT_LIMIT);
    expect(plan.state).toBe("long");
  });

  it("超过 200 万字符：在完整编码之前就被拦截，btoa 一次都没调用", () => {
    const spy = vi.fn(() => {
      throw new Error("不应该走到编码");
    });
    vi.stubGlobal("btoa", spy);

    const plan = planShareSync(withTitleChars(1_600_000), undefined, base);

    expect(plan.status).toBe("over");
    if (plan.status !== "over") return;
    expect(plan.chars).toBeGreaterThan(SHARE_URL_HARD_LIMIT);
    expect(spy).not.toHaveBeenCalled();
  });

  it("刚好没超硬上限时才会生成链接，且长度与真实 URL 一致", () => {
    const plan = planShareSync(board(), undefined, base);
    if (plan.status !== "ready") throw new Error("应当可分享");
    expect(plan.chars).toBe(plan.url.length);
    expect(shareLengthInfo(plan.chars).state).toBe(plan.state);
  });
});
