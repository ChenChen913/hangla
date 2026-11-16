# 项目约定（所有 AI 会话必须遵守）

<!-- 参考：AI工程化思维/README+commit项目研究/新项目开机/AGENTS.md 与 README落地/1-放进项目/AGENTS-片段.md -->

## 一、README 规范

- 章节顺序固定：标题 → 徽章 → 一句话描述 → 特性列表 → 目录 → 背景 → 快速开始 → 用法
  → 配置 → 项目结构 → 开发 → FAQ → 如何贡献 → 许可证（**必须是最后一节**）。
- **必须交两份**：`README.md`（中文）与 `README_EN.md`（英文），**两份都要在首屏放语言切换入口**，
  且互为镜像。只交一份 = 交付未完成；章节标题要翻译，顺序与事实（命令、数字、依赖版本、已知限制）必须逐项对齐，
  改一份就要同步另一份。
- 一句话描述 < 120 字符，且与 `package.json` 的 `description`、GitHub 仓库 About 三处**完全一致**
  （两份 README 里都要逐字出现这句）。
- 命令只能来自 `package.json` 的 `scripts` / 实际跑过的命令。
  **查不到就写 `<!-- TODO: 待确认 -->`，禁止推测。**
- 禁用词（出现即删）：强大的、灵活的、无缝的、革命性的、一站式的、企业级的、极大地、完美。
- 超过 100 行必须有目录，且覆盖所有二级标题。
- 不得写入真实密钥、token、内网域名、测试账号；示例值一律用占位符。
- 改完 README 跑 `npm run docs:check`（校验两份的锚点 + 双语一致性），不过不许提交。

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
- **localStorage 只能经由 `src/lib/storage.ts` 访问**（探测、图片表、延迟写入、失败兜底都在那一层）。
  组件、入口、迁移逻辑里禁止裸调 `localStorage`——隐私模式下那会在模块顶层抛错，整页白屏。
- 存档格式是「单 Key + 图片表」：一次 `setItem` 要么整份成功、要么整份失败。不要再拆回两个 key
  做「先写正文、失败回滚」——回滚本身也会失败，多标签页交错还会造成正文与图片错配。
- 存档 / 分享 / 导入的数据必须先过 `normalizeBoard` / `normalizeItem` / `normalizeDisplay`；
  新增字段时同步补 `BOARD_LIMITS` 上限，别让极端文本或越界数值进 Store。
- 显示设置属于本机偏好，但**快照与分享链接必须带上它**（预览 = 恢复 = 分享者所见）。
  这条是产品约定，改之前先看 README 的 FAQ。
- README 里的数字事实（预设数、快照上限、链接阈值、图片边长、存储键）以
  `scripts/project-facts.json` 为唯一来源；改代码常量后同步改它，两份 README 一起改，
  `npm run docs:check` 会校验。
- **触屏交互的硬约定**：
  - 移动端可点区域：主要操作 ≥44px（`Button` 默认 `h-11 md:h-9`）；次要操作若确实达不到，
    必须加 `data-touch-compact` 注明理由，最低 40px；<40px 由 `mobile:check` 直接判失败。
    横屏 / 平板 ≥768px 沿用桌面密度（最低 32px），报告中单列为已知限制。
  - 不允许把关键操作藏在 `hover` 里。
  - 拖拽用 `MouseSensor(distance:6) + TouchSensor(delay:220, tolerance:8)`；禁止给可拖拽元素加
    `touch-action: none`（会把整页滚动锁死）。长按才算拖拽，普通滑动必须能滚页面。
  - 每个条目 / 档位都要有不依赖拖拽的备用操作（上移、下移、换档、删除）。
  - 手机上的弹窗统一走 `.dlg-content` 的底部抽屉（`index.css`），不要在组件里写死高度或宽度。
  - 触屏设备的输入框字号必须 ≥16px（iOS 会自动放大页面）；`.title-input` 是唯一例外。
  - 新增布局优先用 `<768` / `md:` / `lg:`，不要用 `sm:` 切换触控密度（640px 横屏仍是手机）。
- 移动端回归：`npm run mobile:check`（9 视口布局 + 触屏交互，**默认失败门禁**，
  关键项不通过退出码非 0；`--report-only` 才只报告）；桌面回归：`npm run browser:check`。
  两者都需要本机 Chrome，先 `npm run build:web`；CI 的 `browser` Job 会同时跑这两项。
- `dist/` 是构建产物不入库；演示单文件由 `npm run build` 生成。
