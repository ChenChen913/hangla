import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_EXPORT_AREA,
  MAX_EXPORT_SIDE,
  MIN_EXPORT_PIXEL_RATIO,
  assertExportBlob,
  exportFailureMessage,
  exportFileName,
  exportSizeProblem,
  isGenericWebView,
  isInAppBrowser,
  isIosLike,
  pickSaveChannel,
  planExportSize,
  planSaveUi,
  shareBlob,
  withTimeout,
} from "./saveImage";

/**
 * 手机端导出的平台判定与画布边界。
 *
 * 这些分支没法在 CI 里跑真机，但它们是"导出没反应 / 导出一张白图"的根因所在：
 * iOS 的异步 `a.click()` 会被静默拦截、微信内置浏览器直接忽略 download，
 * 长榜单会超过 iOS 的位图上限。判定与尺寸规划必须单测钉死，改坏了要立刻红。
 */
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const WECHAT_IOS = IPHONE + " MicroMessenger/8.0.49";
const WECHAT_ANDROID = ANDROID + " MicroMessenger/8.0.49";
const ALIPAY_IOS = IPHONE + " AlipayClient/10.5.70";
const FEISHU_ANDROID = ANDROID + " Lark/7.20.0";
const DINGTALK_ANDROID = ANDROID + " DingTalk/7.6.0";
const QQ_IOS = IPHONE + " QQ/8.9.68";
const QQBROWSER_ANDROID = ANDROID + " MQQBrowser/14.9 QQBrowser/14.9";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36";
const UNKNOWN_ANDROID =
  "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** 所有"成功"的尺寸规划都必须满足的硬约束 */
function expectWithinLimits(plan: ReturnType<typeof planExportSize>) {
  expect(plan.ok).toBe(true);
  if (!plan.ok) return;
  expect(plan.ratio).toBeGreaterThanOrEqual(MIN_EXPORT_PIXEL_RATIO);
  expect(plan.width).toBeLessThanOrEqual(MAX_EXPORT_SIDE);
  expect(plan.height).toBeLessThanOrEqual(MAX_EXPORT_SIDE);
  expect(plan.width * plan.height).toBeLessThanOrEqual(MAX_EXPORT_AREA);
  expect(plan.width).toBe(Math.floor(plan.width));
  expect(plan.height).toBe(Math.floor(plan.height));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("认得支付宝 / 飞书 / 钉钉 / QQ 内置浏览器，QQBrowser 仍是完整浏览器", () => {
    expect(isInAppBrowser(ALIPAY_IOS)).toBe(true);
    expect(isInAppBrowser(FEISHU_ANDROID)).toBe(true);
    expect(isInAppBrowser(DINGTALK_ANDROID)).toBe(true);
    expect(isInAppBrowser(QQ_IOS)).toBe(true);
    expect(isInAppBrowser(QQBROWSER_ANDROID)).toBe(false);
  });

  it("通用 Android WebView（; wv）单独识别，不和完整 Chrome 混为一谈", () => {
    expect(isGenericWebView(ANDROID_WEBVIEW)).toBe(true);
    expect(isGenericWebView(UNKNOWN_ANDROID)).toBe(false);
    expect(isGenericWebView(ANDROID)).toBe(false);
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

describe("保存面板入口规划", () => {
  it("Windows Chrome：直接下载是主入口，不展示不可用的系统分享", () => {
    const plan = planSaveUi({ userAgent: WINDOWS, supportsDownload: true, supportsShareFiles: false });
    expect(plan).toEqual({
      channel: "download",
      primary: "download",
      showDownload: true,
      showShare: false,
      showLongPressHint: false,
    });
  });

  it("Android Chrome：保留直接下载；支持文件分享时多给一个次要入口", () => {
    const plain = planSaveUi({ userAgent: ANDROID, maxTouchPoints: 5, supportsDownload: true });
    expect(plain.primary).toBe("download");
    expect(plain.showDownload).toBe(true);

    const withShare = planSaveUi({
      userAgent: ANDROID,
      maxTouchPoints: 5,
      supportsDownload: true,
      supportsShareFiles: true,
    });
    expect(withShare.primary).toBe("download");
    expect(withShare.showShare).toBe(true);
  });

  it("iPhone Safari：系统分享优先，绝不展示直接下载", () => {
    const withShare = planSaveUi({
      userAgent: IPHONE,
      maxTouchPoints: 5,
      supportsDownload: true,
      supportsShareFiles: true,
    });
    expect(withShare.primary).toBe("share");
    expect(withShare.showShare).toBe(true);
    expect(withShare.showDownload).toBe(false);
    expect(withShare.showLongPressHint).toBe(true);

    const noShare = planSaveUi({
      userAgent: IPHONE,
      maxTouchPoints: 5,
      supportsDownload: true,
      supportsShareFiles: false,
    });
    expect(noShare.primary).toBe("longpress");
    expect(noShare.showDownload).toBe(false);
    expect(noShare.showShare).toBe(false);
    expect(noShare.showLongPressHint).toBe(true);
  });

  it("iPadOS 桌面 UA：靠触点数判断为 iOS，不走直接下载", () => {
    const plan = planSaveUi({
      userAgent: IPAD_DESKTOP_UA,
      maxTouchPoints: 5,
      supportsDownload: true,
      supportsShareFiles: true,
    });
    expect(plan.channel).toBe("sheet");
    expect(plan.primary).toBe("share");
    expect(plan.showDownload).toBe(false);
  });

  it("微信 iOS / Android：只提供长按保存，即便浏览器声称支持分享与下载", () => {
    for (const ua of [WECHAT_IOS, WECHAT_ANDROID]) {
      const plan = planSaveUi({
        userAgent: ua,
        maxTouchPoints: 5,
        supportsDownload: true,
        supportsShareFiles: true,
      });
      expect(plan.channel).toBe("sheet");
      expect(plan.primary).toBe("longpress");
      expect(plan.showDownload).toBe(false);
      expect(plan.showShare).toBe(false);
      expect(plan.showLongPressHint).toBe(true);
    }
  });

  it("支付宝 / 飞书 / 钉钉 / QQ 内置浏览器：不把直接下载当主入口", () => {
    for (const ua of [ALIPAY_IOS, FEISHU_ANDROID, DINGTALK_ANDROID, QQ_IOS]) {
      const plan = planSaveUi({
        userAgent: ua,
        maxTouchPoints: 5,
        supportsDownload: true,
        supportsShareFiles: true,
      });
      expect(plan.channel).toBe("sheet");
      expect(plan.primary).toBe("longpress");
      expect(plan.showDownload).toBe(false);
      expect(plan.showShare).toBe(false);
    }
  });

  it("通用 Android WebView：download 属性存在也不直接下载", () => {
    const withShare = planSaveUi({
      userAgent: ANDROID_WEBVIEW,
      maxTouchPoints: 5,
      supportsDownload: true,
      supportsShareFiles: true,
    });
    expect(withShare.channel).toBe("sheet");
    expect(withShare.primary).toBe("share");
    expect(withShare.showDownload).toBe(false);

    const noShare = planSaveUi({
      userAgent: ANDROID_WEBVIEW,
      maxTouchPoints: 5,
      supportsDownload: true,
      supportsShareFiles: false,
    });
    expect(noShare.channel).toBe("sheet");
    expect(noShare.primary).toBe("longpress");
    expect(noShare.showDownload).toBe(false);
  });

  it("未识别的完整 Android 浏览器：仍按 download 能力走直接下载", () => {
    const plan = planSaveUi({ userAgent: UNKNOWN_ANDROID, maxTouchPoints: 5, supportsDownload: true });
    expect(plan.channel).toBe("download");
    expect(plan.primary).toBe("download");
    expect(plan.showDownload).toBe(true);
  });

  it("QQBrowser 自带下载器，不因为 UA 带 QQ 就被误判为内置 WebView", () => {
    const plan = planSaveUi({ userAgent: QQBROWSER_ANDROID, maxTouchPoints: 5, supportsDownload: true });
    expect(plan.channel).toBe("download");
    expect(plan.primary).toBe("download");
  });

  it("浏览器没有 download 能力时：有分享用分享，没有分享只能长按", () => {
    const share = planSaveUi({ userAgent: WINDOWS, supportsDownload: false, supportsShareFiles: true });
    expect(share.primary).toBe("share");
    expect(share.showDownload).toBe(false);

    const none = planSaveUi({ userAgent: WINDOWS, supportsDownload: false, supportsShareFiles: false });
    expect(none.primary).toBe("longpress");
    expect(none.showDownload).toBe(false);
    expect(none.showShare).toBe(false);
  });

  it("iOS / 内置浏览器的任何组合都不会把直接下载当主入口", () => {
    for (const ua of [IPHONE, IPAD_DESKTOP_UA, WECHAT_IOS, WECHAT_ANDROID]) {
      for (const supportsDownload of [true, false]) {
        for (const supportsShareFiles of [true, false]) {
          const plan = planSaveUi({ userAgent: ua, maxTouchPoints: 5, supportsDownload, supportsShareFiles });
          expect(plan.primary).not.toBe("download");
          expect(plan.showDownload).toBe(false);
        }
      }
    }
  });
});

describe("导出画布尺寸", () => {
  it("普通榜单按 2 倍渲染，清晰度不降", () => {
    const plan = planExportSize(1200, 780);
    expect(plan).toEqual({ ok: true, ratio: 2, width: 2400, height: 1560 });
  });

  it("27 档长榜单自动降到 iOS 单边上限以内", () => {
    const plan = planExportSize(1200, 2892);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ratio).toBeLessThan(2);
    expect(plan.ratio).toBe(1.41);
    expect(plan.width).toBe(1692);
    expect(plan.height).toBe(4077);
    expectWithinLimits(plan);
  });

  it("30 档榜单仍然完整且不越界", () => {
    expectWithinLimits(planExportSize(1200, 3210));
  });

  it("接近最大条目数的榜单：降低像素比但不越界", () => {
    expectWithinLimits(planExportSize(1200, 12000));
  });

  it("高度 40000px 的极端画布：0.1 倍仍可安全导出", () => {
    const plan = planExportSize(1200, 40000);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ratio).toBe(0.1);
    expect(plan.height).toBe(4000);
    expectWithinLimits(plan);
  });

  it("高度 100000px 的极端画布：拒绝导出，而不是把 0.04 抬回 0.1 后越界", () => {
    const plan = planExportSize(1200, 100000);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("too-large");
    expect(plan.safeRatio).toBeLessThan(MIN_EXPORT_PIXEL_RATIO);
  });

  it("面积上限生效时也不越界（6000×6000）", () => {
    const plan = planExportSize(6000, 6000);
    expectWithinLimits(plan);
    if (plan.ok) expect(plan.width * plan.height).toBeLessThanOrEqual(MAX_EXPORT_AREA);
  });

  it("任何成功生成的尺寸都不超过单边与面积上限", () => {
    const sizes: Array<[number, number]> = [
      [1200, 1],
      [1200, 780],
      [1200, 2892],
      [1200, 3210],
      [1200, 8000],
      [1200, 20000],
      [1200, 40000],
      [1200, 40960],
      [2400, 4000],
      [4096, 4096],
      [6000, 6000],
      [10000, 1000],
    ];
    for (const [w, h] of sizes) expectWithinLimits(planExportSize(w, h));
  });

  it("非法尺寸、0、负数、NaN、Infinity 一律拒绝，不产生 NaN / 负值", () => {
    for (const [w, h] of [
      [0, 0],
      [0, 780],
      [1200, 0],
      [-1, 780],
      [1200, -5],
      [Number.NaN, 100],
      [1200, Number.NaN],
      [Number.POSITIVE_INFINITY, 100],
      [1200, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, 100],
    ]) {
      const plan = planExportSize(w, h);
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.reason).toBe("invalid-size");
    }
  });

  it("preferred 非法时退回 2 倍，而不是产生 NaN / 0", () => {
    for (const preferred of [Number.NaN, 0, -2, Number.NEGATIVE_INFINITY]) {
      const plan = planExportSize(1200, 780, preferred);
      expect(plan).toEqual({ ok: true, ratio: 2, width: 2400, height: 1560 });
    }
  });

  it("拒绝导出时给出可执行的明确提示，而不是静默返回空白图", () => {
    const tooLarge = planExportSize(1200, 100000);
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) {
      expect(tooLarge.reason).toBe("too-large");
      expect(exportSizeProblem(tooLarge)).toContain("太长");
      expect(exportSizeProblem(tooLarge)).toContain("删掉");
    }

    const invalid = planExportSize(0, 0);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.reason).toBe("invalid-size");
      expect(exportSizeProblem(invalid)).toContain("刷新页面");
    }
  });

  it("硬上限常量与文档一致", () => {
    expect(MAX_EXPORT_SIDE).toBe(4096);
    expect(MAX_EXPORT_AREA).toBe(16_000_000);
    expect(MIN_EXPORT_PIXEL_RATIO).toBe(0.1);
  });

  it("单边边界：1200×40960 刚好可导出，1200×41000 拒绝", () => {
    const edge = planExportSize(1200, 40960);
    expect(edge.ok).toBe(true);
    if (edge.ok) {
      expect(edge.ratio).toBe(0.1);
      expect(edge.width).toBe(120);
      expect(edge.height).toBe(4096);
    }
    expect(planExportSize(1200, 41000).ok).toBe(false);
  });
});

describe("导出失败兜底", () => {
  it("toBlob 返回 null 或空 Blob 时按失败处理，不下载 / 分享空图", () => {
    expect(() => assertExportBlob(null)).toThrow("空图片");
    expect(() => assertExportBlob(undefined)).toThrow("空图片");
    expect(() => assertExportBlob(new Blob([]))).toThrow("空图片");
  });

  it("正常 Blob 原样返回", () => {
    const blob = new Blob(["png"], { type: "image/png" });
    expect(assertExportBlob(blob)).toBe(blob);
  });

  it("Canvas 创建失败 / toBlob 异常 / 内存不足翻译成设备能力提示", () => {
    for (const message of [
      "Failed to execute 'toBlob' on 'HTMLCanvasElement'",
      "Canvas is too large",
      "out of memory",
      "设备内存不足",
    ]) {
      const hint = exportFailureMessage(new Error(message));
      expect(hint).toContain("设备无法生成");
      expect(hint).toContain("删掉");
    }
  });

  it("分包装载失败翻译成网络提示", () => {
    expect(exportFailureMessage(new Error("Failed to fetch dynamically imported module"))).toContain("网络");
    expect(exportFailureMessage(new Error("导出组件加载超时"))).toContain("网络");
  });

  it("未知异常保留原始信息并截断，不吞掉原因", () => {
    const hint = exportFailureMessage(new Error("some unexpected renderer failure"));
    expect(hint).toContain("导出失败");
    expect(hint).toContain("unexpected renderer");
  });

  it("withTimeout 透传 Canvas / OOM 错误，不把失败伪装成超时", async () => {
    await expect(withTimeout(Promise.reject(new Error("Canvas is too large")), 50, "超时")).rejects.toThrow(
      "Canvas is too large",
    );
    await expect(withTimeout(Promise.reject(new Error("out of memory")), 50, "超时")).rejects.toThrow("out of memory");
  });
});

describe("文件名", () => {
  it("去掉文件系统不接受的字符，空标题用默认名", () => {
    expect(exportFileName("AI/模型: 排名?", "20260101-120000")).toBe("20260101-120000-AI模型 排名-排行榜.png");
    expect(exportFileName("", "20260101-120000")).toBe("20260101-120000-从夯到拉-排行榜.png");
    expect(exportFileName("///", "20260101-120000")).toBe("20260101-120000-从夯到拉-排行榜.png");
  });
});

describe("系统分享", () => {
  const blob = () => new Blob(["png"], { type: "image/png" });

  it("分享成功返回 shared", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true });
    await expect(shareBlob(blob(), "a.png", "排行榜")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
  });

  it("用户取消返回 cancelled，不当作失败", async () => {
    const cancel = Object.assign(new Error("cancelled"), { name: "AbortError" });
    vi.stubGlobal("navigator", {
      share: async () => {
        throw cancel;
      },
      canShare: () => true,
    });
    await expect(shareBlob(blob(), "a.png")).resolves.toBe("cancelled");
  });

  it("浏览器没有 share API 时返回 unsupported", async () => {
    vi.stubGlobal("navigator", {});
    await expect(shareBlob(blob(), "a.png")).resolves.toBe("unsupported");
  });

  it("有 share 但 canShare 拒绝文件时返回 unsupported", async () => {
    vi.stubGlobal("navigator", { share: async () => undefined, canShare: () => false });
    await expect(shareBlob(blob(), "a.png")).resolves.toBe("unsupported");
  });

  it("其它异常也返回 unsupported，不会误报成功", async () => {
    vi.stubGlobal("navigator", {
      share: async () => {
        throw new Error("not allowed");
      },
      canShare: () => true,
    });
    await expect(shareBlob(blob(), "a.png")).resolves.toBe("unsupported");
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
