/**
 * 导出图片的「落盘通道」与画布上限。
 *
 * 手机上不是点一下 `a[download]` 就完事，三个真实坑：
 *
 * 1. **iOS Safari 对 `data:` URL + `download` 基本不认**。原来的写法是
 *    `toPng(...)` 拿到几 MB 的 data URL，再对**游离**的 `<a>` 调 `click()`；
 *    iOS 上既没有"下载"提示，也不会打开新标签页，表现就是提示导出成功、
 *    相册和「文件」里却什么都没有。
 * 2. **微信 / QQ / 微博等内置浏览器直接忽略 `download` 属性**（WKWebView、X5 都一样）。
 * 3. **长榜单会超出 iOS 的画布上限**。按固定 2 倍像素比截图时，1200px 宽、27 个档位的
 *    榜单会生成 2400×5784 的位图，超过 iOS 单边 4096 / 面积约 16.7M 像素的限制，
 *    得到的是一张空白图或下半截被裁掉的图。
 *
 * 这里的对策：
 * - 画布尺寸按上限自适应（见 `planExportSize`），永远不超过设备能吃下的位图；
 * - 极端长图宁可明确拒绝，也不生成一张超限 / 空白的图片；
 * - 下载一律走 Blob + **真实挂载到文档里**的 `<a>`，不用 data URL；
 * - iOS 与内置浏览器改走「先出预览面板」：面板里的按钮是新的用户手势，
 *   能正常调起系统分享；不能分享时用户长按图片也能存进相册。
 */

/** iOS Safari 单边画布上限；超过就得不到内容 */
export const MAX_EXPORT_SIDE = 4096;
/** iOS 的画布面积上限约 16.7M 像素，留一点余量给各版本差异 */
export const MAX_EXPORT_AREA = 16_000_000;
/** 位图再小也要保证可读；低于这个比例就不生成，直接明确提示用户 */
export const MIN_EXPORT_PIXEL_RATIO = 0.1;

export type ExportSizePlan =
  | { ok: true; ratio: number; width: number; height: number }
  | { ok: false; reason: "invalid-size" | "too-large"; width: number; height: number; safeRatio: number };

/**
 * 导出画布规划：优先用 preferred（默认 2 倍，高清），但单边与总面积都不得超过硬上限。
 *
 * 关键点：**最低清晰度是拒绝线，不是可以把尺寸顶出上限的保底值**。
 * 榜单高度到 10 万像素时，安全像素比只有 0.04；旧实现用 Math.max(0.1, …)
 * 把它抬回 0.1，画布就会变成 12000px 高，重新触发 iOS 空白图。
 *
 * 向下取整到百分位——四舍五入会把 4096 顶成 4106，正好越界。
 */
export function planExportSize(width: number, height: number, preferred = 2): ExportSizePlan {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, reason: "invalid-size", width, height, safeRatio: 0 };
  }
  const wanted = Number.isFinite(preferred) && preferred > 0 ? preferred : 2;
  const bySide = MAX_EXPORT_SIDE / Math.max(width, height);
  const byArea = Math.sqrt(MAX_EXPORT_AREA / (width * height));
  const safe = Math.min(wanted, bySide, byArea);
  const ratio = Math.floor(safe * 100) / 100;

  // 安全比已经低到没有分享价值：拒绝导出，让调用方给出明确提示
  if (ratio < MIN_EXPORT_PIXEL_RATIO) {
    return { ok: false, reason: "too-large", width, height, safeRatio: safe };
  }

  const outWidth = Math.floor(width * ratio);
  const outHeight = Math.floor(height * ratio);
  // 双保险：浮点误差或极端输入也不能突破任何一条硬限制
  if (
    outWidth <= 0 ||
    outHeight <= 0 ||
    outWidth > MAX_EXPORT_SIDE ||
    outHeight > MAX_EXPORT_SIDE ||
    outWidth * outHeight > MAX_EXPORT_AREA
  ) {
    return { ok: false, reason: "too-large", width, height, safeRatio: safe };
  }

  return { ok: true, ratio, width: outWidth, height: outHeight };
}

/** 规划失败时给用户看的明确原因（不能静默返回空白图） */
export function exportSizeProblem(plan: Extract<ExportSizePlan, { ok: false }>): string {
  if (plan.reason === "invalid-size") return "导出画布尺寸异常，请刷新页面后重试";
  return "榜单太长，已超出手机能生成的图片上限；先删掉几个档位或项目再试";
}

/** iOS / iPadOS（含 iPadOS 13+ 的桌面 UA） */
export function isIosLike(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return true;
  // iPadOS 13 起默认发桌面 UA，只能靠触点数把它和真正的 Mac 区分开
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/**
 * 内置浏览器（WebView）：`download` 属性会被忽略。
 * QQ 浏览器（QQBrowser）自带下载器，不在此列。
 */
const IN_APP_RE =
  /MicroMessenger|Weibo|AlipayClient|DingTalk|Lark|Feishu|baiduboxapp|aweme|Instagram|FBAN|FBAV|Line\/|Snapchat/i;

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_RE.test(userAgent);
}

export type SaveChannel = "download" | "sheet";

export type SaveUiPlan = {
  channel: SaveChannel;
  /** 主操作：直接下载 / 系统分享 / 只能长按保存 */
  primary: "download" | "share" | "longpress";
  /** 是否展示「直接下载」按钮（不可靠的环境必须为 false） */
  showDownload: boolean;
  /** 是否展示系统分享按钮 */
  showShare: boolean;
  /** 是否提示长按图片保存（手机 / 平板上的最后一条可靠通道） */
  showLongPressHint: boolean;
};

/**
 * 该环境下「保存图片」面板应该给哪些入口。
 * 纯函数，平台差异全部收敛在这里，方便单测钉死。
 *
 * 原则：**已经知道不可靠的通道，不作为正常主入口**。
 * - 内置浏览器：`download` 被忽略，系统分享也常被禁用 → 只提示长按保存
 * - iOS：异步 click 会被静默拦截 → 系统分享优先，不支持则长按
 * - 桌面 / Android：直接下载可靠，保留主入口
 */
export function planSaveUi(env: {
  userAgent: string;
  maxTouchPoints?: number;
  supportsDownload?: boolean;
  supportsShareFiles?: boolean;
}): SaveUiPlan {
  const ua = env.userAgent ?? "";
  const touchPoints = env.maxTouchPoints ?? 0;
  const supportsDownload = env.supportsDownload ?? true;
  const supportsShare = env.supportsShareFiles ?? false;

  // 微信 / QQ / 微博等内置浏览器：download 与系统分享都不可靠，长按是唯一稳妥路径
  if (isInAppBrowser(ua)) {
    return { channel: "sheet", primary: "longpress", showDownload: false, showShare: false, showLongPressHint: true };
  }

  // iOS / iPadOS：下载会被静默拦截，优先系统分享
  if (isIosLike(ua, touchPoints)) {
    return supportsShare
      ? { channel: "sheet", primary: "share", showDownload: false, showShare: true, showLongPressHint: true }
      : { channel: "sheet", primary: "longpress", showDownload: false, showShare: false, showLongPressHint: true };
  }

  // 浏览器没有 download 能力：有系统分享就用分享，否则长按
  if (!supportsDownload) {
    return supportsShare
      ? { channel: "sheet", primary: "share", showDownload: false, showShare: true, showLongPressHint: true }
      : { channel: "sheet", primary: "longpress", showDownload: false, showShare: false, showLongPressHint: true };
  }

  // 桌面 / Android Chrome：保留直接下载；支持文件分享时多给一个次要入口
  return { channel: "download", primary: "download", showDownload: true, showShare: supportsShare, showLongPressHint: false };
}

/** 该走「直接下载」还是「先出保存面板」 */
export function pickSaveChannel(env: {
  userAgent: string;
  maxTouchPoints?: number;
  supportsDownload?: boolean;
  supportsShareFiles?: boolean;
}): SaveChannel {
  return planSaveUi(env).channel;
}

/** 浏览器是否真的能用系统分享发送文件（有些实现有 share 但没有 files） */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof File !== "function") {
    return false;
  }
  try {
    if (typeof navigator.canShare !== "function") return true;
    return navigator.canShare({ files: [new File([""], "hangla.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

export type SaveEnvironment = {
  userAgent: string;
  maxTouchPoints: number;
  supportsDownload: boolean;
  supportsShareFiles: boolean;
};

/** 当前设备的保存能力（服务端渲染 / 测试环境按"直接下载"处理） */
export function currentSaveEnvironment(): SaveEnvironment {
  if (typeof navigator === "undefined" || typeof document === "undefined") {
    return { userAgent: "", maxTouchPoints: 0, supportsDownload: true, supportsShareFiles: false };
  }
  let supportsDownload = false;
  try {
    supportsDownload = "download" in document.createElement("a");
  } catch {
    supportsDownload = false;
  }
  return {
    userAgent: navigator.userAgent ?? "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    supportsDownload,
    supportsShareFiles: canShareFiles(),
  };
}

/** 当前设备应该展示的保存入口 */
export function currentSavePlan(): SaveUiPlan {
  return planSaveUi(currentSaveEnvironment());
}

/**
 * 给异步任务加超时。
 *
 * html-to-image 是动态分包（十几 KB）。网络卡住时 `import()` 既不 resolve 也不 reject，
 * 界面就一直停在「正在生成图片…」——用户看到的就是"点了没反应"。
 * 截屏本身也可能因为图片过多卡在同一状态，所以两处都要有明确的上限。
 */
export function withTimeout<T>(task: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    task.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** data URL → Blob（分享卡片预览历史数据是 data URL 时用；新流程直接产 Blob） */ export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("不是合法的 data URL");
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /^data:([^;,]+)/.exec(head)?.[1] ?? "image/png";
  if (!/;base64/i.test(head)) {
    return new Blob([decodeURIComponent(body)], { type: mime });
  }
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * 下载一个 Blob。
 *
 * 两个细节不能省：
 * - `<a>` 必须 append 到文档里再 click（游离节点在 iOS / 部分 Android WebView 上不触发下载）；
 * - 立刻 revokeObjectURL 会让部分浏览器取消下载，留 10 秒缓冲。
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export type ShareResult = "shared" | "cancelled" | "unsupported";

/** 调系统分享面板（iOS / Android 都能把图片存进相册或直接发出去） */
export async function shareBlob(blob: Blob, filename: string, title?: string): Promise<ShareResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return "unsupported";
  try {
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
      return "unsupported";
    }
    await navigator.share({ files: [file], title });
    return "shared";
  } catch (error) {
    // 用户主动取消不是失败，别再弹"不支持"
    return (error as Error)?.name === "AbortError" ? "cancelled" : "unsupported";
  }
}

/** 导出文件名：去掉文件系统不接受的字符，空标题兜底 */
export function exportFileName(title: string, stamp: string): string {
  const name = (title || "从夯到拉").replace(/[\\/:*?"<>|]/g, "").trim() || "从夯到拉";
  return `${stamp}-${name}-排行榜.png`;
}
