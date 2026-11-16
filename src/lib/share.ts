import type { Board, DisplaySettings } from "../types";
import { encodeBoard, encodeBoardAsync, estimateShareChars, measureShareChars } from "./utils";

/**
 * 舒适上限：多数聊天软件（微信 / QQ / 群聊输入框）能完整收发链接的长度，
 * 超过这条线就很容易被客户端截断，此时应该优先改用「下载 PNG」。
 */
export const SHARE_URL_COMFORT_LIMIT = 8_000;
/** 提醒上限：到这个长度基本只能靠邮件 / 文档 / 二维码传 */
export const SHARE_URL_SOFT_LIMIT = 60_000;
/** 硬上限：超过后 URL 本身已不可靠（很多客户端直接截断），且编码/复制会明显卡顿，禁用复制 */
export const SHARE_URL_HARD_LIMIT = 2_000_000;
/** 超过这个体量改用分片异步编码，避免一次 base64 把主线程按死 */
export const SHARE_ASYNC_THRESHOLD = 50_000;

export type ShareLengthState = "ok" | "long" | "over";

export type ShareLengthInfo = {
  state: ShareLengthState;
  /** 链接字符数 */
  chars: number;
  /** 按 UTF-16 估的 KB，用于给用户一个直观量级 */
  kb: number;
};

/**
 * 长度分档。既接受现成的 URL（旧调用方），也接受字符数——
 * 现在的流程是先量长度、再决定要不要真的编码，拿不到 URL 的时候要能单独判档。
 */
export function shareLengthInfo(input: string | number): ShareLengthInfo {
  const chars = typeof input === "number" ? input : input.length;
  const state: ShareLengthState =
    chars > SHARE_URL_HARD_LIMIT ? "over" : chars > SHARE_URL_COMFORT_LIMIT ? "long" : "ok";
  return { state, chars, kb: Math.round((chars / 1024) * 10) / 10 };
}

/** 分享链接的前缀：当前页面去掉 hash。同一个页面里打开分享弹窗时取一次即可 */
export function shareBase(): string {
  if (typeof location === "undefined") return "https://example.invalid/";
  return location.href.split("#")[0];
}

/** 分享链接：整份榜单（含图片与显示设置）编进 URL hash，不依赖任何服务端 */
export function buildShareUrl(board: Board, display?: DisplaySettings, base = shareBase()): string {
  return base + "#/r/" + encodeBoard(board, display);
}

export type SharePlan =
  /** 预估或实测量级已超硬上限：**没有生成过链接**，调用方应引导用户下载 PNG */
  | { status: "over"; chars: number; kb: number; estimated: boolean }
  | { status: "ready"; url: string; chars: number; kb: number; state: ShareLengthState };

function overPlan(chars: number, estimated: boolean): SharePlan {
  const info = shareLengthInfo(chars);
  return { status: "over", chars, kb: info.kb, estimated };
}

/**
 * 规划分享链接（同步版，供测试与短数据使用）。
 *
 * 顺序很重要：先算体量下界 → 再精确量长度 → 只有确认没超硬上限才真的编码。
 * 以前的实现是先 buildShareUrl 再判断长度：一个 5MB 的榜单会先生成 ~7MB 的字符串，
 * 主线程卡死两三秒，然后才告诉用户"太长了"。
 */
export function planShareSync(board: Board, display?: DisplaySettings, base = shareBase()): SharePlan {
  // 前缀 + "#/r/" 不是 payload，但会占 URL 长度
  const room = SHARE_URL_HARD_LIMIT - base.length - 4;
  const lower = estimateShareChars(board, display);
  if (lower > room) return overPlan(lower + base.length + 4, true);
  const payload = measureShareChars(board, display);
  if (payload > room) return overPlan(payload + base.length + 4, false);
  const url = base + "#/r/" + encodeBoard(board, display);
  const info = shareLengthInfo(url);
  return { status: "ready", url, chars: info.chars, kb: info.kb, state: info.state };
}

/** 异步版：给分享弹窗用，超过阈值时分片编码让出主线程 */
export async function planShare(board: Board, display?: DisplaySettings, base = shareBase()): Promise<SharePlan> {
  const room = SHARE_URL_HARD_LIMIT - base.length - 4;
  const lower = estimateShareChars(board, display);
  if (lower > room) return overPlan(lower + base.length + 4, true);
  const payload = measureShareChars(board, display);
  if (payload > room) return overPlan(payload + base.length + 4, false);
  const encoded =
    payload > SHARE_ASYNC_THRESHOLD ? await encodeBoardAsync(board, display) : encodeBoard(board, display);
  const url = base + "#/r/" + encoded;
  const info = shareLengthInfo(url);
  return { status: "ready", url, chars: info.chars, kb: info.kb, state: info.state };
}

/**
 * 当前环境下"复制链接"是否可用，以及要提示什么。
 * 没部署上线时只做提示，不假装能分享。
 */
export function shareLinkNotice(): { disabled: boolean; hint: string } {
  if (typeof location === "undefined") return { disabled: false, hint: "" };
  if (location.protocol === "file:") {
    return { disabled: true, hint: "离线版没有可分享的网址，请用「下载 PNG」把成品图发出去。" };
  }
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    return { disabled: false, hint: "当前是本机地址，别人打不开；等部署到公网后这条链接才能分享出去。" };
  }
  return { disabled: false, hint: "" };
}
