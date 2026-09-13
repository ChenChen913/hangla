import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Board, DisplaySettings, Item } from "../types";
import { DEFAULT_MODE, DEFAULT_STYLE, STYLE_NAMES, type Mode, type StyleId } from "./themes";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

let uidSeq = 0;
/** 短 id：时间戳 + 自增序号 + 随机尾，避免多次导入/快照时撞号 */
export const uid = () => (Date.now().toString(36) + "-" + (uidSeq++).toString(36) + Math.random().toString(36).slice(2, 6));
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 当前时间戳（用于导出文件名前缀），精确到秒：20260913-101541 */
export function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* ---------- 颜色 ---------- */
export function parseHex(h: string) {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
/** 把 a 以 weight 比例混入 b */
export function mixColors(a: string, b: string, weight: number) {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const m = (x: number, y: number) => Math.round(x * weight + y * (1 - weight));
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}
export const lighten = (hex: string, w = 0.14) => mixColors(hex, "#ffffff", w);
/** 依据亮度决定标签文字用深色还是白色 */
export function labelTextColor(hex: string) {
  const [r, g, b] = parseHex(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "rgba(28,24,8,.82)" : "#ffffff";
}

/* ---------- 剪贴板（file:// 下自动降级） ---------- */
export async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/* ---------- 榜单数据规范化（新旧结构统一到 v4） ---------- */
export function normalizeItem(raw: unknown): Item {
  const r = raw as Record<string, unknown>;
  if (r && typeof r === "object") {
    // v2/v3 旧结构必须先判：{type:"text",text} | {type:"image",src,name}。
    // 旧图片条目同样带 name，如果先走下面的现代分支，就会因为读不到 r.image 而把图片丢掉。
    if (r.type === "text") return { id: (r.id as string) ?? uid(), name: String(r.text ?? "") };
    if (r.type === "image") {
      return {
        id: (r.id as string) ?? uid(),
        name: (r.name as string) || "图片",
        image: isSafeImage(r.src) ? (r.src as string) : undefined,
      };
    }
    if (typeof r.name === "string") {
      return {
        id: typeof r.id === "string" ? r.id : uid(),
        name: r.name,
        desc: typeof r.desc === "string" && r.desc ? r.desc : undefined,
        // 只放行内联图片：分享链接里的外链图片会让打开者去请求第三方地址（暴露 IP / 可用于追踪）
        image: isSafeImage(r.image) ? r.image : undefined,
        tilt: typeof r.tilt === "number" ? r.tilt : undefined,
      };
    }
  }
  return { id: uid(), name: "未命名" };
}

function isSafeImage(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("data:image/");
}

export function normalizeBoard(raw: unknown): Board {
  const r = (raw ?? {}) as Record<string, unknown>;
  const tiers = Array.isArray(r.tiers)
    ? (r.tiers as Record<string, unknown>[]).map(t => ({
        id: (t?.id as string) ?? uid(),
        name: String(t?.name ?? "档位"),
        color: String(t?.color ?? "#9AA5B1"),
        items: Array.isArray(t?.items) ? (t.items as unknown[]).map(normalizeItem) : [],
      }))
    : [];
  // 旧 theme 字符串 → 风格 + 日夜两维度
  const legacyMap: Record<string, [StyleId, Mode]> = {
    clean: ["classic", "day"],
    studio: ["classic", "night"],
    hype: ["hype", "day"],
    neon: ["neon", "night"],
  };
  const themeRaw = typeof r.theme === "string" ? r.theme : "";
  const [legacyStyle, legacyMode] = legacyMap[themeRaw] ?? [];
  const style = (typeof r.style === "string" && r.style in STYLE_NAMES
    ? (r.style as StyleId)
    : legacyStyle ?? DEFAULT_STYLE) as StyleId;
  const mode = (r.mode === "day" || r.mode === "night" ? r.mode : legacyMode ?? DEFAULT_MODE) as Mode;
  return {
    title: typeof r.title === "string" ? r.title : "",
    subtitle: typeof r.subtitle === "string" && r.subtitle ? r.subtitle : undefined,
    style,
    mode,
    presetId: typeof r.presetId === "string" ? r.presetId : "custom",
    tiers,
    pool: Array.isArray(r.pool) ? (r.pool as unknown[]).map(normalizeItem) : [],
  };
}

/** 由条目 id 生成稳定的随机歪斜角度（-max° ~ +max°），同一项目每次渲染角度一致 */
export function tiltFor(id: string, max: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % (max * 2 + 1)) - max;
}

/** 条目实际歪斜角度：单独设置优先，否则按全局最大角度随机 */
export function itemAngle(item: Item, display: DisplaySettings): number {
  return typeof item.tilt === "number" ? item.tilt : tiltFor(item.id, display.tiltMax);
}

/* ---------- 分享链接编解码（UTF-8 安全 Base64URL） ---------- */
export function encodeBoard(b: Board): string {
  const bytes = new TextEncoder().encode(JSON.stringify(b));
  let bin = "";
  bytes.forEach(x => (bin += String.fromCharCode(x)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeBoard(s: string): Board | null {
  try {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
    if (!o || !Array.isArray(o.tiers)) return null;
    return normalizeBoard(o);
  } catch {
    return null;
  }
}

/* ---------- 图片：读文件 + 重编码 ---------- */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(file);
  });
}

export const IMAGE_MAX_SIDE = 640;
/** 单张图片允许的原始体积上限，超过直接拒绝，避免把浏览器读爆 */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

/** data URL 的原始字节数（base64 每 4 个字符还原 3 字节，忽略 padding 的误差可忽略） */
export function dataUrlBytes(url: string): number {
  const comma = url.indexOf(",");
  if (comma < 0) return url.length;
  return Math.round(((url.length - comma - 1) * 3) / 4);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = src;
  });
}

/** 是否含半透明/透明像素——含透明的插画必须留 PNG，转 JPEG 会把透明区域压成黑块 */
function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

/**
 * 重编码到最长边 max 以内，并按内容挑格式：
 * - 有透明通道 → PNG（无损）
 * - 无透明通道 → JPEG q0.85（同样一张 640×480 照片，PNG 811KB、JPEG 84KB，差 9.7 倍，
 *   而 localStorage 只有 5MB 左右，用 PNG 存照片第 7 张就写不进去了）
 *
 * 两条保底：重编码比原图大时保留原图（小图标不会被"压大"）；解码失败原样返回（不丢东西）。
 * 注意：小于 max 的原图也会重新编码，否则一张 600×600 的 2MB 截图会被原样塞进存档。
 */
export async function encodeImage(dataUrl: string, max = IMAGE_MAX_SIDE): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const side = Math.max(img.naturalWidth, img.naturalHeight);
    if (!side || !img.naturalWidth) return dataUrl;
    const k = Math.min(1, max / side);
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const next = hasAlpha(ctx, w, h) ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
    return next.length < dataUrl.length ? next : dataUrl;
  } catch {
    return dataUrl;
  }
}
