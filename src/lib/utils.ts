import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Board, DisplaySettings, Item } from "../types";
import { DEFAULT_MODE, DEFAULT_STYLE, STYLE_NAMES, type Mode, type StyleId } from "./themes";
import { TIER_PRESETS } from "./presets";

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
type Rgb = [number, number, number];

/** 解析 #rgb / #rrggbb / rgb(r,g,b)：认不出来返回 null（不抛错，配色数据来自存档与分享链接） */
export function parseColor(v: string): Rgb | null {
  const s = v.trim();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

export function parseHex(h: string): Rgb {
  return parseColor(h) ?? [154, 165, 177];
}

/** 把 a 以 weight 比例混入 b（weight=1 → 纯 a，0 → 纯 b） */
export function mixColors(a: string, b: string, weight: number) {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const m = (x: number, y: number) => Math.round(x * weight + y * (1 - weight));
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}

/**
 * 与白色混合：amount=0 保留原色，amount=1 变纯白。
 *
 * 注意参数含义与 mixColors 相反（这里是"混入多少白"），
 * 早前 lighten(hex, 0.14) 直接调 mixColors(hex,"#fff",0.14) 得到的其实是 86% 白，
 * 标签渐变起点被冲成近白色，白字压上去几乎看不见（对比度 1.15:1）。
 */
export function mixWhite(hex: string, amount: number) {
  return mixColors(hex, "#ffffff", 1 - amount);
}

/** WCAG 相对亮度 */
function relativeLuminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 对比度（1 ~ 21）。任一侧解析不出来时返回 21，表示"不构成可判定的问题" */
export function contrastRatio(fg: string, bg: string): number {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return 21;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
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

/* ---------- 导入/分享数据的体量与安全上限 ---------- */
/**
 * 旧结构 / 分享链接 / 导入 JSON / 正常编辑统一使用的硬上限。
 *
 * 取值依据：编辑器标题框 maxLength 60 → 放宽到 120 容纳导入的旧榜单；
 * 档位标签列固定 190px、字号 36px，16 个汉字已经要折 4 行，再长会撑破行高；
 * 条目卡名称有 220px 省略号，60 足够；单档 200 条 / 30 档 / 项目库 500 是
 * 「正常用户摸不到、极端数据又不会把页面拖死」的折中。
 */
export const BOARD_LIMITS = {
  /** decodeBoard 输入字符串的最大长度：再长就不像正常链接，直接拒绝解码 */
  decodeChars: 6_000_000,
  /** 单张内联图片 data URL 的最大字符数（640px JPEG 约 80KB，留足余量） */
  imageChars: 2_500_000,
  tiers: 30,
  itemsPerTier: 200,
  pool: 500,
  /** 所有档位内的条目总数上限（不含项目库）：30×200=6000 张卡片会把 DOM 拖死 */
  totalItems: 3_000,
  title: 120,
  subtitle: 80,
  tierName: 16,
  itemName: 60,
  desc: 200,
  /** id 是内部标识，超过这个长度只可能是构造出来的垃圾数据 */
  id: 64,
  /** 单张图片允许的歪斜角度绝对值（与编辑弹窗的滑杆范围一致） */
  tilt: 45,
  /** 字体名是 CSS 值，限制长度避免异常长串进入 inline style */
  cardFont: 120,
  /** JSON 导入文件上限：正常榜单（含几十张图）不到 4MB */
  importBytes: 8 * 1024 * 1024,
} as const;

/** 档位颜色非法时的兜底值（默认预设里的灰蓝） */
export const FALLBACK_TIER_COLOR = "#9AA5B1";

/** 档位颜色白名单：只接受 #rgb / #rrggbb（大小写均可），挡住 url()、rgb()、命名色与注入串 */
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function safeTierColor(v: unknown): string {
  return typeof v === "string" && HEX_COLOR_RE.test(v) ? v : FALLBACK_TIER_COLOR;
}

/** id 必须是非空字符串，纯空白与异常长串按无效处理 */
function safeId(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" && v.length <= BOARD_LIMITS.id ? v : null;
}

/** 同一份榜单里的 id 必须唯一：缺失/重复一律换成新的 uid() */
function uniqueId(candidate: string | null, seen: Set<string>): string {
  let id = candidate ?? uid();
  while (seen.has(id)) id = uid();
  seen.add(id);
  return id;
}

/**
 * 按「字符」而不是 UTF-16 码元截断：直接 slice 会把 emoji 的代理对切成半个，
 * 存进 JSON / 分享链接后变成乱码。
 */
export function truncateText(v: string, max: number): string {
  if (v.length <= max) return v;
  let out = "";
  let n = 0;
  for (const ch of v) {
    if (n >= max) break;
    out += ch;
    n++;
  }
  return out;
}

function cleanText(v: unknown, max: number, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const t = truncateText(v.trim(), max);
  return t || fallback;
}

/* ---------- 显示设置规范化 ---------- */
/** 与 store 初始值、DisplaySettings 面板的范围保持一致 */
export const DEFAULT_DISPLAY: DisplaySettings = {
  showImages: true,
  showNames: true,
  tiltImages: false,
  tiltMax: 20,
  cardFont: "",
  cardFontSize: 15,
  cardFontWeight: 500,
  cardImageSize: 56,
  labelFont: "standard",
  labelAnim: "standard",
  labelFlat: false,
  rowGap: 12,
};

const FONT_WEIGHTS = [300, 400, 500, 700, 900];
const LABEL_FONTS: DisplaySettings["labelFont"][] = ["standard", "artistic"];
const LABEL_ANIMS: DisplaySettings["labelAnim"][] = ["off", "subtle", "standard", "strong"];

/**
 * 显示设置只影响渲染，但它来自存档 / 分享链接，必须当成不可信输入：
 * 一个 tiltMax=1e9 或字号 -5 就足以让整页布局失控。
 * 范围与 DisplaySettings 面板的滑杆 min/max 一致。
 */
export function normalizeDisplay(raw: unknown): DisplaySettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? clamp(Math.round(v), min, max) : fallback;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

  return {
    showImages: bool(r.showImages, DEFAULT_DISPLAY.showImages),
    showNames: bool(r.showNames, DEFAULT_DISPLAY.showNames),
    tiltImages: bool(r.tiltImages, DEFAULT_DISPLAY.tiltImages),
    tiltMax: num(r.tiltMax, 5, 45, DEFAULT_DISPLAY.tiltMax),
    cardFont: typeof r.cardFont === "string" ? truncateText(r.cardFont, BOARD_LIMITS.cardFont) : "",
    cardFontSize: num(r.cardFontSize, 12, 24, DEFAULT_DISPLAY.cardFontSize),
    cardFontWeight: FONT_WEIGHTS.includes(r.cardFontWeight as number)
      ? (r.cardFontWeight as number)
      : DEFAULT_DISPLAY.cardFontWeight,
    cardImageSize: num(r.cardImageSize, 32, 96, DEFAULT_DISPLAY.cardImageSize),
    labelFont: LABEL_FONTS.includes(r.labelFont as DisplaySettings["labelFont"])
      ? (r.labelFont as DisplaySettings["labelFont"])
      : DEFAULT_DISPLAY.labelFont,
    labelAnim: LABEL_ANIMS.includes(r.labelAnim as DisplaySettings["labelAnim"])
      ? (r.labelAnim as DisplaySettings["labelAnim"])
      : DEFAULT_DISPLAY.labelAnim,
    labelFlat: bool(r.labelFlat, DEFAULT_DISPLAY.labelFlat),
    rowGap: num(r.rowGap, 0, 32, DEFAULT_DISPLAY.rowGap),
  };
}

/* ---------- 榜单数据规范化（新旧结构统一到 v4） ---------- */
export function normalizeItem(raw: unknown): Item {
  if (!raw || typeof raw !== "object") return { id: uid(), name: "未命名" };
  const r = raw as Record<string, unknown>;
  const id = safeId(r.id) ?? uid();
  // v2/v3 旧结构必须先判：{type:"text",text} | {type:"image",src,name}。
  // 旧图片条目同样带 name，如果先走下面的现代分支，就会因为读不到 r.image 而把图片丢掉。
  if (r.type === "text") return { id, name: cleanText(r.text, BOARD_LIMITS.itemName, "未命名") };
  if (r.type === "image") {
    return {
      id,
      name: cleanText(r.name, BOARD_LIMITS.itemName, "图片"),
      image: isSafeImage(r.src) ? r.src : undefined,
    };
  }

  const image = isSafeImage(r.image) ? r.image : undefined;
  if (typeof r.name === "string" || image) {
    return {
      id,
      name: cleanText(r.name, BOARD_LIMITS.itemName, image ? "图片" : "未命名"),
      desc: typeof r.desc === "string" && r.desc.trim() ? truncateText(r.desc.trim(), BOARD_LIMITS.desc) : undefined,
      // 只放行内联图片：分享链接里的外链图片会让打开者去请求第三方地址（暴露 IP / 可用于追踪）
      image,
      // NaN / Infinity / 1e9 度都会让 transform 失效或把卡片甩出屏幕
      tilt:
        typeof r.tilt === "number" && Number.isFinite(r.tilt)
          ? clamp(Math.round(r.tilt), -BOARD_LIMITS.tilt, BOARD_LIMITS.tilt)
          : undefined,
    };
  }
  return { id, name: "未命名" };
}

function isSafeImage(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("data:image/") && v.length <= BOARD_LIMITS.imageChars;
}

export function normalizeBoard(raw: unknown): Board {
  const r = (raw ?? {}) as Record<string, unknown>;
  // tier / item / pool 共用一套 seenIds：store 里 moveItem 按 item id 跨档位和项目库查找，
  // 分享数据里的重复 id 会让两个条目被同时选中，所以重复的必须重新生成
  const seenIds = new Set<string>();
  // 档位内条目总数单独设预算：每档 200 条 × 30 档仍然可能把 6000 张卡片塞进 DOM
  let tierBudget = BOARD_LIMITS.totalItems;
  const normalizeItems = (value: unknown, max: number, budget?: { left: number }): Item[] => {
    const list = Array.isArray(value) ? value : [];
    const cap = Math.min(max, budget ? Math.max(0, budget.left) : max);
    const out = list
      .slice(0, cap)
      .map(normalizeItem)
      .map(item => ({ ...item, id: uniqueId(item.id, seenIds) }));
    if (budget) budget.left -= out.length;
    return out;
  };

  const tiers = (Array.isArray(r.tiers) ? r.tiers : []).slice(0, BOARD_LIMITS.tiers).map(rawTier => {
    const t = rawTier && typeof rawTier === "object" ? (rawTier as Record<string, unknown>) : {};
    // 先占档位 id，再处理条目：分享数据里 tier 与 item 可能撞 id，
    // 保持「先出现者保留原 id」的顺序，避免整份数据重新洗牌
    const id = uniqueId(safeId(t.id), seenIds);
    const budget = { left: tierBudget };
    const items = normalizeItems(t.items, BOARD_LIMITS.itemsPerTier, budget);
    tierBudget = budget.left;
    return {
      id,
      name: cleanText(t.name, BOARD_LIMITS.tierName, "档位"),
      color: safeTierColor(t.color),
      items,
    };
  });
  // 旧 theme 字符串 → 风格 + 日夜两维度
  const legacyMap: Record<string, [StyleId, Mode]> = {
    clean: ["classic", "day"],
    studio: ["classic", "night"],
    hype: ["hype", "day"],
    neon: ["neon", "night"],
  };
  const themeRaw = typeof r.theme === "string" ? r.theme : "";
  // 用 hasOwn 取值：theme="__proto__" 时直接下标会拿到 Object.prototype，解构会抛错
  const legacy = Object.hasOwn(legacyMap, themeRaw) ? legacyMap[themeRaw] : undefined;
  const [legacyStyle, legacyMode] = legacy ?? [];
  const style = (typeof r.style === "string" && Object.hasOwn(STYLE_NAMES, r.style)
    ? r.style
    : legacyStyle ?? DEFAULT_STYLE) as StyleId;
  const mode = (r.mode === "day" || r.mode === "night" ? r.mode : legacyMode ?? DEFAULT_MODE) as Mode;
  // 预设 id 只认已登记的预设（或「自定义」），避免分享数据塞进任意键
  const presetRaw = typeof r.presetId === "string" ? r.presetId : "";
  const presetId = presetRaw === "custom" || Object.hasOwn(TIER_PRESETS, presetRaw) ? presetRaw : "custom";
  const title = typeof r.title === "string" ? r.title : "";
  const subtitle = typeof r.subtitle === "string" ? r.subtitle : "";
  return {
    title: truncateText(title, BOARD_LIMITS.title),
    subtitle: subtitle ? truncateText(subtitle, BOARD_LIMITS.subtitle) : undefined,
    style,
    mode,
    presetId,
    tiers,
    pool: normalizeItems(r.pool, BOARD_LIMITS.pool),
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
function toBase64Url(bytes: Uint8Array): string {
  // 逐字节 `bin += fromCharCode(x)` 在 MB 级数据上会产生大量中间字符串，
  // 按 32KB 分块拼接，既快又不爆栈
  const CHUNK = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 分享数据：display 可选（旧链接没有），顶层字段与 Board 兼容，旧版本打开也不会崩 */
function sharePayload(b: Board, display?: DisplaySettings) {
  return display ? { ...b, display } : b;
}

export function encodeBoard(b: Board, display?: DisplaySettings): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(sharePayload(b, display))));
}

/**
 * 大榜单异步编码：每 8 个分块让出一次事件循环，避免一次 base64 把主线程按死。
 * 小于阈值时直接用同步版本（多一次 await 反而更慢）。
 */
export async function encodeBoardAsync(b: Board, display?: DisplaySettings): Promise<string> {
  const json = JSON.stringify(sharePayload(b, display));
  const bytes = new TextEncoder().encode(json);
  const CHUNK = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
    if (i % (CHUNK * 8) === 0) await new Promise(r => setTimeout(r, 0));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** JSON 文本的 UTF-8 字节数（不分配 Buffer，逐码元计算） */
function utf8Bytes(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else {
        // 孤立代理会被 JSON.stringify 转义成 \uXXXX（6 个 ASCII 字符）
        bytes += 6;
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) bytes += 6;
    else bytes += 3;
  }
  return bytes;
}

/** base64 字符数（去掉 padding，与 encodeBoard 的输出长度一致） */
function base64Chars(bytes: number): number {
  const full = Math.floor(bytes / 3);
  const rest = bytes % 3;
  return full * 4 + (rest === 0 ? 0 : rest === 1 ? 2 : 3);
}

/**
 * 分享链接体量下界（不序列化、不编码）：把所有字符串长度当作 UTF-8 字节数的最小值。
 * 用来在 JSON.stringify 之前就把「明显超硬上限」的数据挡掉。
 */
export function estimateShareChars(b: Board, display?: DisplaySettings): number {
  let chars = 0;
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      chars += v.length;
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
  };
  walk(sharePayload(b, display));
  return Math.floor(chars / 3) * 4;
}

/**
 * 分享 payload 的精确字符数（只做 JSON.stringify + 字节计数，**不做 base64**）。
 * 分享弹窗用它先判断是否超限，超限就根本不生成链接。
 */
export function measureShareChars(b: Board, display?: DisplaySettings): number {
  return base64Chars(utf8Bytes(JSON.stringify(sharePayload(b, display))));
}

export type SharedBoard = { board: Board; display: DisplaySettings | null };

/** 解码分享链接；旧链接没有 display，返回 null 表示「沿用打开者本机设置」 */
export function decodeSharedBoard(s: string): SharedBoard | null {
  // 先卡长度：几 MB 的 base64 解码 + JSON.parse 足以卡住主线程，超限直接当坏链接
  if (typeof s !== "string" || s.length > BOARD_LIMITS.decodeChars) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(s));
    const o = JSON.parse(json) as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || !Array.isArray(o.tiers)) return null;
    return {
      board: normalizeBoard(o),
      display: o.display == null ? null : normalizeDisplay(o.display),
    };
  } catch {
    return null;
  }
}

/** 只要榜单、不关心显示设置的调用方（测试 / 旧代码） */
export function decodeBoard(s: string): Board | null {
  return decodeSharedBoard(s)?.board ?? null;
}

/* ---------- 图片：读文件 + 重编码 ---------- */
/**
 * 读成 data URL。
 *
 * 关键点：FileReader 的三个回调都必须落到 Promise 上。之前只写了 onload，
 * 读失败（权限 / 文件被移走 / 磁盘错误）或用户取消时 Promise 永远 pending，
 * 批量处理的 `for await` 会卡在那张图上，后面的图片和整个批次都不会结束。
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => {
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
    };
    reader.onload = () => {
      const result = reader.result;
      cleanup();
      if (typeof result === "string" && result) resolve(result);
      else reject(new Error("图片读取结果为空"));
    };
    reader.onerror = () => {
      const err = reader.error;
      cleanup();
      reject(err instanceof Error ? err : new Error("图片读取失败"));
    };
    reader.onabort = () => {
      cleanup();
      reject(new Error("图片读取已取消"));
    };
    try {
      reader.readAsDataURL(file);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("图片读取失败"));
    }
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
    img.onload = () => {
      img.onload = null;
      img.onerror = null;
      resolve(img);
    };
    img.onerror = () => {
      img.onload = null;
      img.onerror = null;
      reject(new Error("图片解码失败"));
    };
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
 * 比例始终保留（w/h 同乘一个 k），非方形图不会被裁成方形。
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
