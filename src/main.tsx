import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { useBoard } from "./store/board";
import "./index.css";

// v2（vanilla 版）存档迁移：hangla.state.v2 → hangla.v3
(() => {
  if (localStorage.getItem("hangla.v3")) return;
  const legacy = localStorage.getItem("hangla.state.v2");
  if (!legacy) return;
  try {
    const s = JSON.parse(legacy);
    if (s && Array.isArray(s.tiers)) {
      useBoard.getState().importBoard({ ...s, presetId: s.presetId ?? "custom" });
      console.info("已从 v2 存档迁移榜单数据");
    }
  } catch {
    /* 忽略损坏的旧档 */
  }
})();

// 旧版分享链接（#d=xxx）兼容 → 新路由 #/r/xxx
if (location.hash.startsWith("#d=")) {
  location.hash = "/r/" + location.hash.slice(3);
}

// React 19 未捕获的渲染错误会清空 #root 且不显示覆盖层：
// 把错误落到独立于 React 树的浮层，保证白屏时能看到原因
window.addEventListener("error", e => {
  console.error(e.error || e.message);
  let box = document.getElementById("__err_box");
  if (!box) {
    box = document.createElement("pre");
    box.id = "__err_box";
    box.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;max-height:45vh;overflow:auto;z-index:9999;" +
      "background:#1b1e24;color:#ff9b9b;padding:12px 14px;border-radius:10px;" +
      "font:12px/1.6 Consolas,monospace;white-space:pre-wrap;margin:0";
    document.body.appendChild(box);
  }
  box.textContent = (e.error && (e.error.stack || e.error.message)) || e.message || String(e.error);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
