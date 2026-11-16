// scripts/browser-check.mjs —— 真实浏览器回归（可选，需本机装有 Chrome）
//
// 不引入 Playwright：直接用 Chrome DevTools Protocol 驱动 headless Chrome，
// 覆盖单元测试覆盖不到的部分：真实 FileReader / canvas 重编码 / html-to-image /
// localStorage 持久化与降级 / 移动端断点。
//
// 用法：
//   npm run build:web && node scripts/browser-check.mjs
// 环境变量：
//   CHROME_PATH  指定 Chrome 可执行文件（默认找常见安装路径）
//   KEEP_OPEN=1  结束后不关闭浏览器（调试用）
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist-web");
const PORT = 4179;
const DEBUG_PORT = 9339;

const CHROME =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find(p => existsSync(p));

if (!CHROME) {
  console.error("✗ 找不到 Chrome，设置 CHROME_PATH 后重试");
  process.exit(2);
}
if (!existsSync(path.join(DIST, "index.html"))) {
  console.error("✗ 缺少 dist-web/index.html，先运行 npm run build:web");
  process.exit(2);
}

/* ---------------- 静态服务器 ---------------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
  try {
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(200, { "content-type": MIME[".html"] });
    res.end(readFileSync(path.join(DIST, "index.html")));
  }
});
await new Promise(r => server.listen(PORT, "127.0.0.1", r));

/* ---------------- Chrome + CDP ---------------- */
const profile = mkdtempSync(path.join(tmpdir(), "hangla-chrome-"));
const downloads = mkdtempSync(path.join(tmpdir(), "hangla-dl-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    "--window-size=1440,1000",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function httpJson(url, init) {
  const res = await fetch(url, init);
  return res.json();
}

let target = null;
for (let i = 0; i < 100; i++) {
  try {
    target = await httpJson(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent("about:blank")}`, {
      method: "PUT",
    });
    break;
  } catch {
    await sleep(150);
  }
}
if (!target?.webSocketDebuggerUrl) {
  console.error("✗ 无法连接 Chrome 调试端口");
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
const listeners = new Map();
/** 页面运行时异常（与用例失败分开，避免把"某条断言没过"当成 JS 报错） */
const pageProblems = [];
let startedAt = 0;

ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id) {
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.error) job.reject(new Error(msg.error.message));
    else job.resolve(msg.result);
    return;
  }
  for (const cb of listeners.get(msg.method) ?? []) cb(msg.params);
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    pageProblems.push("异常：" + (d.exception?.description || d.text));
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    pageProblems.push("console.error：" + msg.params.args.map(a => a.value ?? a.description).join(" "));
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    const e = msg.params.entry;
    if (!/favicon/.test(e.url ?? "")) pageProblems.push("日志错误：" + e.text);
  }
};

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function on(method, cb) {
  if (!listeners.has(method)) listeners.set(method, []);
  listeners.get(method).push(cb);
}

async function evaluate(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}

async function waitFor(expression, timeout = 8000, label = expression) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      /* 页面还在加载，继续等 */
    }
    await sleep(100);
  }
  throw new Error(`等待超时：${label}`);
}

async function goto(url) {
  const loaded = new Promise(res => on("Page.loadEventFired", res));
  await send("Page.navigate", { url });
  await Promise.race([loaded, sleep(10000)]);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

async function setTitle(value) {
  return evaluate(`(() => {
    const el = document.querySelector('textarea[placeholder^="点此给榜单"]');
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return el.value === ${JSON.stringify(value)};
  })()`);
}


async function setInputValue(selector, value) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return el.value === ${JSON.stringify(value)};
  })()`);
}

/** 只点文案完全一致的按钮，避免"添加"误中"添加档位" */
async function clickExact(text) {
  return evaluate(`(() => {
    const el = [...document.querySelectorAll("button")].find(b => b.textContent.replace(/\\s+/g, "") === ${JSON.stringify(text)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

async function clickByText(text, scope = "document") {
  return evaluate(`(() => {
    const root = ${scope};
    const el = [...root.querySelectorAll("button")].find(b => b.textContent.replace(/\\s+/g, "").includes(${JSON.stringify(
      text.replace(/\s+/g, ""),
    )}));
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

/** 生成一张 40×24 的 24 位 BMP：非方形、无透明通道，正好验证 JPEG 分支 */
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

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("DOM.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });

  /* ---------- 1. 启动 ---------- */
  startedAt = Date.now();
  await goto(`http://127.0.0.1:${PORT}/`);
  await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 10000, "编辑器挂载");
  check("桌面启动：编辑器渲染，无白屏", await evaluate(`document.body.innerText.includes("添加档位")`));
  check("启动无未捕获异常 / console.error", pageProblems.length === 0, pageProblems.join(" | "));

  /* ---------- 2. 标题编辑 + 刷新恢复 ---------- */
  check("标题输入框可编辑", await setTitle("浏览器验证榜单"));
  await sleep(600); // 等 300ms 合并写入落盘
  await send("Page.reload");
  await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 10000, "刷新后挂载");
  const restored = await evaluate(`document.querySelector('textarea[placeholder^="点此给榜单"]').value`);
  check("刷新后标题仍在（localStorage 写入 + 水合）", restored === "浏览器验证榜单", restored);

  /* ---------- 3. 图片上传（真实 FileReader + canvas 重编码） ---------- */
  check("打开「添加项目」弹窗", await clickByText("添加项目"));
  await waitFor(`!!document.querySelector('input[type=file]')`, 4000, "文件输入框");
  const bmp = writeTestBmp(path.join(downloads, "test-40x24.bmp"));
  const { root } = await send("DOM.getDocument");
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
  await send("DOM.setFileInputFiles", { files: [bmp], nodeId });
  await waitFor(`!!document.querySelector('img[src^="data:image/jpeg"]')`, 10000, "图片重编码为 JPEG");
  const jpegInfo = await evaluate(`(() => {
    const img = document.querySelector('img[src^="data:image/jpeg"]');
    return { len: img.src.length, w: img.naturalWidth, h: img.naturalHeight };
  })()`);
  check("非方形图片上传后走 JPEG 分支且比例保留", jpegInfo.w === 40 && jpegInfo.h === 24, `${jpegInfo.w}×${jpegInfo.h}`);
  check("重编码后的图片体积可控", jpegInfo.len < 20000, `${jpegInfo.len} 字符`);
  // 关掉弹窗（取消），避免影响后续操作
  await clickByText("取消");
  await sleep(200);

  /* ---------- 3b. 新建带图项目（真实上传 + 提交） ---------- */
  check("重新打开「添加项目」", await clickByText("添加项目"));
  await waitFor(`!!document.querySelector('input[placeholder^="项目名称"]')`, 4000, "项目名称输入框");
  const { root: root2 } = await send("DOM.getDocument");
  const { nodeId: fileNode } = await send("DOM.querySelector", { nodeId: root2.nodeId, selector: "input[type=file]" });
  await send("DOM.setFileInputFiles", { files: [bmp], nodeId: fileNode });
  await waitFor(`!!document.querySelector('input[placeholder^="项目名称"]')`, 4000, "弹窗仍在");
  check("填写项目名称", await setInputValue('input[placeholder^="项目名称"]', "带图项目"));
  check("提交新项目", await clickExact("添加"));
  await waitFor(`document.body.innerText.includes("带图项目")`, 5000, "项目进入项目库");
  check("图片项目进入项目库", await evaluate(`[...document.querySelectorAll('[class*="cursor-grab"]')].some(c => c.textContent.includes("带图项目"))`));

  /* ---------- 3c. 跨档拖拽（dnd-kit 真实指针事件） ---------- */
  const drag = await evaluate(`(() => {
    const src = [...document.querySelectorAll('[class*="cursor-grab"]')].find(c => c.textContent.includes("ChatGPT"));
    const rows = [...document.querySelectorAll("[data-tier-id]")];
    const dst = rows[1];
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
    check("跨档拖拽：源与目标均在视口内", false, JSON.stringify(drag));
  } else {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: drag.sx, y: drag.sy, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: Math.round(drag.sx + ((drag.tx - drag.sx) * i) / 12),
        y: Math.round(drag.sy + ((drag.ty - drag.sy) * i) / 12),
        button: "left",
        buttons: 1,
      });
      await sleep(16);
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: drag.tx, y: drag.ty, button: "left", buttons: 1, clickCount: 1 });
    await sleep(400);
    const moved = await evaluate(`(() => {
      const rows = [...document.querySelectorAll("[data-tier-id]")];
      return { t0: rows[0].textContent.includes("ChatGPT"), t1: rows[1].textContent.includes("ChatGPT") };
    })()`);
    check("跨档拖拽：ChatGPT 从第 1 档移到第 2 档", !moved.t0 && moved.t1, JSON.stringify(moved));
  }

  /* ---------- 4. 分享弹窗 ---------- */
  check("打开分享弹窗", await clickByText("分享"));
  await waitFor(`document.body.innerText.includes("分享你的排名")`, 4000, "分享弹窗");
  await waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("复制链接"))`, 4000, "复制按钮");
  await sleep(500);
  const shareState = await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button")].find(b => b.textContent.includes("复制链接"));
    return { disabled: btn.disabled, hint: document.body.innerText.includes("正在估算链接长度") };
  })()`);
  check("分享链接在长度校验通过后才生成（按钮可用）", shareState.disabled === false && shareState.hint === false, JSON.stringify(shareState));
  check("分享弹窗说明显示设置会随链接走", await evaluate(`document.body.innerText.includes("会带上你的显示设置")`));
  await evaluate(`document.querySelector('[aria-label="Close"]')?.click() ?? document.body.click()`);
  await sleep(300);

  /* ---------- 5. 快照保存与预览 ---------- */
  await evaluate(`location.hash = "#/mine"`);
  await waitFor(`document.body.innerText.includes("我的排名")`, 6000, "我的排名页");
  await waitFor(
    `[...document.querySelectorAll("button")].some(b => b.textContent.includes("保存快照"))`,
    6000,
    "保存快照按钮",
  );
  check("保存快照", await clickByText("保存快照"));
  // 以"空状态提示消失"为准，而不是随便匹配一个"档"字
  await waitFor(`!document.body.innerText.includes("还没有快照")`, 5000, "快照卡片出现");
  check("快照出现在列表里", await evaluate(`document.body.innerText.includes("浏览器验证榜单")`));
  check("点击预览进入只读视图", await clickByText("预览"));
  await waitFor(`document.body.innerText.includes("只读")`, 6000, "只读预览");
  check("预览页显示榜单标题", await evaluate(`document.body.innerText.includes("浏览器验证榜单")`));

  /* ---------- 6. PNG 导出（html-to-image 真实运行） ---------- */
  await evaluate(`location.hash = "#/"`);
  await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 6000, "回到编辑器");
  check("点击导出 PNG", await clickByText("导出 PNG"));
  let png = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    png = readdirSync(downloads).find(f => f.toLowerCase().endsWith(".png"));
    if (png) break;
  }
  const pngSize = png ? readFileSync(path.join(downloads, png)).length : 0;
  check("导出 PNG 落盘", !!png && pngSize > 5000, png ? `${png} / ${pngSize} B` : "没有生成文件");

  /* ---------- 6b. 分享链接往返：显示设置随链接走 ---------- */
  const persisted = await evaluate(`(() => {
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
    const st = resolve(env.value.state);
    return { title: st.title, subtitle: st.subtitle, style: st.style, mode: st.mode, presetId: st.presetId, tiers: st.tiers, pool: st.pool, display: st.display };
  })()`);

  if (!persisted) {
    check("读取存档以构造分享链接", false);
  } else {
    // 同时改两个可观测的设置：隐藏图片 + 档位间距 30px。
    // 只改 showImages 不够——这条榜单的图片在项目库里，而只读预览不渲染项目库。
    const payload = Buffer.from(
      JSON.stringify({ ...persisted, display: { ...persisted.display, showImages: false, rowGap: 30 } }),
    ).toString("base64url");
    await goto(`http://127.0.0.1:${PORT}/#/r/${payload}`);
    await waitFor(`document.body.innerText.includes("只读分享视图")`, 8000, "分享预览页");
    const view = await evaluate(`(() => {
      // 只读预览的档位容器没有 data-tier-id（那是编辑器的拖拽落点），
      // 直接找页面上带内联 gap 的 flex 容器
      const gaps = [...document.querySelectorAll("[style]")].map(e => e.style.gap).filter(g => g);
      return {
        title: document.body.innerText.includes("浏览器验证榜单"),
        images: document.querySelectorAll('img[src^="data:image"]').length,
        gap: gaps.includes("30px") ? "30px" : gaps.join(","),
        names: document.body.innerText.includes("ChatGPT"),
      };
    })()`);
    check("打开分享链接：标题与内容正确", view.title && view.names);
    check("分享链接带上分享者的显示设置（图片隐藏 + 间距 30px）", view.images === 0 && view.gap === "30px", JSON.stringify(view));

    check("点击「复制一份来编辑」", await clickByText("复制一份来编辑"));
    await waitFor(`document.body.innerText.includes("覆盖当前编辑器里的榜单")`, 4000, "覆盖确认弹窗");
    check("确认覆盖", await clickByText("覆盖并编辑"));
    await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 6000, "回到编辑器");
    await sleep(800);
    const applied = await evaluate(`(() => {
      const env = JSON.parse(localStorage.getItem("hangla.v3"));
      return { showImages: env.value.state.display.showImages, hasItem: env.value.state.pool.some(i => i.name === "带图项目") };
    })()`);
    check("复制后显示设置一并应用（不是只复制文字）", applied.showImages === false && applied.hasItem, JSON.stringify(applied));
  }

  /* ---------- 6c. 快照恢复 ---------- */
  await evaluate(`location.hash = "#/mine"`);
  await waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("恢复到编辑器"))`, 6000, "快照列表");
  check("点击「恢复到编辑器」", await clickByText("恢复到编辑器"));
  await waitFor(`document.body.innerText.includes("当前编辑器里的榜单会被这份快照覆盖")`, 4000, "恢复确认");
  check("确认恢复", await clickExact("恢复"));
  await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 6000, "恢复后回到编辑器");
  await sleep(700);
  const restoredBoard = await evaluate(`(() => {
    const env = JSON.parse(localStorage.getItem("hangla.v3"));
    return { title: env.value.state.title, showImages: env.value.state.display.showImages, rowGap: env.value.state.display.rowGap };
  })()`);
  // 快照保存时 showImages=true / rowGap=12，分享链接把它改成了 false / 30
  check(
    "恢复快照：内容与显示设置一起回到保存那一刻",
    restoredBoard.title === "浏览器验证榜单" && restoredBoard.showImages === true && restoredBoard.rowGap === 12,
    JSON.stringify(restoredBoard),
  );

  /* ---------- 7. 移动端视口 ---------- */
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.reload");
  await waitFor(`!!document.querySelector("nav")`, 8000, "移动端底部栏");
  const mobile = await evaluate(`(() => {
    const navs = [...document.querySelectorAll("nav")];
    const nav = navs.find(n => getComputedStyle(n).display !== "none" && n.querySelectorAll("button").length >= 4);
    if (!nav) return { items: [] };
    return { display: getComputedStyle(nav).display, items: [...nav.querySelectorAll("button")].map(b => b.textContent.trim()) };
  })()`);
  check("手机视口下底部操作栏可见", mobile.display !== "none" && mobile.items.length >= 4, JSON.stringify(mobile.items));

  /* ---------- 8. 存储不可用：内存降级 + 常驻提示 ---------- */
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const stub = await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
          getItem: () => null,
          setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
          removeItem: () => {},
          clear: () => {},
          key: () => null,
          length: 0,
        },
      });
    `,
  });
  await send("Page.reload");
  await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 10000, "降级模式挂载");
  const degrade = await evaluate(`({
    banner: document.body.innerText.includes("刷新页面后会丢失"),
    editor: document.body.innerText.includes("添加档位"),
  })`);
  check("存储不可用时不白屏、编辑器照常渲染", degrade.editor);
  check("内存降级有常驻提示（明确说刷新会丢）", degrade.banner);
  check("降级模式下编辑不抛异常", await setTitle("降级模式下的标题"));
  await sleep(500);
  check("降级模式下没有产生未捕获异常", pageProblems.length === 0, pageProblems.join(" | "));

  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: stub.identifier });
} catch (error) {
  check("浏览器验证执行完成", false, error.message);
} finally {
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n用时 ${elapsed}s，${results.filter(r => r.ok).length}/${results.length} 项通过`);
  if (pageProblems.length) {
    console.log("页面异常：");
    for (const p of [...new Set(pageProblems)]) console.log(" - " + p);
  }
  if (!process.env.KEEP_OPEN) {
    try {
      await send("Browser.close");
    } catch {
      /* 已关闭 */
    }
    ws.close();
    chrome.kill();
    server.close();
    try {
      rmSync(profile, { recursive: true, force: true });
      rmSync(downloads, { recursive: true, force: true });
    } catch {
      /* Windows 上文件可能仍被占用，忽略 */
    }
  }
  process.exit(results.every(r => r.ok) && pageProblems.length === 0 ? 0 : 1);
}
