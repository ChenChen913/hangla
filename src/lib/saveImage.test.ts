import { describe, expect, it } from "vitest";
import {
  MAX_EXPORT_AREA,
  MAX_EXPORT_SIDE,
  exportFileName,
  exportPixelRatio,
  isInAppBrowser,
  isIosLike,
  pickSaveChannel,
  withTimeout,
} from "./saveImage";

/**
 * 手机端导出的平台判定。
 *
 * 这些分支没法在 CI 里跑真机，但它们是"导出没反应"这件事的根因所在：
 * iOS 的异步 `a.click()` 会被静默拦截、微信内置浏览器直接忽略 download，
 * 所以判定逻辑必须单测钉死，改坏了要立刻红。
 */
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const WECHAT_IOS = IPHONE + " MicroMessenger/8.0.49";
const WECHAT_ANDROID = ANDROID + " MicroMessenger/8.0.49";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

describe("设备判定", () => {
  it("认得 iPhone / iPad", () => {
    expect(isIosLike(IPHONE)).toBe(true);
    expect(isIosLike("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15")).toBe(true);
  });

  it("iPadOS 13+ 的桌面 UA 靠触点数区分 Mac", () => {
    expect(isIosLike(IPAD_DESKTOP_UA, 5)).toBe(true);
    expect(isIosLike(IPAD_DESKTOP_UA, 0)).toBe(false);
    expect(isIosLike(MAC, 0)).toBe(false);
  });

  it("认得内置浏览器（微信 / 微博 / 钉钉 / 飞书）", () => {
    expect(isInAppBrowser(WECHAT_IOS)).toBe(true);
    expect(isInAppBrowser(WECHAT_ANDROID)).toBe(true);
    expect(isInAppBrowser(ANDROID)).toBe(false);
    expect(isInAppBrowser(WINDOWS)).toBe(false);
  });
});

describe("保存通道", () => {
  it("桌面浏览器直接下载（保持原有体验）", () => {
    expect(pickSaveChannel({ userAgent: WINDOWS })).toBe("download");
    expect(pickSaveChannel({ userAgent: MAC })).toBe("download");
  });

  it("Android Chrome 直接下载（download 属性可用）", () => {
    expect(pickSaveChannel({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe("download");
  });

  it("iOS 一律先出保存面板：异步 a.click() 会被静默拦截", () => {
    expect(pickSaveChannel({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe("sheet");
  });

  it("微信 / QQ 内置浏览器一律出面板：download 属性被忽略", () => {
    expect(pickSaveChannel({ userAgent: WECHAT_IOS, maxTouchPoints: 5 })).toBe("sheet");
    expect(pickSaveChannel({ userAgent: WECHAT_ANDROID, maxTouchPoints: 5 })).toBe("sheet");
  });

  it("不支持 download 属性的浏览器退回面板", () => {
    expect(pickSaveChannel({ userAgent: WINDOWS, supportsDownload: false })).toBe("sheet");
  });
});

describe("导出画布尺寸", () => {
  it("正常榜单按 2 倍渲染", () => {
    expect(exportPixelRatio(1200, 780)).toBe(2);
  });

  it("长榜单自动降到 iOS 单边上限以内", () => {
    const ratio = exportPixelRatio(1200, 2892);
    expect(ratio).toBeLessThan(2);
    expect(1200 * ratio).toBeLessThanOrEqual(MAX_EXPORT_SIDE);
    expect(2892 * ratio).toBeLessThanOrEqual(MAX_EXPORT_SIDE);
  });

  it("任何尺寸都不超过单边与面积上限", () => {
    for (const [w, h] of [
      [1200, 1],
      [1200, 780],
      [1200, 2892],
      [1200, 8000],
      [1200, 20000],
    ]) {
      const ratio = exportPixelRatio(w, h);
      expect(w * ratio).toBeLessThanOrEqual(MAX_EXPORT_SIDE + 0.5);
      expect(h * ratio).toBeLessThanOrEqual(MAX_EXPORT_SIDE + 0.5);
      expect(w * ratio * h * ratio).toBeLessThanOrEqual(MAX_EXPORT_AREA + 1);
      expect(ratio).toBeGreaterThan(0);
    }
  });

  it("尺寸异常时兜底 1 倍，不产生 NaN / 负值", () => {
    expect(exportPixelRatio(0, 0)).toBe(1);
    expect(exportPixelRatio(Number.NaN, 100)).toBe(1);
    expect(exportPixelRatio(1200, -5)).toBe(1);
  });
});

describe("文件名", () => {
  it("去掉文件系统不接受的字符，空标题用默认名", () => {
    expect(exportFileName("AI/模型: 排名?", "20260101-120000")).toBe("20260101-120000-AI模型 排名-排行榜.png");
    expect(exportFileName("", "20260101-120000")).toBe("20260101-120000-从夯到拉-排行榜.png");
    expect(exportFileName("///", "20260101-120000")).toBe("20260101-120000-从夯到拉-排行榜.png");
  });
});

describe("超时保护", () => {
  it("任务按时完成时透传结果", async () => {
    await expect(withTimeout(Promise.resolve(42), 50, "超时")).resolves.toBe(42);
  });

  it("任务自身报错时透传原因", async () => {
    await expect(withTimeout(Promise.reject(new Error("网络错误")), 50, "超时")).rejects.toThrow("网络错误");
  });

  it("一直不返回时按超时失败，不会永远挂着", async () => {
    // 模拟分包装载卡住：既不 resolve 也不 reject
    await expect(withTimeout(new Promise<number>(() => {}), 20, "导出组件加载超时")).rejects.toThrow(
      "导出组件加载超时",
    );
  });
});
