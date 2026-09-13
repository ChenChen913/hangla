// scripts/check-anchors.mjs —— 校验 Markdown 里的站内锚点是否命中真实标题
// 用法：node scripts/check-anchors.mjs [文件…]
// 缺省校验仓库里的中英两份 README；任一份有失效锚点即以退出码 1 结束
import fs from "node:fs";

const DEFAULT_FILES = ["README.md", "README_EN.md"];
const targets = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES).filter(f => fs.existsSync(f));

if (!targets.length) {
  console.error("✗ 没有找到可校验的 Markdown 文件");
  process.exit(1);
}

let failed = 0;
for (const file of targets) failed += check(file) ? 0 : 1;
process.exit(failed ? 1 : 0);

function check(file) {
const lines = fs.readFileSync(file, "utf8").split("\n");

// 1. 标记代码围栏：围栏内的标题和链接都不参与校验
let fence = null;
const inFence = lines.map((line) => {
  const m = line.match(/^`{3,}/);
  if (m) {
    if (fence === null) { fence = m[0].length; return true; }
    if (m[0].length >= fence) { fence = null; return true; }
  }
  return fence !== null;
});

// 2. 生成 GitHub 风格 slug：转小写 → 去标点 → 每个空格一个连字符（不合并连续空格）→ 中文原样保留
const slug = (s) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/ /g, "-").replace(/^-+|-+$/g, "");

const seen = new Map();
const slugs = new Set();
lines.forEach((line, i) => {
  if (inFence[i]) return;
  const h = line.match(/^#{1,6}\s+(.*)$/);
  if (!h) return;
  const s = slug(h[1].trim());
  const n = (seen.get(s) ?? 0) + 1;      // 同名标题：第二个起加 -1、-2
  seen.set(s, n);
  slugs.add(n === 1 ? s : s + "-" + (n - 1));
});

// 3. 比对所有 ](#anchor)
const broken = [];
lines.forEach((line, i) => {
  if (inFence[i]) return;
  for (const m of line.matchAll(/\]\(#([^)\s]+)\)/g)) {
    if (!slugs.has(m[1])) broken.push((i + 1) + " 行 → #" + m[1]);
  }
});

if (broken.length) {
  console.error("✗ " + file + " 有 " + broken.length + " 个失效锚点：");
  for (const b of broken) console.error("   " + b);
  return false;
}
console.log("✓ " + file + "：" + slugs.size + " 个标题，站内锚点全部有效");
return true;
}