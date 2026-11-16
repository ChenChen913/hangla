// scripts/live-check.mjs —— 线上站点冒烟检查（可选，需本机装有 Chrome + 能访问线上地址）
//
// 与 browser-check / mobile-check 不同：那两个跑本地 dist-web，这个直接打生产地址，
// 用来确认"部署完成"而不是"构建完成"——验证线上真的换成了新产物、缓存头生效、
// 深链接可用、存储被禁时不会白屏。
//
// 用法：
//   node scripts/live-check.mjs
//   LIVE_URL=https://xxx.pages.dev/ node scripts/live-check.mjs
// 环境变量：
//   LIVE_URL     覆盖线上地址（默认取 scripts/project-facts.json 的 demoUrl）
//   CHROME_PATH  指定 Chrome 可执行文件
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const FACTS = path.join(ROOT, "scripts", "project-facts.json");
const LIVE = process.env.LIVE_URL || JSON.parse(readFileSync(FACTS, "utf8")).demoUrl;
const DEBUG_PORT = 9351;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
if (!LIVE) {
  console.error("✗ 没有线上地址：设置 LIVE_URL 或在 project-facts.json 里填 demoUrl");
  process.exit(2);
}
console.log(`目标：${LIVE}`);

const profile = mkdtempSync(path.join(tmpdir(), "hangla-live-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let target = null;
for (let i = 0; i < 120; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" });
    target = await res.json();
    break;
  } catch {
    await sleep(150);
  }
}
if (!target?.webSocketDebuggerUrl) {
  console.error("✗ 无法连接 Chrome 调试端口");
  chrome.kill();
  rmSync(profile, { recursive: true, force: true });
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
/** 页面运行时异常（与断言失败分开记，避免把"某条断言没过"当成 JS 报错） */
const pageProblems = [];

ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id) {
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    msg.error ? job.reject(new Error(msg.error.message)) : job.resolve(msg.result);
    return;
  }
  for (const cb of listeners.get(msg.method) ?? []) cb(msg.params);
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    pageProblems.push("异常：" + (d.exception?.description || d.text));
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
async function waitFor(expression, timeout = 20000, label = expression) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      /* 页面还在加载，继续等 */
    }
    await sleep(150);
  }
  throw new Error(`等待超时：${label}`);
}
async function goto(url) {
  const loaded = new Promise(res => on("Page.loadEventFired", res));
  await send("Page.navigate", { url });
  await Promise.race([loaded, sleep(25000)]);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

try {
  /* 1. 桌面：首屏、导航、canonical、无横向溢出 */
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await goto(LIVE);
  await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 30000, "编辑器首屏");
  const desktop = await evaluate(`(() => ({
    title: document.title,
    overflow: document.documentElement.scrollWidth - innerWidth,
    nav: [...document.querySelectorAll("nav a")].map(a => a.textContent.trim()).join("|"),
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? "",
    image: document.querySelector('meta[property="og:image"]')?.content ?? "",
  }))()`);
  check("线上首屏加载成功", desktop.title.includes("夯拉榜"), desktop.title);
  check("桌面 1280px 无横向溢出", desktop.overflow <= 0, `${desktop.overflow}px`);
  check(
    "导航完整（编辑器 / 模板 / 我的排名）",
    ["编辑器", "模板", "我的排名"].every(t => desktop.nav.includes(t)),
    desktop.nav,
  );
  check("canonical 指向当前生产域名", desktop.canonical === new URL(LIVE).origin + "/", desktop.canonical);

  /* 2. 手机 390：布局、底部栏、点卡片进抽屉 */
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await goto(LIVE);
  await waitFor(`!!document.querySelector('textarea[placeholder^="点此给榜单"]')`, 30000, "手机首屏");
  // 进场动画期间 motion.main 带 transform，fixed 子元素会跟着容器走，等动画结束再量
  await sleep(1200);
  const mobile = await evaluate(`(() => {
    const nav = [...document.querySelectorAll("nav")].find(n => getComputedStyle(n).display !== "none" && n.querySelectorAll("button").length >= 4);
    const r = nav ? nav.getBoundingClientRect() : null;
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      bar: r ? {
        h: Math.round(r.height),
        gapToBottom: Math.round(innerHeight - r.bottom),
        items: [...nav.querySelectorAll("button")].map(b => b.textContent.trim()),
      } : null,
    };
  })()`);
  check("手机 390px 无横向溢出", mobile.overflow <= 0, `${mobile.overflow}px`);
  check(
    "底部操作栏 4 项且贴合视口底部",
    !!mobile.bar && Math.abs(mobile.bar.gapToBottom) <= 2 && mobile.bar.items.length === 4,
    JSON.stringify(mobile.bar?.items ?? mobile.bar),
  );

  const chip = await evaluate(`(() => {
    const el = [...document.querySelectorAll('[class*="cursor-grab"]')].find(c => c.textContent.trim().length > 0);
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (chip) {
    await send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: chip.x, y: chip.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
    });
    await sleep(60);
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(600);
    const sheet = await evaluate(`(() => {
      const d = [...document.querySelectorAll(".dlg-content")].pop();
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return { w: Math.round(r.width), vw: innerWidth, text: d.innerText.replace(/\\n/g, " ").slice(0, 24) };
    })()`);
    check("触屏点卡片打开全宽编辑抽屉", !!sheet && sheet.text.includes("编辑项目") && sheet.w === sheet.vw, JSON.stringify(sheet));
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await sleep(300);
  } else {
    check("找到可点的项目卡片", false);
  }

  /* 3. 存储读写全被禁：内存降级 + 常驻提示，绝不白屏 */
  const { identifier } = await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      const boom = () => { throw new DOMException("blocked", "SecurityError"); };
      Storage.prototype.getItem = boom;
      Storage.prototype.setItem = boom;
      Storage.prototype.removeItem = boom;
    `,
  });
  await goto(LIVE);
  await waitFor(`document.body.innerText.length > 0`, 30000, "降级模式首屏");
  await sleep(900);
  const degraded = await evaluate(`(() => ({
    body: document.body.innerText.replace(/\\n/g, " ").slice(0, 48),
    banner: document.body.innerText.includes("刷新页面后会丢失"),
    editing: !!document.querySelector('textarea[placeholder^="点此给榜单"]'),
    overflow: document.documentElement.scrollWidth - innerWidth,
  }))()`);
  check("存储被禁时正常渲染（不白屏）", degraded.editing, degraded.body);
  check("显示常驻降级提示", degraded.banner);
  check("降级模式无横向溢出", degraded.overflow <= 0, `${degraded.overflow}px`);
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });

  /* 4. Hash 深链接直达（Pages 不能靠服务端 rewrite） */
  await goto(LIVE.replace(/\/$/, "") + "/#/mine");
  await waitFor(`document.body.innerText.includes("保存快照")`, 30000, "我的排名页");
  check("直接访问 #/mine 深链接可用", true);

  check("全程无未捕获异常 / 资源错误", pageProblems.length === 0, pageProblems.slice(0, 3).join(" | "));
} catch (error) {
  check("执行失败：" + error.message, false);
}

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
if (pageProblems.length) for (const p of [...new Set(pageProblems)]) console.log(" - " + p);

try {
  await send("Browser.close");
} catch {
  /* ignore */
}
ws.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
