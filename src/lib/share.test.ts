import { describe, expect, it } from "vitest";
import {
  SHARE_URL_COMFORT_LIMIT,
  SHARE_URL_HARD_LIMIT,
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
