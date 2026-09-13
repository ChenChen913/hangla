/* ============================================================
 * dnd.js —— 拖拽分档/排序、图片文件拖入、Ctrl+V 粘贴
 * ============================================================ */
"use strict";

let selectedItemId = null;

function bindContainerDnD(container, tierId) {
  container.addEventListener("dragover", e => {
    if ([...e.dataTransfer.types].includes("text/plain")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      container.classList.add("drag-over");
    }
  });
  container.addEventListener("dragleave", e => {
    if (!container.contains(e.relatedTarget)) container.classList.remove("drag-over");
  });
  container.addEventListener("drop", e => {
    if (![...e.dataTransfer.types].includes("text/plain")) return;
    e.preventDefault();
    container.classList.remove("drag-over");
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    moveItem(id, tierId, insertIndex(container, e.clientX, e.clientY));
    render(); save();
  });
}

function insertIndex(container, x, y) {
  const chips = [...container.children].filter(el => el.classList && el.classList.contains("chip"));
  for (let i = 0; i < chips.length; i++) {
    const r = chips[i].getBoundingClientRect();
    if (y < r.top) return i;
    if (y <= r.bottom) return x < r.left + r.width / 2 ? i : i + 1;
  }
  return chips.length;
}

/* ---------- 图片进入素材池：文件选择 / 拖入 / 粘贴 ---------- */
window.addEventListener("dragover", e => {
  if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
});
window.addEventListener("drop", e => {
  if ([...e.dataTransfer.types].includes("Files")) {
    e.preventDefault();
    addImageFiles(e.dataTransfer.files);
  }
});
document.addEventListener("paste", e => {
  const files = [...(e.clipboardData?.items || [])]
    .filter(i => i.kind === "file" && i.type.startsWith("image/"))
    .map(i => i.getAsFile()).filter(Boolean);
  if (files.length) { e.preventDefault(); addImageFiles(files); }
});

function addImageFiles(files) {
  const imgs = [...files].filter(f => f.type.startsWith("image/"));
  if (!imgs.length) return;
  imgs.forEach(f => {
    const r = new FileReader();
    r.onload = () => downscaleIfNeeded(r.result).then(src => {
      state.pool.push({ id: uid(), type: "image", src, name: f.name });
      render(); save();
    });
    r.readAsDataURL(f);
  });
  toast("图片已加入素材池，拖进档位即可");
}

// 过大的图先压到 640px，避免撑爆 localStorage
function downscaleIfNeeded(dataURL) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const max = 640;
      if (Math.max(img.width, img.height) <= max) { res(dataURL); return; }
      const s = max / Math.max(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      try { res(c.toDataURL("image/png")); } catch (e) { res(dataURL); }
    };
    img.onerror = () => res(dataURL);
    img.src = dataURL;
  });
}
