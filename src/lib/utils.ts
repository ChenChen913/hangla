import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Board, DisplaySettings, Item } from "../types";
import { DEFAULT_MODE, DEFAULT_STYLE, STYLE_NAMES } from "./themes";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const uid = () => Math.random().toString(36).slice(2, 10);
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
    if (typeof r.name === "string") {
      return {
        id: typeof r.id === "string" ? r.id : uid(),
        name: r.name,
        desc: typeof r.desc === "string" && r.desc ? r.desc : undefined,
        image: typeof r.image === "string" && r.image ? r.image : undefined,
        tilt: typeof r.tilt === "number" ? r.tilt : undefined,
      };
    }
    // v2/v3 旧结构：{type:"text",text} | {type:"image",src,name}
    if (r.type === "text") return { id: (r.id as string) ?? uid(), name: String(r.text ?? "") };
    if (r.type === "image") return { id: (r.id as string) ?? uid(), name: (r.name as string) || "图片", image: r.src as string };
  }
  return { id: uid(), name: "未命名" };
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
  const legacyMap: Record<string, [string, string]> = {
    clean: ["classic", "day"],
    studio: ["classic", "night"],
    hype: ["hype", "day"],
    neon: ["neon", "night"],
  };
  const themeRaw = typeof r.theme === "string" ? r.theme : "";
  const [legacyStyle, legacyMode] = legacyMap[themeRaw] ?? [];
  const style = typeof r.style === "string" && r.style in STYLE_NAMES ? r.style : legacyStyle ?? DEFAULT_STYLE;
  const mode = r.mode === "day" || r.mode === "night" ? r.mode : legacyMode ?? DEFAULT_MODE;
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

/* ---------- 图片：读文件 + 压缩到 max 边长 ---------- */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(file);
  });
}
export function downscaleImage(dataUrl: string, max = 640): Promise<string> {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      if (Math.max(img.width, img.height) <= max) return res(dataUrl);
      const k = max / Math.max(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      try {
        res(c.toDataURL("image/png"));
      } catch {
        res(dataUrl);
      }
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}
