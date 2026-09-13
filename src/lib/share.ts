import type { Board } from "../types";
import { encodeBoard } from "./utils";

/**
 * 分享链接：整份榜单（含图片）编进 URL hash，不依赖任何服务端。
 *
 * 两个已知边界：
 * - **离线版没有可分享的地址**：file:// 下拼出来的是本机路径，发给别人打不开；
 * - **链接会很长**：图片是内联的，实测 8 张 640×480 照片 ≈ 8MB，多数聊天软件会截断。
 *
 * TODO(部署后再做)：接一个短链服务——把 payload POST 给后端换成短 id，URL 只留 id。
 * 那时只需要改这里的 buildShareUrl，调用方（ShareDialog）不用动。
 */
export const SHARE_URL_SOFT_LIMIT = 60000;

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
