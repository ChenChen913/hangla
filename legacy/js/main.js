/* ============================================================
 * main.js —— 启动与全局事件接线
 * ============================================================ */
"use strict";

const presetSelect = $("#presetSelect");
const themeSelect = $("#themeSelect");
const textInput = $("#textInput");
const imgInput = $("#imgInput");
const shareBar = $("#shareBar");

/* ---------- 评级模式（档位方案）切换 ---------- */
function buildPresetSelect() {
  presetSelect.innerHTML = "";
  Object.entries(TIER_PRESETS).forEach(([id, p]) => {
    const o = document.createElement("option");
    o.value = id; o.textContent = "评级 · " + p.name;
    presetSelect.appendChild(o);
  });
  const custom = document.createElement("option");
  custom.value = "custom"; custom.textContent = "评级 · 自定义";
  // “自定义”只有当前确实是自定义方案时可选（避免误切清空）
  custom.disabled = state.presetId !== "custom";
  presetSelect.appendChild(custom);
  presetSelect.value = TIER_PRESETS[state.presetId] ? state.presetId : "custom";
}

presetSelect.addEventListener("change", () => {
  const id = presetSelect.value;
  if (!TIER_PRESETS[id]) { presetSelect.value = state.presetId; return; }
  const hasItems = state.tiers.some(t => t.items.length);
  if (hasItems && !confirm(`切换到「${TIER_PRESETS[id].name}」会清空当前档位，条目移回素材池。继续？`)) {
    presetSelect.value = state.presetId;
    return;
  }
  state.tiers.forEach(t => state.pool.push(...t.items));
  state.tiers = presetTiers(id);
  state.presetId = id;
  render(); save();
  toast(`已切换为「${TIER_PRESETS[id].name}」模式`);
});

/* ---------- 视觉主题 ---------- */
function buildThemeSelect() {
  themeSelect.innerHTML = "";
  Object.entries(THEMES).forEach(([id, t]) => {
    const o = document.createElement("option");
    o.value = id; o.textContent = "风格 · " + t.name;
    if (t.disabled) o.disabled = true;
    themeSelect.appendChild(o);
  });
  themeSelect.value = state.theme;
}
themeSelect.addEventListener("change", () => { state.theme = themeSelect.value; applyTheme(state.theme); save(); });

/* ---------- 条目添加 ---------- */
textInput.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const v = textInput.value.trim();
  if (!v) return;
  state.pool.push({ id: uid(), type: "text", text: v });
  textInput.value = "";
  render(); save();
});
imgInput.addEventListener("change", () => { addImageFiles(imgInput.files); imgInput.value = ""; });

/* ---------- 档位增删 ---------- */
$("#addTierBtn").addEventListener("click", () => {
  const palette = ["#FF9F43", "#2EC4B6", "#5B8DEF", "#C77DFF", "#FF5D5D", "#FFD166", "#8D99AE"];
  state.tiers.push({ id: uid(), name: "新档位", color: palette[state.tiers.length % palette.length], items: [] });
  markCustom(); render(); save();
});

/* ---------- 标题 ---------- */
titleInput.addEventListener("input", () => { state.title = titleInput.value; save(); });

/* ---------- 展示 / 分享 / 重置 / 导出 ---------- */
$("#presentBtn").addEventListener("click", () => document.body.classList.add("presenting"));
$("#presentExit").addEventListener("click", () => document.body.classList.remove("presenting"));

$("#shareBtn").addEventListener("click", async () => {
  const link = location.href.split("#")[0] + HASH_PREFIX + encodeState(state);
  if (link.length > 80000) toast("提示：榜单含较多图片，链接可能过长，建议改用导出 PNG");
  const ok = await copyText(link);
  toast(ok ? "分享链接已复制，发给朋友打开即可查看" : "复制失败，链接已打印到控制台（F12 查看）");
  if (!ok) console.log("分享链接：", link);
});

$("#copyEditBtn").addEventListener("click", () => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    history.replaceState(null, "", location.pathname + location.search);
    location.reload();
  } catch (e) { toast("复制失败：内容过大"); }
});

$("#resetBtn").addEventListener("click", () => {
  if (!confirm("恢复为示例榜单？当前内容将丢失。")) return;
  try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_KEY_V1); } catch (e) { /* 忽略 */ }
  location.hash = "";
  location.reload();
});

$("#exportBtn").addEventListener("click", async () => {
  const btn = $("#exportBtn");
  btn.disabled = true;
  toast("正在生成图片…");
  try { await exportPNG(state, 2); toast("已导出 PNG，去下载目录看看"); }
  catch (e) { console.error(e); toast("导出失败：" + e.message); }
  finally { btn.disabled = false; }
});

/* ---------- 全局键盘 ---------- */
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (selectedItemId) setSelected(null);
  else if (document.body.classList.contains("presenting") && !readOnly)
    document.body.classList.remove("presenting");
});

/* ---------- 已打开页面里粘贴分享链接（hash 变化不重载） ---------- */
window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith(HASH_PREFIX)) return;
  try {
    const s = decodeState(location.hash.slice(HASH_PREFIX.length));
    if (!s || !Array.isArray(s.tiers)) return;
    state = normalize(s);
    readOnly = true;
    selectedItemId = null;
    applyTheme(state.theme);
    buildThemeSelect();
    buildPresetSelect();
    render();
    document.body.classList.add("presenting");
    shareBar.classList.remove("hidden");
    toast("已加载分享榜单（只读）");
  } catch (e) { console.warn("分享链接解析失败", e); }
});

/* ---------- 启动 ---------- */
window.addEventListener("error", e => {
  console.error(e.error || e.message);
  toast("出了一点小问题：" + (e.message || "未知错误") + "（已打印到控制台）");
});

try {
  state = loadInitialState();
  applyTheme(state.theme);
  buildThemeSelect();
  buildPresetSelect();
  injectIcons();
  render();
  if (readOnly) {
    document.body.classList.add("presenting");
    shareBar.classList.remove("hidden");
  }
} catch (e) {
  console.error(e);
  toast("启动失败：" + e.message + "，可点击浏览器刷新重试");
}
