// scripts/check-i18n.mjs —— 校验中英两份 README 是否互为镜像
//
// 双语文档最常见的腐烂方式是"只更新一份"，而且很难被发现（文档不会报错）。
// 这里把能机器判定的部分全部对齐：章节数量、图片、命令、互相跳转的入口、
// 以及与 package.json 逐字一致的一句话描述。
// 用法：node scripts/check-i18n.mjs（任一项不一致即以退出码 1 结束）
import fs from "node:fs";

const MAIN = "README.md";
const ALT = "README_EN.md";
/** 语言切换入口必须出现在首屏（标题 + 徽章之后），行数上限放宽到 12 行 */
const ABOVE_THE_FOLD = 12;

const problems = [];
const fail = (msg) => problems.push(msg);

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
const main = read(MAIN);
const alt = read(ALT);

if (!main || !alt) {
  console.error("✗ 中英两份 README 缺一不可：" + [!main && MAIN, !alt && ALT].filter(Boolean).join("、") + " 不存在");
  process.exit(1);
}

/** 二级标题（章节顺序必须一致） */
const headings = (t) => [...t.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
/** 站内引用的本地图片 */
const images = (t) => [...t.matchAll(/\]\(((?:docs|assets)\/[^)]+)\)/g)].map((m) => m[1]).sort();
/** 出现的 npm 脚本命令（含反引号与 ```sh 代码块两处写法） */
const commands = (t) => [...new Set([...t.matchAll(/npm run ([a-z:-]+)/g)].map((m) => m[1]))].sort();

const hMain = headings(main);
const hAlt = headings(alt);
if (hMain.length !== hAlt.length) fail(`章节数不一致：${MAIN} ${hMain.length} 节，${ALT} ${hAlt.length} 节`);

const imgMain = images(main).join("|");
const imgAlt = images(alt).join("|");
if (imgMain !== imgAlt) fail(`引用的图片不一致：\n    ${MAIN}: ${imgMain || "（无）"}\n    ${ALT}: ${imgAlt || "（无）"}`);

const cmdMain = commands(main).join(" ");
const cmdAlt = commands(alt).join(" ");
if (cmdMain !== cmdAlt) fail(`npm 命令不一致：\n    ${MAIN}: ${cmdMain}\n    ${ALT}: ${cmdAlt}`);

// 双向互指，且都在首屏
for (const [self, other, text] of [[MAIN, ALT, main], [ALT, MAIN, alt]]) {
  if (!text.includes(other)) {
    fail(`${self} 没有指向 ${other} 的链接（切换入口必须双向）`);
    continue;
  }
  const head = text.split("\n").slice(0, ABOVE_THE_FOLD).join("\n");
  if (!head.includes(other)) fail(`${self} 的语言切换入口不在首屏（前 ${ABOVE_THE_FOLD} 行内）`);
}

// 一句话描述必须与 package.json 逐字一致，且两份都有
try {
  const desc = JSON.parse(fs.readFileSync("package.json", "utf8")).description;
  if (desc) {
    for (const [name, text] of [[MAIN, main], [ALT, alt]]) {
      if (!text.includes(desc)) fail(`${name} 里找不到与 package.json 逐字一致的一句话描述`);
    }
  }
} catch {
  fail("读不到 package.json 的 description，无法核对一句话描述");
}

if (problems.length) {
  console.error("✗ 双语校验未通过：");
  for (const p of problems) console.error("   - " + p);
  process.exit(1);
}
console.log(`✓ 中英双语一致：${hMain.length} 个章节、${hMain.length ? images(main).length : 0} 张图、命令 { ${commands(main).join(", ")} }、切换入口双向且在首屏`);
