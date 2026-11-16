// scripts/check-facts.mjs —— 校验 README 里的事实数字与 project-facts.json 一致
//
// 为什么需要这一步：check-i18n 只能保证"两份 README 结构一样"，
// 两份一起写错（例如代码里上限改成 12000、文档还写 8000）它发现不了。
// 这里以 scripts/project-facts.json 为唯一来源：
//   1. 数值必须和 package.json（Node 版本、homepage、scripts）一致；
//   2. 两份 README 里对应表述的数字必须等于配置值；
//   3. README 里出现的每条 `npm run x` 必须真的存在于 package.json。
// 语义是否通顺仍然靠人 / AI 评审，这里只钉住可机器验证的部分。
// 用法：node scripts/check-facts.mjs
import fs from "node:fs";

const problems = [];
const fail = (msg) => problems.push(msg);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);

const facts = readJson("scripts/project-facts.json");
const pkg = readJson("package.json");
const main = read("README.md");
const alt = read("README_EN.md");

if (!main || !alt) {
  console.error("✗ check-facts 需要 README.md 与 README_EN.md 同时存在");
  process.exit(1);
}

/* ---------- 1. 配置 ↔ package.json ---------- */
if (facts.node !== pkg.engines?.node) {
  fail(`Node 最低版本不一致：facts ${facts.node}，package.json ${pkg.engines?.node}`);
}
if (facts.demoUrl !== pkg.homepage) {
  fail(`在线地址不一致：facts ${facts.demoUrl}，package.json ${pkg.homepage}`);
}
if (!facts.cloudflareProject || typeof facts.cloudflareProject !== "string") {
  fail("facts 缺少 cloudflareProject（Cloudflare Pages 项目名）");
}
if (!/^https:\/\//.test(facts.githubPagesUrl ?? "")) {
  fail("facts 的 githubPagesUrl 必须是 https 地址");
}

const scripts = Object.keys(pkg.scripts ?? {});
for (const name of facts.scripts) {
  if (!scripts.includes(name)) fail(`facts 里登记的脚本 npm run ${name} 在 package.json 里不存在`);
}

/* ---------- 2. 命令必须真实存在，且两份 README 都提到 ---------- */
const commandsIn = (text) => [...new Set([...text.matchAll(/npm run ([a-z:-]+)/g)].map((m) => m[1]))].sort();

for (const [name, text] of [["README.md", main], ["README_EN.md", alt]]) {
  for (const cmd of commandsIn(text)) {
    if (!scripts.includes(cmd)) fail(`${name} 里的 npm run ${cmd} 在 package.json 里不存在`);
  }
  for (const cmd of facts.scripts) {
    if (!commandsIn(text).includes(cmd)) fail(`${name} 没有提到 npm run ${cmd}（facts 登记的脚本必须都写进文档）`);
  }
}

/* ---------- 3. 数字事实：两份 README 都写对 ---------- */
/** 每条：[配置键, 中文正则, 英文正则, 说明] */
const rules = [
  ["presets", /(\d+)\s*套评级模式/g, /(\d+)\s*preset modes/gi, "评级模式数量"],
  ["styles", /(\d+)\s*种视觉风格/g, /(\d+)\s*visual styles/gi, "视觉风格数量"],
  ["snapshots", /最多保留\s*(\d+)\s*份/g, /up to\s*(\d+)\s*(?:of them|snapshots)/gi, "快照上限"],
  ["imageMaxSide", /最长边\s*(\d+)\s*px/gi, /capped at\s*(\d+)\s*px/gi, "图片最长边"],
  ["shareComfortChars", /超过\s*([\d,]+)\s*字符时/g, /past\s*([\d,]+)\s*characters/gi, "分享舒适上限"],
  ["importMaxMB", /导入文件上限\s*(\d+)\s*MB/g, /imports are capped at\s*(\d+)\s*MB/gi, "JSON 导入文件上限"],
];

const numbersIn = (text, re) => [...text.matchAll(re)].map((m) => Number(m[1].replace(/,/g, "")));

for (const [key, zhRe, enRe, label] of rules) {
  const expected = facts[key];
  for (const [name, text, re] of [["README.md", main, zhRe], ["README_EN.md", alt, enRe]]) {
    const found = numbersIn(text, re);
    if (found.length === 0) {
      fail(`${name} 找不到「${label}」的表述（期望 ${expected}，正则 ${re}）`);
      continue;
    }
    for (const n of found) {
      if (n !== expected) fail(`${name} 的${label}写成 ${n}，facts 是 ${expected}`);
    }
  }
}

// 主题总数 = 风格 × 明暗，两份 README 都要出现这个乘积
const themes = facts.styles * facts.modes;
for (const [name, text, re] of [
  ["README.md", main, /共\s*(\d+)\s*套主题/g],
  ["README_EN.md", alt, /\((\d+)\s*themes\)/gi],
]) {
  const found = numbersIn(text, re);
  if (found.length === 0) fail(`${name} 找不到「共 ${themes} 套主题」的表述`);
  for (const n of found) if (n !== themes) fail(`${name} 的主题总数写成 ${n}，应为 ${themes}`);
}

/* ---------- 4. 存储键与在线地址必须出现 ---------- */
for (const [name, text] of [["README.md", main], ["README_EN.md", alt]]) {
  if (!text.includes("`" + facts.storageKey + "`")) fail(`${name} 没有写明存储键 ${facts.storageKey}`);
  if (!text.includes(facts.demoUrl)) fail(`${name} 没有出现在线地址 ${facts.demoUrl}`);
}

if (problems.length) {
  console.error("✗ 文档事实校验未通过：");
  for (const p of problems) console.error("   - " + p);
  process.exit(1);
}

console.log(
  `✓ 文档事实一致：Node ${facts.node}、${facts.presets} 套评级、${facts.styles} 风格 × ${facts.modes} 明暗 = ${themes} 套主题、` +
    `${facts.snapshots} 份快照、分享 ${facts.shareComfortChars} 字符、图片 ${facts.imageMaxSide}px、键 ${facts.storageKey}`,
);
