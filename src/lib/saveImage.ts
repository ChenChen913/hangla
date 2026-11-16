/**
 * 导出图片的「落盘通道」。
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
 * - 画布尺寸按上限自适应（见 `exportPixelRatio`），永远不超过设备能吃下的位图；
 * - 下载一律走 Blob + **真实挂载到文档里**的 `<a>`，不用 data URL；
 * - iOS 与内置浏览器改走「先出预览面板」：面板里的按钮是新的用户手势，
 *   能正常调起系统分享；不能分享时用户长按图片也能存进相册。
 */

/** iOS Safari 单边画布上限；超过就得不到内容 */
export const MAX_EXPORT_SIDE = 4096;
/** iOS 的画布面积上限约 16.7M 像素，留一点余量给各版本差异 */
export const MAX_EXPORT_AREA = 16_000_000;
/** 位图再小也要保证可读，低于 0.1 倍就没有分享价值了（正常榜单不会触发） */
const MIN_PIXEL_RATIO = 0.1;

/**
 * 导出用的像素比：优先用 preferred（默认 2 倍，高清），
 * 但不超过单边 / 面积上限，避免手机上生成一张空白图。
 * 向下取整到百分位——四舍五入会把 4096 顶成 4106，正好越界。
 */
export function exportPixelRatio(width: number, height: number, preferred = 2): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  const bySide = MAX_EXPORT_SIDE / Math.max(width, height);
  const byArea = Math.sqrt(MAX_EXPORT_AREA / (width * height));
  const ratio = Math.min(preferred, bySide, byArea);
  return Math.max(MIN_PIXEL_RATIO, Math.floor(ratio * 100) / 100);
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

/**
 * 该走「直接下载」还是「先出保存面板」。
 * 纯函数，平台差异全部收敛在这里，方便单测钉死。
 */
export function pickSaveChannel(env: {
  userAgent: string;
  maxTouchPoints?: number;
  supportsDownload?: boolean;
}): SaveChannel {
  const { userAgent, maxTouchPoints = 0, supportsDownload = true } = env;
  // 内置浏览器：点了等于没点，只能长按保存
  if (isInAppBrowser(userAgent)) return "sheet";
  // iOS：异步 click 常常被静默拦截，交给面板里的系统分享 / 长按
  if (isIosLike(userAgent, maxTouchPoints)) return "sheet";
  if (!supportsDownload) return "sheet";
  return "download";
}

/** 当前设备的保存通道（服务端渲染 / 测试环境按"直接下载"处理） */
export function currentSaveChannel(): SaveChannel {
  if (typeof navigator === "undefined" || typeof document === "undefined") return "download";
  let supportsDownload = false;
  try {
    supportsDownload = "download" in document.createElement("a");
  } catch {
    supportsDownload = false;
  }
  return pickSaveChannel({
    userAgent: navigator.userAgent ?? "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    supportsDownload,
  });
}

/** data URL → Blob（分享卡片预览历史数据是 data URL 时用；新流程直接产 Blob） */
export function dataUrlToBlob(dataUrl: string): Blob {
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
