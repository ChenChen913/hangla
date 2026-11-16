// scripts/mobile-check.mjs —— 移动端布局 / 触摸目标 / 触屏交互体检（CDP，零依赖）
//
// 逐宽度、逐页面测量：横向溢出、越界元素、可点区域尺寸、顶栏与底栏高度、
// pointer/hover 媒体查询是否按触屏生效；再跑一遍真实触摸交互。
//
// **默认就是失败门禁**：关键检查不通过 → 退出码 1；脚本异常 / Chrome 起不来 /
// 页面没加载出来 → 退出码非 0。`--report-only` 才是"只报告不阻断"（本地排查用）。
//
// 触控目标标准（与 AGENTS.md、移动端报告保持同一套）：
// - <768 手机布局：主要操作 ≥44px；次要操作可标记 data-touch-compact，最低 40px；
//   任何可点区域 <40px 直接失败。
// - ≥768 触屏（横屏 / 平板）沿用桌面工具条密度：最低 32px，<44px 只记为提示。
//
// 用法：npm run build:web && node scripts/mobile-check.mjs [--report-only] [--layout-only]
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, rmSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist-web");
const PORT = 4181;
const DEBUG_PORT = 9341;
/** 默认阻断；--report-only 只打印问题、不改退出码 */
const ASSERT = !process.argv.includes("--report-only");
/** 统一触控尺寸标准（脚本、实现、报告三处必须一致） */
const TOUCH = {
  primary: 44,
  compact: 40,
  wideFloor: 32,
};
/** SHOTS=目录 时把每个宽度/页面的截图落盘，供人工查看 */
const SHOT_DIR = process.env.SHOTS || "";
/** 默认跑触屏交互；--layout-only 只做布局量测（更快） */
const INTERACT = !process.argv.includes("--layout-only");
/** 顶层弹窗（嵌套确认框时，最后一个是盖在最上面的） */
const TOP_DIALOG = `[...document.querySelectorAll(".dlg-content")].pop()`;

const WIDTHS = [
  { w: 320, h: 568, name: "320 · 窄手机" },
  { w: 360, h: 740, name: "360 · Android" },
  { w: 375, h: 812, name: "375 · iPhone" },
  { w: 390, h: 844, name: "390 · 常见" },
  { w: 430, h: 932, name: "430 · 大屏" },
  { w: 640, h: 360, name: "640 · 横屏", mobile: true },
  { w: 768, h: 1024, name: "768 · 平板" },
  { w: 844, h: 390, name: "844 · 横屏", mobile: true },
  { w: 1024, h: 768, name: "1024 · 桌面" },
];
const PAGES = [
  { hash: "#/", name: "编辑器", ready: `!!document.querySelector('textarea[placeholder^="点此给榜单"]')` },
  { hash: "#/templates", name: "模板库", ready: `document.body.innerText.includes("使用该模式")` },
  { hash: "#/mine", name: "我的排名", ready: `document.body.innerText.includes("保存快照")` },
  { hash: "#/preview", name: "只读预览", ready: `document.body.innerText.includes("只读")` },
];

const CHROME =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find(p => existsSync(p));

if (!CHROME) {
  console.error("✗ 找不到 Chrome，设置 CHROME_PATH");
  process.exit(2);
}
if (!existsSync(path.join(DIST, "index.html"))) {
  console.error("✗ 缺少 dist-web/index.html，先 npm run build:web");
  process.exit(2);
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png" };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = path.join(DIST, p === "/" ? "index.html" : p);
  try {
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(200, { "content-type": MIME[".html"] });
    res.end(readFileSync(path.join(DIST, "index.html")));
  }
});
await new Promise(r => server.listen(PORT, "127.0.0.1", r));

const profile = mkdtempSync(path.join(tmpdir(), "hangla-m-"));
const downloads = mkdtempSync(path.join(tmpdir(), "hangla-m-dl-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 100; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" });
    target = await res.json();
    break;
  } catch {
    await sleep(150);
  }
}
if (!target?.webSocketDebuggerUrl) {
  console.error("✗ Chrome 调试端口无响应");
  chrome.kill();
  server.close();
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let seq = 0;
const pending = new Map();
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (!msg.id) return;
  const job = pending.get(msg.id);
  if (!job) return;
  pending.delete(msg.id);
  if (msg.error) job.reject(new Error(msg.error.message));
  else job.resolve(msg.result);
};
const send = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
async function evaluate(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}
async function waitFor(expr, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      if (await evaluate(expr)) return true;
    } catch {
      /* loading */
    }
    await sleep(100);
  }
  return false;
}

const PROBE = `(() => {
  const vw = innerWidth;
  const root = document.documentElement;
  const overflow = root.scrollWidth - vw;
  // 屏幕外导出画布（1200px 宽、外层零高裁剪）不参与可见性判断，
  // 它被 overflow:hidden 裁掉，不会造成页面横向滚动
  const inHiddenExport = el => !!el.closest('[aria-hidden="true"]');
  const all = [...document.querySelectorAll("body *")].filter(el => !inHiddenExport(el));
  const offenders = all
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > vw + 1.5 || r.left < -1.5);
    })
    .slice(0, 8)
    .map(el => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute("class") || "").slice(0, 70),
        text: (el.textContent || "").trim().slice(0, 16),
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
      };
    });
  const visible = el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    // 逐级检查祖先：hover 工具条是 opacity:0 的容器，子按钮自身 opacity 仍是 1，
    // 只看元素本身会把它当成"可见控件"
    let n = el;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
      n = n.parentElement;
    }
    return true;
  };
  const controls = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button]")]
    .filter(visible)
    .map(el => {
      const r = el.getBoundingClientRect();
      const compact = el.closest("[data-touch-compact]");
      return {
        label: (el.getAttribute("aria-label") || el.getAttribute("title") || (el.textContent || "").replace(/\\s+/g, " ").trim() || el.tagName).slice(0, 18),
        w: Math.round(r.width), h: Math.round(r.height),
        compact: !!compact,
        why: compact ? (compact.getAttribute("data-touch-compact") || "次要操作").slice(0, 40) : "",
        // 原生开关 / 滑杆 / 取色器的可点区域与视觉轨道不同，单独由组件样式保证
        exempt: el.matches('[role="switch"], input[type="range"], input[type="color"], input[type="checkbox"], input[type="radio"]'),
      };
    });
  const fixedNav = [...document.querySelectorAll("nav")].find(n => getComputedStyle(n).position === "fixed");
  return {
    vw,
    overflow,
    offenders,
    controls,
    hoverNone: matchMedia("(hover: none)").matches,
    coarse: matchMedia("(pointer: coarse)").matches,
    topbar: Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 0),
    bottomNav: fixedNav ? Math.round(fixedNav.getBoundingClientRect().height) : 0,
    row: (() => {
      const row = document.querySelector("[data-tier-id]")?.parentElement;
      if (!row) return null;
      const label = row.querySelector("button");
      return { h: Math.round(row.getBoundingClientRect().height), label: label ? Math.round(label.getBoundingClientRect().width) : 0 };
    })(),
  };
})()`;


/** 生成一张 40×24 的 24 位 BMP：非方形、无透明通道，验证 JPEG 分支 */
function writeTestBmp(file) {
  const w = 40;
  const h = 24;
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + rowSize * h;
  const buf = Buffer.alloc(size);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(size, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(rowSize * h, 34);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 54 + y * rowSize + x * 3;
      buf[i] = 40 + x * 4;
      buf[i + 1] = 90 + y * 4;
      buf[i + 2] = 200;
    }
  }
  writeFileSync(file, buf);
  return file;
}

const problems = [];
const advisories = [];
const rows = [];
const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) problems.push(`${name}${detail ? "：" + detail : ""}`);
}
/** 非阻断提示：记录并打印，但不影响退出码（例如横屏平板沿用桌面密度） */
function note(name, detail = "") {
  advisories.push(`${name}${detail ? "：" + detail : ""}`);
  console.log(`! ${name}${detail ? " — " + detail : ""}`);
}
/** 按统一触控标准分类：<40 阻断；40–43 必须标记 compact；≥44 合格 */
function targetIssues(list) {
  const measured = (list || []).filter(x => !x.exempt);
  const minOf = x => Math.min(x.w, x.h);
  return {
    belowCompact: measured.filter(x => minOf(x) < TOUCH.compact),
    belowPrimary: measured.filter(x => minOf(x) >= TOUCH.compact && minOf(x) < TOUCH.primary && !x.compact),
  };
}
const fmtTargets = list =>
  list.slice(0, 6).map(c => `${c.label} ${c.w}×${c.h}`).join("、");

const sleepTouch = ms => new Promise(r => setTimeout(r, ms));
async function shot(name) {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  const png = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(SHOT_DIR, name + ".png"), Buffer.from(png.data, "base64"));
}
async function touchTap(box) {
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x, y: box.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
  });
  await sleepTouch(60);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** 点按钮：在顶层弹窗或整页里找文案匹配的可见按钮 */
async function tapButton(text, inDialog = false) {
  const box = await evaluate(`(() => {
    const root = ${inDialog ? TOP_DIALOG : "document"} || document;
    const wanted = ${JSON.stringify(text.replace(/\s+/g, ""))};
    // 先过滤掉 display:none 的按钮（顶栏的桌面工具在手机上仍留在 DOM 里）
    const el = [...root.querySelectorAll("button")].find(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && b.textContent.replace(/\\s+/g, "").includes(wanted);
    });
    if (!el) return null;
    // 抽屉里的按钮可能在滚动区下方：先滚到可视区再取坐标，
    // 否则触摸点会落在视口外，点了等于没点
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (!box) return false;
  await sleepTouch(150);
  await touchTap(box);
  await sleepTouch(280);
  return true;
}
try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("DOM.enable");
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });

  for (const vp of WIDTHS) {
    const mobile = vp.mobile ?? vp.w < 768;
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
      screenWidth: vp.w,
      screenHeight: vp.h,
    });
    await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });

    for (const page of PAGES) {
      await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/${page.hash}` });
      await waitFor(`!!document.querySelector("header")`, 9000);
      // 懒加载页面必须先等真正的内容出现，否则量到的是 Suspense 占位
      const ready = await waitFor(page.ready, 10000);
      check(`${vp.name} / ${page.name}：页面内容加载完成`, ready, ready ? "" : "10s 内没有出现");
      await sleep(250);
      const info = await evaluate(PROBE);
      rows.push({ vp, page, info });

      if (SHOT_DIR) {
        mkdirSync(SHOT_DIR, { recursive: true });
        const shot = await send("Page.captureScreenshot", { format: "png" });
        writeFileSync(path.join(SHOT_DIR, `${vp.w}-${page.name}.png`), Buffer.from(shot.data, "base64"));
      }

      check(`${vp.name} / ${page.name}：无横向溢出`, info.overflow <= 1, `${info.overflow}px`);
      check(
        `${vp.name} / ${page.name}：无元素越出视口`,
        info.offenders.length === 0,
        info.offenders.length ? `${info.offenders.length} 个，首个 ${info.offenders[0].tag}.${info.offenders[0].cls}（right=${info.offenders[0].right}）` : "",
      );

      if (mobile) {
        const measured = info.controls.filter(c => !c.exempt);
        const minOf = c => Math.min(c.w, c.h);
        const wide = vp.w >= 768;
        const floor = wide ? TOUCH.wideFloor : TOUCH.compact;
        const tooSmall = measured.filter(c => minOf(c) < floor);
        check(
          `${vp.name} / ${page.name}：可点区域不小于 ${floor}px`,
          tooSmall.length === 0,
          tooSmall.slice(0, 5).map(c => `${c.label} ${c.w}×${c.h}`).join("、"),
        );

        const belowPrimary = measured.filter(c => minOf(c) >= floor && minOf(c) < TOUCH.primary && !c.compact);
        if (wide) {
          // 横屏 / 平板沿用桌面工具条密度，是既有产品决策；只提示，不阻断
          if (belowPrimary.length) {
            note(
              `${vp.name} / ${page.name}：横屏沿用桌面密度，${belowPrimary.length} 个可点区域 <44px`,
              belowPrimary.slice(0, 4).map(c => `${c.label} ${c.w}×${c.h}`).join("、"),
            );
          }
        } else {
          check(
            `${vp.name} / ${page.name}：主要操作 ≥44px（次要操作需 data-touch-compact）`,
            belowPrimary.length === 0,
            belowPrimary.slice(0, 6).map(c => `${c.label} ${c.w}×${c.h}`).join("、"),
          );
          const compactTooSmall = measured.filter(c => c.compact && minOf(c) < TOUCH.compact);
          check(
            `${vp.name} / ${page.name}：标记为次要的操作仍 ≥40px`,
            compactTooSmall.length === 0,
            compactTooSmall.slice(0, 5).map(c => `${c.label} ${c.w}×${c.h}`).join("、"),
          );
        }

        if (wide) {
          check(
            `${vp.name} / ${page.name}：横屏不显示固定底栏（不遮挡内容）`,
            info.bottomNav === 0,
            `bottomNav=${info.bottomNav}`,
          );
        }
      }
      if (!mobile && info.hoverNone) check(`${vp.name}：桌面宽度被误判为 hover:none`, false);
    }
  }

  /* ---------- 触屏交互（390px） ---------- */
  if (INTERACT) {
    console.log("\n触屏交互（390px）：");
    const interactStart = results.length;
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844,
    });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/#/` });
    await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 9000);
    await sleep(350);

    const chipBox = name => evaluate(`(() => {
      const el = [...document.querySelectorAll('[class*="cursor-grab"]')].find(c => c.textContent.includes(${JSON.stringify(name)}));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);

    // 1) 点卡片 → 编辑抽屉
    const first = await chipBox("ChatGPT");
    if (first) await touchTap(first);
    await sleep(450);
    const sheet = await evaluate(`(() => {
      const d = ${TOP_DIALOG};
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return {
        top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width),
        vw: innerWidth, vh: innerHeight, scrollable: d.scrollHeight > d.clientHeight + 1,
        text: d.innerText.replace(/\\n/g, " ").slice(0, 40),
      };
    })()`);
    check("触屏点卡片打开编辑抽屉", !!sheet && sheet.text.includes("编辑项目"), sheet?.text ?? "未打开");
    check(
      "抽屉从底部展开且宽度贴合屏幕",
      !!sheet && sheet.w === sheet.vw && sheet.bottom >= sheet.vh - 2 && sheet.top > 0,
      sheet ? JSON.stringify({ top: sheet.top, w: sheet.w, bottom: sheet.bottom }) : "",
    );
    await shot("390-项目编辑抽屉");
    const sheetTargets = await evaluate(`(() => {
      const d = ${TOP_DIALOG};
      if (!d) return [];
      return [...d.querySelectorAll('button, input:not([type="hidden"]), label')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).map(el => {
        const r = el.getBoundingClientRect();
        const compact = el.closest("[data-touch-compact]");
        return {
          label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 14),
          w: Math.round(r.width),
          h: Math.round(r.height),
          compact: !!compact,
          exempt: el.matches('[role="switch"], input[type="range"], input[type="color"], input[type="checkbox"], input[type="radio"]'),
        };
      });
    })()`);
    {
      const issues = targetIssues(sheetTargets);
      check("编辑抽屉内可点区域均 ≥40px", issues.belowCompact.length === 0, fmtTargets(issues.belowCompact));
      check("编辑抽屉内主要操作均 ≥44px", issues.belowPrimary.length === 0, fmtTargets(issues.belowPrimary));
    }
    check(
      "抽屉里提供非拖拽的换位按钮",
      await evaluate(`(() => {
        const d = ${TOP_DIALOG};
        return !!d && ["上移", "下移", "移到上一档", "移到下一档"].every(t => [...d.querySelectorAll("button")].some(b => b.textContent.includes(t)));
      })()`),
    );

    // 2) 移到下一档
    check("点击「移到下一档」", await tapButton("移到下一档", true));
    const toastOverlap = await evaluate(`(() => {
      const d = ${TOP_DIALOG};
      const footer = d?.querySelector(".sticky");
      const toast = document.querySelector('[data-toast-root] > div');
      if (!footer || !toast) return null;
      const t = toast.getBoundingClientRect();
      const hit = [...footer.querySelectorAll("button")].some(b => {
        const r = b.getBoundingClientRect();
        return !(t.right <= r.left || t.left >= r.right || t.bottom <= r.top || t.top >= r.bottom);
      });
      return { hit, toast: { top: Math.round(t.top), bottom: Math.round(t.bottom) } };
    })()`);
    check("抽屉打开时 toast 不遮挡底部保存按钮", !!toastOverlap && toastOverlap.hit === false, JSON.stringify(toastOverlap));

    // 软键盘：iOS 只缩 visualViewport，App 把差值写进 --kb-inset。
    // 这里直接模拟 300px 键盘，验证抽屉与粘底操作条会整体抬高。
    await evaluate(`(() => {
      document.documentElement.style.setProperty("--kb-inset", "300px");
      document.documentElement.dataset.kb = "1";
      const input = document.querySelector('.dlg-content input[placeholder^="项目名称"]');
      input?.focus();
    })()`);
    await sleep(420);
    const kb = await evaluate(`(() => {
      const d = ${TOP_DIALOG};
      const footer = d?.querySelector(".sticky");
      if (!d || !footer) return null;
      const dr = d.getBoundingClientRect();
      const fr = footer.getBoundingClientRect();
      const input = d.querySelector('input[placeholder^="项目名称"]');
      const ir = input?.getBoundingClientRect();
      return {
        drawerBottom: Math.round(dr.bottom),
        footerBottom: Math.round(fr.bottom),
        inputBottom: ir ? Math.round(ir.bottom) : null,
        limit: innerHeight - 300,
      };
    })()`);
    check(
      "模拟软键盘 300px：抽屉与保存条都抬到键盘上方",
      !!kb && kb.drawerBottom <= kb.limit + 1 && kb.footerBottom <= kb.limit + 1 && (kb.inputBottom === null || kb.inputBottom <= kb.limit + 1),
      JSON.stringify(kb),
    );
    await evaluate(`(() => {
      document.documentElement.style.removeProperty("--kb-inset");
      delete document.documentElement.dataset.kb;
      document.activeElement?.blur();
    })()`);
    await sleep(250);

    check("点「取消」关闭抽屉", await tapButton("取消", true));
    const moved = await evaluate(`(() => {
      const rows = [...document.querySelectorAll("[data-tier-id]")];
      return { t0: rows[0].textContent.includes("ChatGPT"), t1: rows[1].textContent.includes("ChatGPT") };
    })()`);
    check("条目确实移到下一档", !moved.t0 && moved.t1, JSON.stringify(moved));

    // 3) 删除（走二次确认）
    const movedChip = await chipBox("ChatGPT");
    if (movedChip) await touchTap(movedChip);
    await sleep(420);
    check("打开删除确认", await tapButton("删除", true));
    await sleep(320);
    check("确认弹窗出现", await evaluate(`document.body.innerText.includes("删除「ChatGPT」")`));
    check("确认删除", await tapButton("删除", true));
    await sleep(420);
    check("条目已从榜单移除", await evaluate(`!document.body.innerText.includes("ChatGPT")`));

    // 4) 触摸长按拖拽（Gemini：第 2 档 → 第 1 档）
    await evaluate(`window.scrollTo(0, 0)`);
    await sleep(250);
    const drag = await evaluate(`(() => {
      const src = [...document.querySelectorAll('[class*="cursor-grab"]')].find(c => c.textContent.includes("Gemini"));
      const dst = document.querySelectorAll("[data-tier-id]")[0];
      if (!src || !dst) return null;
      const a = src.getBoundingClientRect();
      const b = dst.getBoundingClientRect();
      return {
        sx: Math.round(a.x + a.width / 2), sy: Math.round(a.y + a.height / 2),
        tx: Math.round(b.x + 80), ty: Math.round(b.y + b.height / 2),
        visible: a.top > 0 && a.bottom < innerHeight && b.top > 0 && b.bottom < innerHeight,
      };
    })()`);
    if (!drag || !drag.visible) {
      check("触摸拖拽：源与目标都在视口内", false, JSON.stringify(drag));
    } else {
      await send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: drag.sx, y: drag.sy, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
      });
      // 长按超过 220ms 的激活延迟，再移动
      await sleep(320);
      for (let i = 1; i <= 14; i++) {
        await send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{
            x: Math.round(drag.sx + ((drag.tx - drag.sx) * i) / 14),
            y: Math.round(drag.sy + ((drag.ty - drag.sy) * i) / 14),
            id: 1, radiusX: 2, radiusY: 2, force: 1,
          }],
        });
        await sleep(20);
      }
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(600);
      const dragged = await evaluate(`(() => {
        const rows = [...document.querySelectorAll("[data-tier-id]")];
        return { t0: rows[0].textContent.includes("Gemini"), t1: rows[1].textContent.includes("Gemini") };
      })()`);
      check("长按拖拽把条目从第 2 档移到第 1 档", dragged.t0 && !dragged.t1, JSON.stringify(dragged));
      check(
        "长按拖拽结束后没有误开编辑抽屉",
        await evaluate(`document.querySelectorAll(".dlg-content").length === 0`),
      );
    }

    // 4b) 抽屉的打开 / 关闭不应写入浏览历史（返回键不会"先关弹窗"）
    const historyBefore = await evaluate(`history.length`);
    await evaluate(`window.scrollTo(0, 420)`);
    await sleep(220);
    const scrollBefore = await evaluate(`Math.round(scrollY)`);
    const openForScroll = await chipBox("Gemini");
    if (openForScroll) await touchTap(openForScroll);
    await sleep(420);
    const historyDuring = await evaluate(`history.length`);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await sleep(450);
    const closedState = await evaluate(`(() => ({
      dialogs: document.querySelectorAll(".dlg-content").length,
      scrollY: Math.round(scrollY),
      history: history.length,
    }))()`);
    check("打开抽屉不写入浏览历史", historyDuring === historyBefore, `${historyBefore} → ${historyDuring}`);
    check(
      "关闭抽屉后页面滚动位置保持原样",
      closedState.dialogs === 0 && Math.abs(closedState.scrollY - scrollBefore) <= 3,
      JSON.stringify({ before: scrollBefore, after: closedState.scrollY }),
    );
    await evaluate(`window.scrollTo(0, 0)`);
    await sleep(220);

    // 5) 图片上传（移动端弹窗 + 真实 FileReader/canvas）
    await tapButton("添加项目");
    await sleep(400);
    const fileNode = await send("DOM.querySelector", {
      nodeId: (await send("DOM.getDocument")).root.nodeId,
      selector: ".dlg-content input[type=file]",
    });
    if (fileNode.nodeId) {
      const bmp = writeTestBmp(path.join(SHOT_DIR || tmpdir(), "mobile-upload.bmp"));
      await send("DOM.setFileInputFiles", { files: [bmp], nodeId: fileNode.nodeId });
      await waitFor(`!!document.querySelector('.dlg-content img[src^="data:image/jpeg"]')`, 8000);
      check("移动端弹窗内上传图片并完成 JPEG 重编码", await evaluate(`!!document.querySelector('.dlg-content img[src^="data:image/jpeg"]')`));
      await evaluate(`(() => {
        const el = document.querySelector('.dlg-content input[placeholder^="项目名称"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(el, "手机上传的图");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      check("提交图片项目", await tapButton("添加", true));
      await sleep(500);
      check("图片项目进入项目库", await evaluate(`document.body.innerText.includes("手机上传的图")`));
    } else {
      check("移动端弹窗里能找到文件选择框", false);
    }

    // 5b) 快速连点「下移 / 上移」：不能因闭包读到旧下标而越界、重复或漏掉条目
    const poolOrder = () =>
      evaluate(`(() => {
        const pool = [...document.querySelectorAll("section")].find(s => s.innerText.includes("项目库"));
        if (!pool) return [];
        return [...pool.querySelectorAll('[class*="cursor-grab"]')]
          .map(c => c.textContent.replace("×", "").trim())
          .filter(Boolean);
      })()`);
    await evaluate(`(() => {
      const el = document.querySelector('input[placeholder^="快速添加"]');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      for (const name of ["连点A", "连点B", "连点C"]) {
        setter.call(el, name);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }
      return true;
    })()`);
    await sleep(450);
    await evaluate(`(() => {
      const el = [...document.querySelectorAll('[class*="cursor-grab"]')].find(c => c.textContent.includes("连点A"));
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    })()`);
    await sleep(450);
    const orderBefore = await poolOrder();
    const nudgeBefore = orderBefore.findIndex(n => n.includes("连点A")) + 1;
    const dialogOpen = await evaluate(`(() => {
      const d = ${TOP_DIALOG};
      return !!d && d.innerText.includes("编辑项目");
    })()`);
    if (nudgeBefore <= 0 || !dialogOpen) {
      check("快速连点：打开条目编辑抽屉", false, JSON.stringify({ orderBefore, dialogOpen }));
    } else {
      const clickNudge = label =>
        evaluate(`(() => {
          const d = ${TOP_DIALOG};
          const b = [...d.querySelectorAll("button")].find(x => x.textContent.includes(${JSON.stringify(label)}));
          if (!b) return false;
          b.click();
          b.click();
          return true;
        })()`);
      await clickNudge("下移");
      await sleep(400);
      const orderDown = await poolOrder();
      check(
        "连点两次「下移」：位置前进两格，条目数量不变",
        orderDown.findIndex(n => n.includes("连点A")) + 1 === nudgeBefore + 2 &&
          orderDown.filter(n => n.includes("连点")).length === 3 &&
          new Set(orderDown).size === orderDown.length,
        JSON.stringify({ before: nudgeBefore, after: orderDown }),
      );
      await clickNudge("上移");
      await sleep(400);
      const orderUp = await poolOrder();
      check(
        "连点两次「上移」能回到原位，不越界",
        orderUp.findIndex(n => n.includes("连点A")) + 1 === nudgeBefore,
        JSON.stringify({ before: nudgeBefore, after: orderUp }),
      );
    }
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await sleep(350);
    check(
      "快速连点结束后抽屉已关闭",
      await evaluate(`document.querySelectorAll(".dlg-content").length === 0`),
    );

    // 5c) 图片解码失败：弹窗保持打开、给出提示，不把坏图写进项目库
    check("重新打开「添加项目」", await tapButton("添加项目"));
    await sleep(450);
    check(
      "添加项目弹窗已打开（不是残留的编辑抽屉）",
      await evaluate(`(() => { const d = ${TOP_DIALOG}; return !!d && d.innerText.includes("添加项目"); })()`),
    );
    const brokenNode = await send("DOM.querySelector", {
      nodeId: (await send("DOM.getDocument")).root.nodeId,
      selector: ".dlg-content input[type=file]",
    });
    if (brokenNode.nodeId) {
      const broken = path.join(SHOT_DIR || tmpdir(), "broken.bmp");
      writeFileSync(broken, "这不是一张图片");
      await send("DOM.setFileInputFiles", { files: [broken], nodeId: brokenNode.nodeId });
      const fileInfo = await evaluate(`(() => {
        const el = document.querySelector('.dlg-content input[type=file]');
        const f = el?.files?.[0];
        return f ? { name: f.name, type: f.type, size: f.size } : null;
      })()`);
      const warned = await waitFor(
        `document.querySelector('[data-toast-root]')?.innerText.includes("读不出来")`,
        8000,
      );
      const diag = await evaluate(`(() => ({
        dialogs: document.querySelectorAll(".dlg-content").length,
        toast: document.querySelector('[data-toast-root]')?.innerText.replace(/\\n/g, " ") ?? "",
        text: (${TOP_DIALOG})?.innerText.replace(/\\n/g, " ").slice(0, 80) ?? "",
        imgs: [...((${TOP_DIALOG})?.querySelectorAll("img") ?? [])].map(i => (i.getAttribute("src") || "").slice(0, 24)),
      }))()`);
      check("坏图解码失败时给出明确提示", warned, JSON.stringify({ fileInfo, ...diag }));
      check(
        "坏图失败后弹窗仍在，且没有写入图片",
        diag.dialogs === 1 && diag.imgs.every(src => !src.startsWith("data:image")),
        JSON.stringify(diag),
      );
    } else {
      check("坏图测试：找到文件选择框", false);
    }
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await sleep(300);

    // 6) 分享抽屉
    const openedShare = await tapButton("分享");
    if (!openedShare) {
      const diag = await evaluate(`(() => ({
        kb: document.documentElement.dataset.kb,
        dialogs: document.querySelectorAll(".dlg-content").length,
        navs: [...document.querySelectorAll("nav")].map(n => ({ display: getComputedStyle(n).display, text: n.innerText.replace(/\\n/g, "|") })),
        buttons: [...document.querySelectorAll("button")].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map(b => b.textContent.trim()).slice(-24),
      }))()`);
      console.log("  分享按钮诊断：" + JSON.stringify(diag));
    }
    check("打开分享", openedShare);
    await sleep(600);
    const shareSheet = await evaluate(`(() => {
      const d = ${TOP_DIALOG};
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return { w: Math.round(r.width), vw: innerWidth, bottom: Math.round(r.bottom), vh: innerHeight, text: d.innerText.includes("分享你的排名") };
    })()`);
    await shot("390-分享抽屉");
    check("分享弹窗在手机上也是底部抽屉", !!shareSheet && shareSheet.text && shareSheet.w === shareSheet.vw && shareSheet.bottom >= shareSheet.vh - 2, JSON.stringify(shareSheet));
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await sleep(350);

    // 7) 设置抽屉（含全屏入口）
    check("打开设置抽屉", await tapButton("设置"));
    await sleep(450);
    await shot("390-设置抽屉");
    const settingsTargets = await evaluate(`(() => {
      const d = [...document.querySelectorAll(".sheet-panel")].pop();
      if (!d) return [{ label: "抽屉未找到", w: 0, h: 0 }];
      return [...d.querySelectorAll('button, input:not([type="hidden"]), label')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).map(el => {
        const r = el.getBoundingClientRect();
        const compact = el.closest("[data-touch-compact]");
        return {
          label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 14),
          w: Math.round(r.width),
          h: Math.round(r.height),
          compact: !!compact,
          exempt: el.matches('[role="switch"], input[type="range"], input[type="color"], input[type="checkbox"], input[type="radio"]'),
        };
      });
    })()`);
    {
      const issues = targetIssues(settingsTargets);
      check("设置抽屉内可点区域均 ≥40px", issues.belowCompact.length === 0, fmtTargets(issues.belowCompact));
      check("设置抽屉内主要操作均 ≥44px", issues.belowPrimary.length === 0, fmtTargets(issues.belowPrimary));
    }
    check("设置抽屉包含全屏入口", await evaluate(`document.body.innerText.includes("隐藏导航栏（全屏展示）")`));

    // 手机上导出 PNG（与桌面共用 html-to-image）
    check("点「导出 PNG」", await tapButton("导出 PNG"));
    let png = null;
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      png = readdirSync(downloads).find(f => f.toLowerCase().endsWith(".png"));
      if (png) break;
    }
    const pngSize = png ? readFileSync(path.join(downloads, png)).length : 0;
    check("移动端导出 PNG 成功落盘", !!png && pngSize > 5000, png ? `${png} / ${pngSize} B` : "没有生成文件");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await sleep(300);

    /* ---------- iPhone / 微信：保存面板不能提供不可靠的直接下载 ---------- */
    // iOS Safari 在 await 之后的 a.click() 会被静默拦截，微信内置浏览器直接忽略 download。
    // 面板必须按环境给入口：iOS 系统分享优先、内置浏览器只提示长按、桌面/Android 才显示下载。
    const IPHONE_UA =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    const WECHAT_IOS_UA = IPHONE_UA + " MicroMessenger/8.0.49";
    const panelButtons = () =>
      evaluate(`(() => {
        const d = ${TOP_DIALOG};
        return d ? [...d.querySelectorAll("button")].map(b => (b.textContent || "").replace(/\\s+/g, "")) : [];
      })()`);
    const toastText = () =>
      evaluate(`document.querySelector('[data-toast-root]')?.innerText.replace(/\\n/g, " ") ?? ""`);
    let caseSeq = 0;
    const gotoEditor = async (label = "editor") => {
      // 带唯一 query：同一 URL（只差 hash）不会触发新文档，
      // addScriptToEvaluateOnNewDocument 与 UA 覆盖都需要真正的重新加载
      const url = `http://127.0.0.1:${PORT}/?case=${encodeURIComponent(label)}-${++caseSeq}#/`;
      await send("Page.navigate", { url });
      await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 9000);
      await sleep(350);
    };
    const openSavePanel = async () => {
      await tapButton("设置");
      await sleep(400);
      const clicked = await tapButton("导出 PNG");
      const ready = await waitFor(
        `(() => {
          const d = ${TOP_DIALOG};
          return !!d && !!d.querySelector('img[alt="排行榜图片"]');
        })()`,
        20000,
      );
      // 等抽屉入场动画结束，否则触摸点落在按钮动画前的位置
      if (ready) await sleep(400);
      return clicked && ready;
    };
    const closeSavePanel = async () => {
      await tapButton("关闭", true);
      await sleep(350);
    };
    /** 分享按钮用 DOM click：系统分享本身由单测覆盖，这里验证面板的显示/关闭与文案 */
    const clickShare = () =>
      evaluate(`(() => {
        const d = ${TOP_DIALOG};
        const b = d ? [...d.querySelectorAll("button")].find(x => x.textContent.replace(/\\s+/g, "").includes("保存/分享")) : null;
        if (!b) return false;
        b.click();
        return true;
      })()`);

    // A. iPhone + 系统分享可用：主入口是分享，不出现直接下载
    const shareOkScript = await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async () => { window.__shareCalls = (window.__shareCalls || 0) + 1; },
        });
        Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      `,
    });
    await send("Emulation.setUserAgentOverride", { userAgent: IPHONE_UA, platform: "iPhone" });
    await gotoEditor();
    const pngBeforeIos = new Set(readdirSync(downloads).filter(f => f.toLowerCase().endsWith(".png")));
    check("iPhone：导出后弹出保存面板（不再静默失败）", await openSavePanel());
    {
      const buttons = await panelButtons();
      check("iPhone：面板不出现任何下载入口", !buttons.some(b => b.includes("下载")), JSON.stringify(buttons));
      check("iPhone：面板主入口是「保存 / 分享」", buttons.some(b => b.includes("保存/分享")), JSON.stringify(buttons));
      check(
        "iPhone：面板同时给出长按保存说明",
        await evaluate(`(() => { const d = ${TOP_DIALOG}; return !!d && d.innerText.includes("长按"); })()`),
      );
      check("iPhone：点击「保存 / 分享」", await clickShare());
      await sleep(600);
      const shareState = await evaluate(`(() => {
        let canShare = null;
        try { canShare = typeof navigator.canShare === "function" ? navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] }) : null; } catch {}
        return {
          dialogs: document.querySelectorAll(".dlg-content").length,
          share: typeof navigator.share,
          canShare,
          calls: window.__shareCalls || 0,
        };
      })()`);
      const toast = await toastText();
      check("系统分享成功后关闭面板", shareState.dialogs === 0, JSON.stringify({ ...shareState, toast }));
      check("分享成功用明确的成功文案，且不再提示下载", /系统|存储图像/.test(toast) && !/下载/.test(toast), toast);
      let iosPng = null;
      for (let i = 0; i < 8; i++) {
        await sleep(150);
        iosPng = readdirSync(downloads).find(f => f.toLowerCase().endsWith(".png") && !pngBeforeIos.has(f)) ?? null;
        if (iosPng) break;
      }
      check("iPhone 分享路径不会偷偷落盘 PNG", !iosPng, iosPng ?? "");
    }
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: shareOkScript.identifier });

    // B. iPhone + 用户取消系统分享：保持面板，提示已取消，不误报失败
    const shareCancelScript = await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async () => { throw new DOMException("cancel", "AbortError"); },
        });
        Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      `,
    });
    await gotoEditor();
    check("iPhone 取消场景：打开保存面板", await openSavePanel());
    check("iPhone 取消场景：点击「保存 / 分享」", await clickShare());
    await sleep(450);
    check("用户取消系统分享后面板保持打开", await evaluate(`document.querySelectorAll(".dlg-content").length === 1`));
    {
      const toast = await toastText();
      check("取消分享只提示「已取消」，不误报失败", toast.includes("已取消") && !/失败|已导出/.test(toast), toast);
    }
    await closeSavePanel();
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: shareCancelScript.identifier });

    // C. iPhone + 系统分享不可用：只提示长按，不提供任何"看起来能下载"的按钮
    const shareOffScript = await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });`,
    });
    await gotoEditor();
    check("iPhone 无分享：打开保存面板", await openSavePanel());
    {
      const buttons = await panelButtons();
      check("系统分享不可用时不显示分享按钮", !buttons.some(b => b.includes("分享")), JSON.stringify(buttons));
      check("系统分享不可用时不显示任何下载入口", !buttons.some(b => b.includes("下载")), JSON.stringify(buttons));
      check(
        "系统分享不可用时明确提示长按保存",
        await evaluate(`(() => { const d = ${TOP_DIALOG}; return !!d && d.innerText.includes("长按"); })()`),
      );
    }
    // Blob URL 生命周期：关闭面板后必须 revoke，避免几 MB 位图泄漏
    await evaluate(`(() => {
      window.__urlStats = { created: 0, revoked: 0 };
      const c = URL.createObjectURL.bind(URL);
      const r = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = b => { window.__urlStats.created++; return c(b); };
      URL.revokeObjectURL = u => { window.__urlStats.revoked++; return r(u); };
    })()`);
    // 上面的 patch 在面板打开后才装，重新导出一次让新 URL 走计数
    await closeSavePanel();
    check("iPhone 无分享：重新导出后仍能打开面板", await openSavePanel());
    await closeSavePanel();
    {
      const stats = await evaluate(`window.__urlStats`);
      check("关闭保存面板会释放 Blob URL", stats.created > 0 && stats.revoked >= stats.created, JSON.stringify(stats));
    }
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: shareOffScript.identifier });

    // D. 微信内置浏览器：download 与系统分享都不可靠，只保留长按保存
    await send("Emulation.setUserAgentOverride", { userAgent: WECHAT_IOS_UA, platform: "iPhone" });
    await gotoEditor();
    check("微信：导出后弹出保存面板", await openSavePanel());
    {
      const buttons = await panelButtons();
      check("微信：面板不出现任何下载入口", !buttons.some(b => b.includes("下载")), JSON.stringify(buttons));
      check("微信：面板不出现系统分享按钮", !buttons.some(b => b.includes("分享")), JSON.stringify(buttons));
      check(
        "微信：明确提示长按图片保存",
        await evaluate(`(() => { const d = ${TOP_DIALOG}; return !!d && d.innerText.includes("长按") && d.innerText.includes("存储图像"); })()`),
      );
    }
    await closeSavePanel();
    await send("Emulation.setUserAgentOverride", { userAgent: "" });

    /* ---------- 深度检查：风格 / 长文本 / 320px 抽屉 / 我的排名 ---------- */
    const readState = () => evaluate(`(() => {
      const raw = localStorage.getItem("hangla.v3");
      if (!raw) return null;
      const env = JSON.parse(raw);
      const images = env.images || [];
      const resolve = node => {
        if (Array.isArray(node)) return node.map(resolve);
        if (node && typeof node === "object") {
          const out = {};
          for (const [k, v] of Object.entries(node)) {
            out[k] = k === "image" && typeof v === "string" && v.startsWith("\\u0000img:")
              ? (images[Number(v.slice(5))] ?? "")
              : resolve(v);
          }
          return out;
        }
        return node;
      };
      return resolve(env.value.state);
    })()`);

    // 8 套风格 × 昼夜：通过分享链接驱动只读预览，检查每种主题下都不横向溢出
    const baseState = await readState();
    if (!baseState) {
      check("读取存档用于主题检查", false);
    } else {
      const imageItem = baseState.pool.find(i => i.image);
      const boardWithImage = {
        ...baseState,
        tiers: baseState.tiers.map((t, i) => (i === 0 && imageItem ? { ...t, items: [...t.items, imageItem] } : t)),
      };
      for (const style of ["classic", "tier", "hype", "neon"]) {
        for (const mode of ["day", "night"]) {
          const payload = Buffer.from(JSON.stringify({ ...boardWithImage, style, mode })).toString("base64url");
          await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/#/r/${payload}` });
          await waitFor(`document.body.innerText.includes("只读")`, 9000);
          await sleep(200);
          const overflow = await evaluate(`document.documentElement.scrollWidth - innerWidth`);
          check(`${style} / ${mode}：手机预览无横向溢出`, overflow <= 0, `${overflow}px`);
        }
      }

      // 最大字号 + 最大图片 + 最大间距：最容易把卡片撑出屏幕的组合
      const payload = Buffer.from(
        JSON.stringify({
          ...boardWithImage,
          display: { ...baseState.display, cardFontSize: 24, cardImageSize: 96, rowGap: 32, tiltImages: true, tiltMax: 45 },
        }),
      ).toString("base64url");
      await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/#/r/${payload}` });
      await waitFor(`document.body.innerText.includes("只读")`, 9000);
      await sleep(250);
      const biggest = await evaluate(`(() => {
        const vw = innerWidth;
        const chips = [...document.querySelectorAll("[data-tier-id] span, .rounded-xl")].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && el.textContent.trim().length > 0 && el.querySelector("img");
        });
        const worst = chips.map(el => Math.round(el.getBoundingClientRect().right - vw)).sort((a, b) => b - a)[0];
        return { overflow: document.documentElement.scrollWidth - vw, worst };
      })()`);
      check("最大字号 / 图片 / 间距下仍无溢出", biggest.overflow <= 0, JSON.stringify(biggest));

      // 回到编辑器，测超长条目名与超长档位名
      await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/#/` });
      await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 9000);
      await sleep(250);
      const longName = "超长名字测试超长名字测试超长名字测试超长名字测试";
      await evaluate(`(() => {
        const el = document.querySelector('input[placeholder^="快速添加"]');
        if (!el) return false;
        el.value = ${JSON.stringify(longName)};
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        return true;
      })()`);
      await sleep(400);
      const longChip = await evaluate(`(() => {
        const el = [...document.querySelectorAll('[class*="cursor-grab"]')].find(c => c.textContent.includes("超长名字测试"));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const pr = el.parentElement.getBoundingClientRect();
        return { right: Math.round(r.right), parentRight: Math.round(pr.right), scroll: el.scrollWidth, client: el.clientWidth, h: Math.round(r.height) };
      })()`);
      check(
        "超长条目名在卡片内换行，不越出容器",
        !!longChip && longChip.right <= longChip.parentRight + 1 && longChip.scroll <= longChip.client + 2,
        JSON.stringify(longChip),
      );

      // 档位顺序的备用操作（触屏没有 hover 工具条，入口在档位编辑弹窗里）
      await evaluate(`window.scrollTo(0, 0)`);
      await sleep(250);
      const tierLabel0 = await evaluate(`(() => {
        const row = document.querySelector("[data-tier-id]").parentElement;
        const el = row.querySelector("button");
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`);
      await touchTap(tierLabel0);
      await sleep(400);
      check("档位弹窗里点「下移」", await tapButton("下移", true));
      check("保存档位顺序", await tapButton("保存", true));
      await sleep(450);
      const tierOrder = await evaluate(`(() => [...document.querySelectorAll("[data-tier-id]")].slice(0, 2).map(d => d.parentElement.querySelector("button").textContent.trim()))()`);
      check("档位下移生效（顶级 / 夯 互换）", tierOrder[0].includes("顶级") && tierOrder[1].includes("夯"), JSON.stringify(tierOrder));

      await evaluate(`window.scrollTo(0, 0)`);
      await sleep(250);
      const firstTierLabel = await evaluate(`(() => {
        const row = document.querySelector("[data-tier-id]").parentElement;
        const el = row.querySelector("button");
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`);
      await touchTap(firstTierLabel);
      await sleep(400);
      await evaluate(`(() => {
        const el = document.querySelector('.dlg-content input[placeholder^="档位名称"]');
        if (!el) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(el, "超长档位名称测试超长档位名称测试");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      check("保存超长档位名", await tapButton("保存", true));
      await sleep(450);
      const longTier = await evaluate(`(() => {
        const row = document.querySelector("[data-tier-id]").parentElement;
        const el = row.querySelector("button");
        return { scroll: el.scrollWidth, client: el.clientWidth, h: Math.round(row.getBoundingClientRect().height) };
      })()`);
      check("超长档位名在标签列内换行，不横向溢出", longTier.scroll <= longTier.client + 2, JSON.stringify(longTier));

      // 320px：编辑抽屉必须能滚动，底部保存条始终在可视区内
      await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true, screenWidth: 320, screenHeight: 568 });
      await sleep(300);
      await evaluate(`window.scrollTo(0, 0)`);
      await sleep(200);
      const chip320 = await evaluate(`(() => {
        const el = [...document.querySelectorAll('[class*="cursor-grab"]')].find(c => c.textContent.includes("Gemini"));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`);
      if (chip320) await touchTap(chip320);
      await sleep(450);
      const sheet320 = await evaluate(`(() => {
        const d = ${TOP_DIALOG};
        if (!d) return null;
        const r = d.getBoundingClientRect();
        const footer = d.querySelector(".sticky");
        const fr = footer ? footer.getBoundingClientRect() : null;
        return {
          top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight,
          scrollable: d.scrollHeight > d.clientHeight + 1,
          footerBottom: fr ? Math.round(fr.bottom) : null,
        };
      })()`);
      check(
        "320px 编辑抽屉可滚动，底部操作条始终可见",
        !!sheet320 && sheet320.top >= 0 && sheet320.bottom <= sheet320.vh + 1 && sheet320.footerBottom !== null && sheet320.footerBottom <= sheet320.vh + 1,
        JSON.stringify(sheet320),
      );
      const inputFont = await evaluate(`(() => {
        const el = document.querySelector('.dlg-content input[placeholder^="项目名称"]');
        return el ? getComputedStyle(el).fontSize : null;
      })()`);
      check("编辑抽屉输入框 ≥16px（iOS 不会自动放大页面）", !!inputFont && parseFloat(inputFont) >= 16, String(inputFont));
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
      await sleep(300);

      // 我的排名：保存快照后卡片与按钮仍不溢出
      await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/#/mine` });
      await waitFor(`document.body.innerText.includes("保存快照")`, 9000);
      await tapButton("保存快照");
      await waitFor(`!document.body.innerText.includes("还没有快照")`, 6000);
      const mine = await evaluate(`(() => {
        const vw = innerWidth;
        const controls = [...document.querySelectorAll("button, a[href], label")].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }).map(el => {
          const r = el.getBoundingClientRect();
          const compact = el.closest("[data-touch-compact]");
          return {
            label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 12),
            w: Math.round(r.width), h: Math.round(r.height),
            compact: !!compact,
            exempt: el.matches('[role="switch"], input[type="range"], input[type="color"], input[type="checkbox"], input[type="radio"]'),
          };
        });
        return { overflow: document.documentElement.scrollWidth - vw, controls };
      })()`);
      {
        const issues = targetIssues(mine.controls);
        check(
          "我的排名：快照卡片无横向溢出，可点区域 ≥40px",
          mine.overflow <= 0 && issues.belowCompact.length === 0,
          JSON.stringify({ overflow: mine.overflow, small: fmtTargets(issues.belowCompact) }),
        );
        check("我的排名：主要操作 ≥44px", issues.belowPrimary.length === 0, fmtTargets(issues.belowPrimary));
      }

      // JSON 导出
      check("点「导出 JSON」", await tapButton("导出 JSON"));
      let jsonFile = null;
      for (let i = 0; i < 40; i++) {
        await sleep(200);
        jsonFile = readdirSync(downloads).find(f => f.endsWith(".json"));
        if (jsonFile) break;
      }
      check("移动端导出 JSON 成功落盘", !!jsonFile, jsonFile ?? "没有生成文件");

      // JSON 导入（只存快照，不改编辑器）
      const importPath = path.join(SHOT_DIR || tmpdir(), "mobile-import.json");
      writeFileSync(
        importPath,
        JSON.stringify({
          title: "手机导入测试",
          tiers: [{ id: "t", name: "夯", color: "#abc", items: [{ id: "i", name: "导入的项目" }] }],
        }),
      );
      const importInput = await send("DOM.querySelector", {
        nodeId: (await send("DOM.getDocument")).root.nodeId,
        selector: 'input[type=file][accept*=".json"]',
      });
      if (importInput.nodeId) {
        await send("DOM.setFileInputFiles", { files: [importPath], nodeId: importInput.nodeId });
        await waitFor(`document.body.innerText.includes("手机导入测试")`, 6000);
        check("移动端导入 JSON 后出现新快照", await evaluate(`document.body.innerText.includes("手机导入测试")`));
        check("导入不覆盖编辑器里的榜单", await evaluate(`(() => {
          const env = JSON.parse(localStorage.getItem("hangla.v3"));
          return env.value.state.title !== "手机导入测试";
        })()`));
      } else {
        check("我的排名里能找到 JSON 文件选择框", false);
      }
    }
    // 4c) 拖拽到屏幕底部：dnd-kit 自动滚动应生效（长榜单换档的主要路径）
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844,
    });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/#/` });
    await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 9000);
    await sleep(350);
    await evaluate(`window.scrollTo(0, 0)`);
    await sleep(220);
    const autoDrag = await evaluate(`(() => {
      const el = [...document.querySelectorAll('[class*="cursor-grab"]')].find(c => c.textContent.includes("Gemini"));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2),
        scrollable: document.documentElement.scrollHeight - innerHeight,
      };
    })()`);
    if (!autoDrag || autoDrag.scrollable < 200) {
      check("拖拽自动滚动：页面有足够滚动空间", false, JSON.stringify(autoDrag));
    } else {
      await send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: autoDrag.x, y: autoDrag.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
      });
      await sleep(320);
      for (let i = 0; i < 28; i++) {
        await send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: autoDrag.x, y: 828, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
        });
        await sleep(50);
      }
      const autoScrollY = await evaluate(`Math.round(scrollY)`);
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(350);
      check("拖拽到屏幕底部会自动滚动页面", autoScrollY > 30, `scrollY=${autoScrollY}`);
    }

    // 防止未来某个分支被误删后"零交互也显示成功"
    if (results.length === interactStart) check("触屏交互检查至少执行一项", false);
  }
} catch (error) {
  problems.push("执行失败：" + error.message);
} finally {
  // 表格
  console.log("宽度 / 页面        溢出  越界  最小控件  顶栏  底栏  档位行(标签宽)");
  for (const { vp, page, info } of rows) {
    const measured = info.controls.filter(c => !c.exempt);
    const min = measured.length ? Math.min(...measured.map(c => Math.min(c.w, c.h))) : "-";
    console.log(
      `${String(vp.w).padEnd(5)}${page.name.padEnd(8)}  ${String(info.overflow).padStart(4)}  ${String(info.offenders.length).padStart(4)}  ${String(min).padStart(8)}  ${String(info.topbar).padStart(4)}  ${String(info.bottomNav).padStart(4)}  ${info.row ? `${info.row.h}(${info.row.label})` : "-"}`,
    );
  }

  const small = rows.flatMap(({ vp, page, info }) =>
    info.controls
      .filter(c => !c.exempt && Math.min(c.w, c.h) < TOUCH.primary)
      .map(c => `${vp.w}/${page.name}: ${c.label} ${c.w}×${c.h}${c.compact ? "（次要）" : ""}`),
  );
  if (small.length) {
    console.log(`\n小于 ${TOUCH.primary}px 的可点区域（前 40）：`);
    for (const s of [...new Set(small)].slice(0, 40)) console.log(" - " + s);
  }

  console.log("\n非阻断提示：");
  if (!advisories.length) console.log(" （无）");
  for (const a of [...new Set(advisories)]) console.log(" ! " + a);

  // 防止脚本结构被改坏后"零检查也显示成功"
  if (results.length === 0) problems.push("没有任何检查被执行，不能判定为通过");
  if (INTERACT && results.length > 0 && rows.length === 0) problems.push("布局量测没有产生任何结果");

  console.log("\n问题清单：");
  if (!problems.length) console.log(" （无）");
  for (const p of [...new Set(problems)]) console.log(" - " + p);

  const passed = results.filter(Boolean).length;
  console.log(
    `\n结果：${passed}/${results.length} 项通过，${new Set(problems).size} 个阻断问题，${new Set(advisories).size} 条提示` +
      (ASSERT ? "（门禁开启）" : "（--report-only：不阻断）"),
  );

  try {
    await send("Browser.close");
  } catch {
    /* closed */
  }
  ws.close();
  chrome.kill();
  server.close();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* windows lock */
  }
  const failed = ASSERT && problems.length > 0;
  process.exit(failed ? 1 : 0);
}
