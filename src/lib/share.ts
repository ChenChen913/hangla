import type { Board } from "../types";
import { encodeBoard } from "./utils";

/**
 * 舒适上限：多数聊天软件（微信 / QQ / 群聊输入框）能完整收发链接的长度，
 * 超过这条线就很容易被客户端截断，此时应该优先改用「下载 PNG」。
 */
export const SHARE_URL_COMFORT_LIMIT = 8_000;
/** 提醒上限：到这个长度基本只能靠邮件 / 文档 / 二维码传 */
export const SHARE_URL_SOFT_LIMIT = 60_000;
/** 硬上限：超过后 URL 本身已不可靠（很多客户端直接截断），且编码/复制会明显卡顿，禁用复制 */
export const SHARE_URL_HARD_LIMIT = 2_000_000;

export type ShareLengthState = "ok" | "long" | "over";

export type ShareLengthInfo = {
  state: ShareLengthState;
  /** 链接字符数 */
  chars: number;
  /** 按 UTF-16 估的 KB，用于给用户一个直观量级 */
  kb: number;
};

export function shareLengthInfo(url: string): ShareLengthInfo {
  const chars = url.length;
  const state: ShareLengthState =
    chars > SHARE_URL_HARD_LIMIT ? "over" : chars > SHARE_URL_COMFORT_LIMIT ? "long" : "ok";
  return { state, chars, kb: Math.round((chars / 1024) * 10) / 10 };
}

/**
 * 分享链接：整份榜单（含图片）编进 URL hash，不依赖任何服务端。
 *
 * 两个已知边界：
 * - **离线版没有可分享的地址**：file:// 下拼出来的是本机路径，发给别人打不开；
 * - **带图就太长**：一张 640px 照片压缩后约 80KB，进 data URL 再整体 base64，
 *   编进链接约 14 万字符——远超聊天软件能收的长度。所以**含图榜单的正解是下载 PNG**，
 *   链接只适合纯文字榜单。
 *
 * TODO(部署后再做)：接一个短链服务——把 payload POST 给后端换成短 id，URL 只留 id。
 * 那时只需要改这里的 buildShareUrl，调用方（ShareDialog）不用动。
 */
export function buildShareUrl(board: Board): string {
  return location.href.split("#")[0] + "#/r/" + encodeBoard(board);
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
