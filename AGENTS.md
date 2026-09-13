# 项目约定（所有 AI 会话必须遵守）

<!-- 参考：AI工程化思维/README+commit项目研究/新项目开机/AGENTS.md 与 README落地/1-放进项目/AGENTS-片段.md -->

## 一、README 规范

- 章节顺序固定：标题 → 徽章 → 一句话描述 → 特性列表 → 目录 → 背景 → 快速开始 → 用法
  → 配置 → 项目结构 → 开发 → FAQ → 如何贡献 → 许可证（**必须是最后一节**）。
- 一句话描述 < 120 字符，且与 `package.json` 的 `description`、GitHub 仓库 About 三处**完全一致**。
- 命令只能来自 `package.json` 的 `scripts` / 实际跑过的命令。
  **查不到就写 `<!-- TODO: 待确认 -->`，禁止推测。**
- 禁用词（出现即删）：强大的、灵活的、无缝的、革命性的、一站式的、企业级的、极大地、完美。
- 超过 100 行必须有目录，且覆盖所有二级标题。
- 不得写入真实密钥、token、内网域名、测试账号；示例值一律用占位符。
- 改完 README 跑 `npm run docs:check`，不过不许提交。

## 二、Commit 约定

本仓库用 commitlint 强制约束提交信息（配置在 package.json 的 `commitlint` 字段，
钩子在 `.husky/commit-msg`）。

- **被钩子拒绝时**：只改方括号里点名的规则（如 `[subject-case]`），其余一个字不动，改完重新提交。
- **永远不要用** `git commit --no-verify` 绕过钩子。被拦下就是消息写得不对，改消息，不是拆钩子。
- **一条提交只做一件事**：改动里同时有新功能、修 bug 和格式化时，拆成多条。

### 语言（中文项目）

- `type` / `scope` / `BREAKING CHANGE` 用英文；摘要与正文用简体中文。
- **摘要必须以中文开头**：写「修复 API 超时」，不要写「API 超时问题」——后者首字符是英文字母，
  会被 `subject-case` 判成 Sentence case 直接拒绝。
- 摘要 ≤ 30 个汉字（终端里中文占两格，超过会折行）。
- 不要中英夹在同一句里；术语（API、token、JSON）保留英文原文即可。

## 三、本项目的其它约定

- 技术栈固定为 React 19 + TypeScript + Vite + Tailwind CSS 4 + Zustand + dnd-kit + Motion；
  新增依赖前先确认没有现成能力。
- 视觉主题在 `src/lib/themes.ts` 登记（style × mode 两维度），新增风格必须同时提供
  `vars` 与 `export`（导出画布配色）。
- 档位颜色属于评级预设（`src/lib/presets.ts`），主题层只负责渲染，不覆盖用户数据。
- 存档结构变更必须升 `version` 并在 persist `migrate` 里写迁移。
- `dist/` 是构建产物不入库；演示单文件由 `npm run build` 生成。
