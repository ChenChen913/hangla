/* ============================================================
 * themes.js —— 视觉主题注册表（页面配色 + 导出画布配色）
 * 新增风格：登记一个条目并去掉 disabled，CSS 变量会自动注入。
 * ROADMAP.md 中规划的风格请逐一实现。
 * ============================================================ */
"use strict";

const THEMES = {
  studio: {
    name: "曜黑工作台",
    vars: {
      bg: "#0e1116", glow: "rgba(255,199,89,.07)",
      panel: "#151a21", panel2: "#1b2129", border: "#262d38",
      text: "#e9ecf1", muted: "#8f99a8",
      accent: "#ff7a45", accent2: "#ffb347", danger: "#ff5d5d",
      chipBg: "#1d242e", chipBorder: "#2d3542", chipText: "#e9ecf1",
      wellBlend: "#151a21",
    },
    export: {
      pageBg: "#0e1116", panel: "#151a21",
      chipBg: "#1d242e", chipBorder: "#2d3542", chipText: "#e9ecf1",
      text: "#e9ecf1", muted: "#8f99a8",
      badgeFrom: "#ffb347", badgeTo: "#ff7a45", badgeText: "#241304",
    },
  },
  clean: { name: "简洁亮色（开发中）", disabled: true },
  hype:  { name: "抽象梗风（开发中）", disabled: true },
  neon:  { name: "赛博霓虹（开发中）", disabled: true },
};

function applyTheme(id) {
  const t = THEMES[id] || THEMES.studio;
  document.documentElement.dataset.theme = id;
  const r = document.documentElement.style;
  Object.entries(t.vars || {}).forEach(([k, v]) => {
    r.setProperty("--" + k.replace(/[A-Z]/g, m => "-" + m.toLowerCase()), v);
  });
}
