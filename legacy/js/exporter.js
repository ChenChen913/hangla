/* ============================================================
 * exporter.js —— 把 state 画到 canvas，导出高清 PNG
 * 配色跟随当前视觉主题（THEMES[theme].export）
 * ============================================================ */
"use strict";

const EXPORT_FONT = '"Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';

const _imgCache = new Map();
function loadImage(src) {
  if (_imgCache.has(src)) return _imgCache.get(src);
  const p = new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("图片加载失败"));
    img.src = src;
  });
  _imgCache.set(src, p);
  return p;
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + "…").width > maxW) text = text.slice(0, -1);
  return text + "…";
}

// 四角独立圆角路径 radii = [tl, tr, br, bl]
function rrPath(ctx, x, y, w, h, radii) {
  const [tl, tr, br, bl] = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y); ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h); ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl); ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

async function exportPNG(state, scale = 2) {
  const pal = (THEMES[state.theme] || THEMES.studio).export;
  const W = 1200, M = 40, labelW = 170, pad = 12, chipGap = 8, rowGap = 10;
  const textChipH = 44, imgChipH = 84, maxChipW = 300;
  const innerW = W - M * 2 - labelW - pad * 2;

  // 排版：每个档位内的条目按行摆放
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = "15px " + EXPORT_FONT;
  const tierLayouts = state.tiers.map(tier => {
    const lines = [[]];
    for (const it of tier.items) {
      const isImg = it.type === "image";
      const w = isImg ? imgChipH : Math.min(maxChipW, measure.measureText(it.text || "").width + 26);
      const h = isImg ? imgChipH : textChipH;
      const last = lines[lines.length - 1];
      const usedW = last.reduce((a, c) => a + c.w + chipGap, -chipGap);
      if (last.length && usedW + w > innerW) lines.push([]);
      lines[lines.length - 1].push({ it, w, h });
    }
    const lineH = Math.max(0, ...lines.map(l => Math.max(0, ...l.map(c => c.h))));
    return { tier, lines, lineH };
  });

  const headerH = state.title ? 104 : 24;
  const footerH = 52;
  const bodyH = tierLayouts.reduce((a, l) => a + Math.max(l.lineH, 56) + pad * 2 + rowGap, 0);
  const H = headerH + bodyH + footerH;

  const c = document.createElement("canvas");
  c.width = W * scale; c.height = H * scale;
  const ctx = c.getContext("2d");
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = pal.pageBg;
  ctx.fillRect(0, 0, W, H);

  // 标题 + 徽章（徽章展示当前评级模式名）
  let y = M;
  if (state.title || true) {
    const badge = (TIER_PRESETS[state.presetId] || {}).name || "TIER LIST";
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = "bold 22px " + EXPORT_FONT;
    const bw = ctx.measureText(badge).width + 30;
    if (state.title) {
      ctx.font = "bold 38px " + EXPORT_FONT;
      ctx.fillStyle = pal.text;
      ctx.fillText(ellipsize(ctx, state.title, W - M * 2 - bw - 16), M, y + 42);
    }
    const grad = ctx.createLinearGradient(W - M - bw, 0, W - M, 0);
    grad.addColorStop(0, pal.badgeFrom); grad.addColorStop(1, pal.badgeTo);
    rrPath(ctx, W - M - bw, y + 2, bw, 40, 20);
    ctx.fillStyle = grad; ctx.fill();
    ctx.font = "bold 22px " + EXPORT_FONT;
    ctx.fillStyle = pal.badgeText;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(badge, W - M - bw / 2, y + 23);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    y += headerH - 24;
  }

  // 档位行
  for (const { tier, lines, lineH } of tierLayouts) {
    const rowH = Math.max(lineH, 56) + pad * 2;
    // 条目底
    ctx.fillStyle = mixColors(tier.color, pal.panel, 0.10);
    rrPath(ctx, M, y, W - M * 2, rowH, 14); ctx.fill();
    // 标签（上亮下深的竖向渐变，只圆左侧两角）
    const lg = ctx.createLinearGradient(0, y, 0, y + rowH);
    lg.addColorStop(0, mixColors(tier.color, "#ffffff", 0.14));
    lg.addColorStop(1, tier.color);
    ctx.fillStyle = lg;
    rrPath(ctx, M, y, labelW, rowH, [14, 0, 0, 14]); ctx.fill();
    // 标签文字
    let fs = 30;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    do { ctx.font = "bold " + fs + "px " + EXPORT_FONT; fs -= 2; }
    while (ctx.measureText(tier.name).width > labelW - 24 && fs > 12);
    ctx.fillStyle = labelTextColor(tier.color);
    ctx.fillText(tier.name, M + labelW / 2, y + rowH / 2);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";

    // 条目
    let ly = y + pad;
    for (const line of lines) {
      const lh = Math.max(44, ...line.map(ch => ch.h));
      let lx = M + labelW + pad;
      for (const ch of line) {
        if (ch.it.type === "image") {
          try {
            const img = await loadImage(ch.it.src);
            ctx.save();
            rrPath(ctx, lx, ly, imgChipH, imgChipH, 10); ctx.clip();
            const s = Math.max(imgChipH / img.width, imgChipH / img.height);
            const dw = img.width * s, dh = img.height * s;
            ctx.drawImage(img, lx + (imgChipH - dw) / 2, ly + (imgChipH - dh) / 2, dw, dh);
            ctx.restore();
          } catch (e) { /* 单张图失败不阻断导出 */ }
        } else {
          ctx.fillStyle = pal.chipBg;
          rrPath(ctx, lx, ly, ch.w, textChipH, 10); ctx.fill();
          ctx.strokeStyle = pal.chipBorder; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = pal.chipText;
          ctx.font = "15px " + EXPORT_FONT;
          ctx.textBaseline = "middle";
          ctx.fillText(ellipsize(ctx, ch.it.text || "", ch.w - 24), lx + 13, ly + textChipH / 2 + 1);
          ctx.textBaseline = "alphabetic";
        }
        lx += ch.w + chipGap;
      }
      ly += lh + chipGap;
    }
    y += rowH + rowGap;
  }

  // 页脚
  ctx.fillStyle = pal.muted;
  ctx.font = "16px " + EXPORT_FONT;
  ctx.textAlign = "right";
  ctx.fillText(`夯拉榜 · ${new Date().toLocaleDateString("zh-CN")}`, W - M, H - 20);
  ctx.textAlign = "left";

  const safeName = (state.title || "从夯到拉").replace(/[\\/:*?"<>|]/g, "").trim() || "从夯到拉";
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = safeName + "-排行榜.png";
  a.click();
}
