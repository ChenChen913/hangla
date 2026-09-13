/* ============================================================
 * state.js —— 数据模型 / 存档（localStorage + v1 迁移）/ 分享编解码
 * 模型：{ version, theme, presetId, title, tiers:[{id,name,color,items:[]}], pool:[] }
 * 条目：{ id, type:"text", text } | { id, type:"image", src(dataURL), name? }
 * ============================================================ */
"use strict";

const LS_KEY = "hangla.state.v2";
const LS_KEY_V1 = "hangla.state.v1";
const HASH_PREFIX = "#d=";

let state = null;
let readOnly = false;

function freshState() {
  return {
    version: 2,
    theme: "studio",
    presetId: "hangla",
    title: "打工人的一天 · 从夯到拉（示例）",
    tiers: presetTiers("hangla"),
    pool: [],
  };
}

function demoState() {
  const s = freshState();
  const put = (tierIdx, texts) => texts.forEach(t => s.tiers[tierIdx].items.push({ id: uid(), type: "text", text: t }));
  put(0, ["下班瞬间", "工资到账"]);
  put(1, ["午睡半小时"]);
  put(2, ["带薪摸鱼"]);
  put(3, ["周一早会"]);
  put(4, ["加班到十点", "周报还没写"]);
  return s;
}

function normalize(s) {
  const themeOk = !!THEMES[s.theme] && !THEMES[s.theme].disabled;
  return {
    version: 2,
    theme: themeOk ? s.theme : "studio",
    presetId: s.presetId || "custom",
    title: s.title || "",
    tiers: s.tiers,
    pool: Array.isArray(s.pool) ? s.pool : [],
  };
}

function loadInitialState() {
  // 1) 分享链接优先（只读）
  if (location.hash.startsWith(HASH_PREFIX)) {
    try {
      const s = decodeState(location.hash.slice(HASH_PREFIX.length));
      if (s && Array.isArray(s.tiers)) { readOnly = true; return normalize(s); }
    } catch (e) { console.warn("分享链接解析失败", e); }
  }
  // 2) 本机存档（v2）
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.tiers)) return normalize(s);
    }
  } catch (e) { /* 存档损坏则忽略 */ }
  // 3) v1 旧档迁移
  try {
    const old = localStorage.getItem(LS_KEY_V1);
    if (old) {
      const s = JSON.parse(old);
      if (s && Array.isArray(s.tiers)) return normalize({ ...s, presetId: "custom" });
    }
  } catch (e) { /* 忽略 */ }
  // 4) 全新示例
  return demoState();
}

let saveTimer = null;
function save() {
  if (readOnly) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch (err) { toast("本地保存失败：内容过大（多为图片），建议少放图或直接导出 PNG"); }
  }, 300);
}

/* ---------- 条目操作 ---------- */
function findItemLoc(id) {
  const pi = state.pool.findIndex(i => i.id === id);
  if (pi >= 0) return { list: state.pool, index: pi };
  for (const t of state.tiers) {
    const i = t.items.findIndex(x => x.id === id);
    if (i >= 0) return { list: t.items, index: i };
  }
  return null;
}

function moveItem(id, tierId, index) {
  const loc = findItemLoc(id);
  if (!loc) return;
  const targetList = tierId ? (state.tiers.find(t => t.id === tierId) || {}).items : state.pool;
  if (!targetList) return;
  if (loc.list === targetList && loc.index < index) index--;
  const [item] = loc.list.splice(loc.index, 1);
  targetList.splice(clamp(index, 0, targetList.length), 0, item);
}

function removeItem(id) {
  const loc = findItemLoc(id);
  if (loc) loc.list.splice(loc.index, 1);
}

// 档位结构被手工修改后，当前方案视为“自定义”
function markCustom() {
  if (state.presetId !== "custom") {
    state.presetId = "custom";
    buildPresetSelect();
  }
}

/* ---------- 分享链接编解码（UTF-8 安全的 Base64URL） ---------- */
function encodeState(s) {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeState(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
}
