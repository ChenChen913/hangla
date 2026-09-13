/**
 * 主题系统：风格（style）× 日夜（mode）两个独立维度。
 * 每种风格都有对应的白天和黑夜两套配色；
 * 顶栏日夜按钮只切 mode（当前风格内明暗互换），风格下拉只切 style。
 */
export type StyleId = "classic" | "tier" | "hype" | "neon";
export type Mode = "day" | "night";

export type ThemeDef = {
  style: StyleId;
  mode: Mode;
  name: string;
  scheme: "light" | "dark";
  vars: Record<string, string>;
  export: {
    pageBg: string; panel: string; chipBg: string; chipBorder: string; chipText: string;
    text: string; muted: string; badgeFrom: string; badgeTo: string; badgeText: string;
  };
};

export const STYLE_NAMES: Record<StyleId, string> = {
  classic: "现代",
  tier: "经典梗图",
  hype: "抽象梗风",
  neon: "赛博霓虹",
};

export const MODE_NAMES: Record<Mode, string> = {
  day: "白天",
  night: "黑夜",
};

export const DEFAULT_STYLE: StyleId = "classic";
export const DEFAULT_MODE: Mode = "day";

export function themeId(style: StyleId, mode: Mode) {
  return `${style}-${mode}`;
}

export const THEMES: Record<string, ThemeDef> = {
  /* ---------- 经典梗图（基础风格：彩色色块 + 黑色大字 + 横向排行榜） ---------- */
  "tier-day": {
    style: "tier", mode: "day", name: "经典梗图 · 白天", scheme: "light",
    vars: {
      bg: "#f2f3f5", glow: "rgba(255,82,34,.08)",
      panel: "#ffffff", panel2: "#eceef1", border: "#d9dce2",
      text: "#1a1c20", muted: "#737b88",
      accent: "#ff5222", accent2: "#ffb020", danger: "#e5484d",
      chip: "#ffffff", chipBorder: "#e0e3e9", chipText: "#1a1c20",
      wellBlend: "#ffffff",
    },
    export: {
      pageBg: "#f2f3f5", panel: "#ffffff",
      chipBg: "#ffffff", chipBorder: "#e0e3e9", chipText: "#1a1c20",
      text: "#1a1c20", muted: "#7d8592",
      badgeFrom: "#ffb020", badgeTo: "#ff5222", badgeText: "#ffffff",
    },
  },
  "tier-night": {
    style: "tier", mode: "night", name: "经典梗图 · 黑夜", scheme: "dark",
    vars: {
      bg: "#101216", glow: "rgba(255,82,34,.09)",
      panel: "#171a20", panel2: "#1e222a", border: "#2a2e37",
      text: "#e8eaee", muted: "#8a91a0",
      accent: "#ff5c5c", accent2: "#ffb020", danger: "#ff5d5d",
      chip: "#1c2027", chipBorder: "#2c313b", chipText: "#e8eaee",
      wellBlend: "#171a20",
    },
    export: {
      pageBg: "#101216", panel: "#171a20",
      chipBg: "#1c2027", chipBorder: "#2c313b", chipText: "#e8eaee",
      text: "#e8eaee", muted: "#8a91a0",
      badgeFrom: "#ffb020", badgeTo: "#ff5c5c", badgeText: "#101216",
    },
  },

  /* ---------- 现代 ---------- */
  "classic-day": {
    style: "classic", mode: "day", name: "经典 · 白天", scheme: "light",
    vars: {
      bg: "#f6f7f9", glow: "rgba(255,106,61,.09)",
      panel: "#ffffff", panel2: "#eef0f4", border: "#e4e7ed",
      text: "#1c2026", muted: "#7b8494",
      accent: "#ff6a3d", accent2: "#ffa25e", danger: "#e5484d",
      chip: "#ffffff", chipBorder: "#e2e5eb", chipText: "#1c2026",
      wellBlend: "#ffffff",
    },
    export: {
      pageBg: "#f6f7f9", panel: "#ffffff",
      chipBg: "#ffffff", chipBorder: "#e2e5eb", chipText: "#1c2026",
      text: "#1c2026", muted: "#8a92a0",
      badgeFrom: "#ffa25e", badgeTo: "#ff6a3d", badgeText: "#ffffff",
    },
  },
  "classic-night": {
    style: "classic", mode: "night", name: "经典 · 黑夜", scheme: "dark",
    vars: {
      bg: "#0e1116", glow: "rgba(255,199,89,.07)",
      panel: "#151a21", panel2: "#1b2129", border: "#262d38",
      text: "#e9ecf1", muted: "#8f99a8",
      accent: "#ff7a45", accent2: "#ffb347", danger: "#ff5d5d",
      chip: "#1d242e", chipBorder: "#2d3542", chipText: "#e9ecf1",
      wellBlend: "#151a21",
    },
    export: {
      pageBg: "#0e1116", panel: "#151a21",
      chipBg: "#1d242e", chipBorder: "#2d3542", chipText: "#e9ecf1",
      text: "#e9ecf1", muted: "#8f99a8",
      badgeFrom: "#ffb347", badgeTo: "#ff7a45", badgeText: "#241304",
    },
  },

  /* ---------- 抽象梗风 ---------- */
  "hype-day": {
    style: "hype", mode: "day", name: "抽象梗风 · 白天", scheme: "light",
    vars: {
      bg: "#fff8ea", glow: "rgba(255,77,109,.10)",
      panel: "#fffdf6", panel2: "#fff0cf", border: "#efddb0",
      text: "#33241a", muted: "#a08762",
      accent: "#ff4d6d", accent2: "#ffc93c", danger: "#e5484d",
      chip: "#fffcef", chipBorder: "#efdcae", chipText: "#33241a",
      wellBlend: "#fffdf6",
    },
    export: {
      pageBg: "#fff8ea", panel: "#fffdf6",
      chipBg: "#fffcef", chipBorder: "#efdcae", chipText: "#33241a",
      text: "#33241a", muted: "#a08762",
      badgeFrom: "#ffc93c", badgeTo: "#ff4d6d", badgeText: "#ffffff",
    },
  },
  "hype-night": {
    style: "hype", mode: "night", name: "抽象梗风 · 黑夜", scheme: "dark",
    vars: {
      bg: "#221812", glow: "rgba(255,77,109,.12)",
      panel: "#2c1f17", panel2: "#38271c", border: "#4d3728",
      text: "#f7ead9", muted: "#b39b7d",
      accent: "#ff4d6d", accent2: "#ffc93c", danger: "#ff5d5d",
      chip: "#3a291d", chipBorder: "#54402d", chipText: "#f7ead9",
      wellBlend: "#2c1f17",
    },
    export: {
      pageBg: "#221812", panel: "#2c1f17",
      chipBg: "#3a291d", chipBorder: "#54402d", chipText: "#f7ead9",
      text: "#f7ead9", muted: "#b39b7d",
      badgeFrom: "#ffc93c", badgeTo: "#ff4d6d", badgeText: "#ffffff",
    },
  },

  /* ---------- 赛博霓虹 ---------- */
  "neon-night": {
    style: "neon", mode: "night", name: "赛博霓虹 · 黑夜", scheme: "dark",
    vars: {
      bg: "#05070f", glow: "rgba(0,229,255,.10)",
      panel: "#0b0f1c", panel2: "#101830", border: "#1d2b4f",
      text: "#d7e7ff", muted: "#5f7ba6",
      accent: "#00e5ff", accent2: "#ff2ea6", danger: "#ff3860",
      chip: "#0e1730", chipBorder: "#1e3a66", chipText: "#d7e7ff",
      wellBlend: "#0b0f1c",
    },
    export: {
      pageBg: "#05070f", panel: "#0b0f1c",
      chipBg: "#0e1730", chipBorder: "#1e3a66", chipText: "#d7e7ff",
      text: "#d7e7ff", muted: "#5f7ba6",
      badgeFrom: "#00e5ff", badgeTo: "#ff2ea6", badgeText: "#05070f",
    },
  },
  "neon-day": {
    style: "neon", mode: "day", name: "赛博霓虹 · 白天", scheme: "light",
    vars: {
      bg: "#eef4f8", glow: "rgba(0,146,184,.10)",
      panel: "#ffffff", panel2: "#e3edf3", border: "#d3e0ea",
      text: "#10222e", muted: "#63829b",
      accent: "#0092b8", accent2: "#d61f7f", danger: "#e5484d",
      chip: "#ffffff", chipBorder: "#d8e4ed", chipText: "#10222e",
      wellBlend: "#ffffff",
    },
    export: {
      pageBg: "#eef4f8", panel: "#ffffff",
      chipBg: "#ffffff", chipBorder: "#d8e4ed", chipText: "#10222e",
      text: "#10222e", muted: "#6b8399",
      badgeFrom: "#0092b8", badgeTo: "#d61f7f", badgeText: "#ffffff",
    },
  },
};

export function applyTheme(style: StyleId, mode: Mode) {
  const t = THEMES[themeId(style, mode)] ?? THEMES[themeId(DEFAULT_STYLE, DEFAULT_MODE)];
  document.documentElement.dataset.theme = themeId(style, mode);
  // color-scheme 让原生控件（select 下拉、input placeholder、滚动条、autofill）跟随主题，
  // 否则暗色主题下这些控件仍是白底/灰字，出现"文字看不清、一团白"的问题
  document.documentElement.style.colorScheme = t.scheme;
  const r = document.documentElement.style;
  Object.entries(t.vars).forEach(([k, v]) =>
    r.setProperty("--c-" + k.replace(/[A-Z]/g, m => "-" + m.toLowerCase()), v),
  );
}

export function exportPalette(style: StyleId, mode: Mode) {
  // 与 applyTheme 一样留兜底：数据万一带着非法 style/mode，也不要直接抛错白屏
  const t = THEMES[themeId(style, mode)] ?? THEMES[themeId(DEFAULT_STYLE, DEFAULT_MODE)];
  return t.export;
}
