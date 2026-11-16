// scripts/release-info.mjs —— 发布事实的统一读取入口（只读，不修改仓库）
//
// 为什么需要它：仓库提交、应用代码提交、Cloudflare 部署、GitHub Pages 部署、CI 运行
// 是五个不同的时间点。以前它们在多份文档里各写一遍，几天后必然对不上。
// 这里用 git / gh / 线上 HTML 现场读取，文档只引用结果，不再手抄。
//
// 用法：
//   npm run release:info            # 打印当前事实
//   npm run release:info -- --json  # 机器可读
//   npm run release:info -- --check # 校验两站线上主 JS 是否等于本地构建（需要网络）
//
// 说明：
// - Cloudflare 的部署 ID 需要 wrangler 登录才能读取，这里不强制依赖；标记为人工记录。
// - gh 未登录 / 网络不通时，对应项显示"无法获取"，不会编造。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const facts = JSON.parse(readFileSync(path.join(ROOT, "scripts", "project-facts.json"), "utf8"));
const wantJson = process.argv.includes("--json");
const wantCheck = process.argv.includes("--check");

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const git = (...args) => run("git", args);

/** 从 HTML 里取主 JS 文件名（Vite 的 assets/index-*.js） */
function assetFromHtml(html) {
  return /assets\/index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0] ?? "";
}

async function fetchHtml(url) {
  const attempts = 2;
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          // Cloudflare Pages 对默认 Node UA 可能直接超时 / 挑战；用浏览器 UA 读取静态 HTML
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 800));
    }
  }
  // Node fetch 被代理 / TLS 拦截时，用系统 curl 兜底（CI 与本机都有）
  try {
    return execFileSync("curl", ["-fsSL", "--max-time", "25", url], { encoding: "utf8" });
  } catch {
    throw lastError;
  }
}

async function liveAsset(url) {
  try {
    const html = await fetchHtml(url);
    const asset = assetFromHtml(html);
    return asset ? { ok: true, asset } : { ok: false, reason: "HTML 里找不到主 JS" };
  } catch (error) {
    return { ok: false, reason: error?.message || "网络错误" };
  }
}

function ghRun(workflow) {
  const raw = run("gh", [
    "run",
    "list",
    "--workflow=" + workflow,
    "--limit",
    "1",
    "--json",
    "databaseId,status,conclusion,headSha,displayTitle",
  ]);
  if (!raw) return null;
  try {
    const [run] = JSON.parse(raw);
    return run ?? null;
  } catch {
    return null;
  }
}

const head = git("rev-parse", "--short", "HEAD") || "无法获取";
const headFull = git("rev-parse", "HEAD");
const headSubject = git("log", "-1", "--format=%s") || "";
const branch = git("rev-parse", "--abbrev-ref", "HEAD") || "无法获取";
// 最近一次改到应用代码的提交：排除 docs / tests / CI / 报告
const appCommitLine =
  git("log", "-1", "--format=%h%x09%s", "--", "src", "public", "index.html", "vite.config.ts", "package.json") ||
  "无法获取";
const [appCommit, ...appSubjectParts] = appCommitLine.split("\t");
const appSubject = appSubjectParts.join("\t");

let localAsset = "";
const localIndex = path.join(ROOT, "dist-web", "index.html");
if (existsSync(localIndex)) localAsset = assetFromHtml(readFileSync(localIndex, "utf8"));

const cloudflareUrl = facts.demoUrl;
const pagesUrl = facts.githubPagesUrl;
const [cloudflare, pages] = await Promise.all([liveAsset(cloudflareUrl), liveAsset(pagesUrl)]);
const ci = ghRun("ci.yml");
const pagesRun = ghRun("deploy-pages.yml");

const info = {
  appVersion: pkg.version,
  branch,
  head,
  headFull,
  headSubject,
  lastAppCommit: appCommit || "无法获取",
  lastAppCommitSubject: appSubject || "无法获取",
  localAsset: localAsset || "未构建（先 npm run build:web）",
  cloudflare: {
    url: cloudflareUrl,
    project: facts.cloudflareProject,
    liveAsset: cloudflare.ok ? cloudflare.asset : `无法获取（${cloudflare.reason}）`,
  },
  githubPages: {
    url: pagesUrl,
    liveAsset: pages.ok ? pages.asset : `无法获取（${pages.reason}）`,
    latestRun: pagesRun
      ? { id: pagesRun.databaseId, status: pagesRun.status, conclusion: pagesRun.conclusion, headSha: pagesRun.headSha?.slice(0, 7) }
      : "无法获取（gh 未登录或网络不通）",
  },
  ci: ci
    ? { id: ci.databaseId, status: ci.status, conclusion: ci.conclusion, headSha: ci.headSha?.slice(0, 7) }
    : "无法获取（gh 未登录或网络不通）",
  note: "Cloudflare 最新生产部署 ID 需要 wrangler 登录后人工核对；文档里的部署记录是快照。",
};

if (wantJson) {
  console.log(JSON.stringify(info, null, 2));
} else {
  console.log("夯拉榜发布信息");
  console.log("──────────────");
  console.log(`应用版本          ${info.appVersion}`);
  console.log(`分支 / HEAD       ${info.branch} / ${info.head}  ${info.headSubject}`);
  console.log(`最近应用代码提交  ${info.lastAppCommit}  ${info.lastAppCommitSubject}`);
  console.log(`本地构建主 JS     ${info.localAsset}`);
  console.log(`Cloudflare        ${info.cloudflare.url}`);
  console.log(`  线上主 JS       ${info.cloudflare.liveAsset}`);
  console.log(`GitHub Pages      ${info.githubPages.url}`);
  console.log(`  线上主 JS       ${info.githubPages.liveAsset}`);
  console.log(`  最近部署         ${JSON.stringify(info.githubPages.latestRun)}`);
  console.log(`最近 CI           ${JSON.stringify(info.ci)}`);
  console.log("");
  console.log(info.note);
}

if (wantCheck) {
  const problems = [];
  if (!localAsset) problems.push("本地没有 dist-web 构建，先运行 npm run build:web");
  if (!cloudflare.ok) problems.push(`Cloudflare 线上读取失败：${cloudflare.reason}`);
  if (!pages.ok) problems.push(`GitHub Pages 线上读取失败：${pages.reason}`);
  if (localAsset && cloudflare.ok && cloudflare.asset !== localAsset) {
    problems.push(`Cloudflare 主 JS 与本地构建不一致：${cloudflare.asset} ≠ ${localAsset}`);
  }
  if (localAsset && pages.ok && pages.asset !== localAsset) {
    problems.push(`GitHub Pages 主 JS 与本地构建不一致：${pages.asset} ≠ ${localAsset}`);
  }
  if (problems.length) {
    console.error("\n✗ 发布一致性校验未通过：");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log("\n✓ 两站线上主 JS 与本地构建一致：" + localAsset);
}
