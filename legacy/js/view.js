/* ============================================================
 * view.js —— 渲染：档位行 / 条目 / 素材池 / 选中态
 * 注意：档位工具条为 2×2 网格，固定收在条目区右上角行内，
 *       不会溢出行外（修复旧版“新档位删不掉”的几何问题）。
 * ============================================================ */
"use strict";

const titleInput = $("#titleInput");
const metaLine = $("#metaLine");
const tiersEl = $("#tiers");
const poolItems = $("#poolItems");
const poolCount = $("#poolCount");

function render() {
  titleInput.value = state.title || "";
  tiersEl.innerHTML = "";
  state.tiers.forEach(tier => tiersEl.appendChild(renderTier(tier)));
  poolItems.innerHTML = "";
  state.pool.forEach(it => poolItems.appendChild(renderChip(it)));
  updateMeta();
}

function updateMeta() {
  const n = state.tiers.reduce((a, t) => a + t.items.length, 0);
  metaLine.textContent = `${state.tiers.length} 档 · ${n} 个条目 · 素材池 ${state.pool.length} 项 · 自动保存已开启`;
  poolCount.textContent = state.pool.length ? `(${state.pool.length})` : "";
}

function renderTier(tier) {
  const row = document.createElement("div");
  row.className = "tier";
  row.style.setProperty("--tier-color", tier.color);

  // 左侧标签（可直接改名）
  const label = document.createElement("div");
  label.className = "tier-label";
  const nameInput = document.createElement("input");
  nameInput.className = "tier-label-input";
  nameInput.value = tier.name;
  nameInput.style.color = labelTextColor(tier.color);
  nameInput.addEventListener("input", () => { tier.name = nameInput.value; markCustom(); save(); });
  nameInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); nameInput.blur(); } });
  label.appendChild(nameInput);

  // 条目区
  const items = document.createElement("div");
  items.className = "well";
  items.dataset.tier = tier.id;
  tier.items.forEach(it => items.appendChild(renderChip(it)));
  bindContainerDnD(items, tier.id);
  items.addEventListener("click", e => {
    if (e.target === items && selectedItemId) {
      moveItem(selectedItemId, tier.id, Infinity);
      setSelected(null); render(); save();
    }
  });

  // 工具条（2×2：改色 / 上移 / 下移 / 删除）
  const tools = document.createElement("div");
  tools.className = "tier-tools";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = tier.color;
  colorInput.title = "档位颜色";
  colorInput.addEventListener("input", () => {
    tier.color = colorInput.value;
    row.style.setProperty("--tier-color", tier.color);
    nameInput.style.color = labelTextColor(tier.color);
    markCustom(); save();
  });

  const mkBtn = (cls, title, icon, fn) => {
    const b = document.createElement("button");
    b.className = cls; b.title = title; b.dataset.icon = icon;
    b.addEventListener("click", fn);
    return b;
  };
  const idx = () => state.tiers.indexOf(tier);
  const upBtn = mkBtn("tier-up", "上移档位", "up", () => {
    const i = idx();
    if (i > 0) {
      [state.tiers[i - 1], state.tiers[i]] = [state.tiers[i], state.tiers[i - 1]];
      markCustom(); render(); save();
    }
  });
  const downBtn = mkBtn("tier-down", "下移档位", "down", () => {
    const i = idx();
    if (i < state.tiers.length - 1) {
      [state.tiers[i + 1], state.tiers[i]] = [state.tiers[i], state.tiers[i + 1]];
      markCustom(); render(); save();
    }
  });
  const delBtn = mkBtn("tier-del", "删除档位（条目移回素材池）", "trash", () => {
    const i = idx();
    if (i < 0) return;
    state.tiers.splice(i, 1);
    state.pool.push(...tier.items);
    markCustom(); render(); save();
    toast("档位已删除，条目移回素材池");
  });

  tools.append(colorInput, upBtn, downBtn, delBtn);
  injectIcons(tools);
  row.append(label, items, tools);
  return row;
}

function renderChip(item) {
  const chip = document.createElement("div");
  chip.className = "chip" + (item.type === "image" ? " img-chip" : "");
  chip.draggable = true;
  chip.dataset.id = item.id;
  if (item.type === "image") {
    const img = new Image();
    img.src = item.src;
    img.draggable = false;
    chip.appendChild(img);
    chip.title = item.name || "图片条目";
  } else {
    const span = document.createElement("span");
    span.className = "chip-text";
    span.textContent = item.text;
    chip.appendChild(span);
  }
  const x = document.createElement("button");
  x.className = "chip-x"; x.textContent = "×"; x.title = "删除";
  x.addEventListener("click", e => {
    e.stopPropagation();
    removeItem(item.id); render(); save(); toast("已删除");
  });
  chip.appendChild(x);

  chip.addEventListener("click", e => {
    if (e.target === x) return;
    setSelected(selectedItemId === item.id ? null : item.id);
  });
  chip.addEventListener("dblclick", () => { removeItem(item.id); render(); save(); toast("已删除"); });
  chip.addEventListener("dragstart", e => {
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
    chip.classList.add("dragging");
  });
  chip.addEventListener("dragend", () => { chip.classList.remove("dragging"); clearDropMarks(); });
  return chip;
}

function setSelected(id) {
  selectedItemId = id;
  document.querySelectorAll(".chip").forEach(c => c.classList.toggle("selected", c.dataset.id === id));
}

function clearDropMarks() {
  document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
}
