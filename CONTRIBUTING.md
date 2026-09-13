# 贡献指南

感谢关注夯拉榜。提交 Issue 或 Pull Request 前，请先读完这一页。

## 提交信息（Conventional Commits）

本仓库用 commitlint 强制校验提交信息（`.husky/commit-msg` 钩子，提交时自动运行）。

```text
<type>(<scope>): <摘要>

<正文（可选）>
```

- `type` 取值：`feat` / `fix` / `docs` / `refactor` / `perf` / `test` / `build` / `ci`
- 摘要用简体中文、以中文开头、不超过 30 个汉字，结尾不加句号
- 术语保留英文原文（API、token、JSON），不要中英夹在同一短语里
- 示例：`feat: 新增档位拖拽排序`、`fix: 修复暗色主题下输入框文字看不清`

> 被钩子拒绝时，只改提示里点名的规则，改完重新提交。**不要用 `--no-verify` 绕过。**

## 一条提交只做一件事

新功能、修 bug、格式化混在一起时，拆成多条提交。

## Pull Request

1. Fork 后从 `main` 拉出功能分支（如 `feat/xxx`）
2. `npm run build` 通过（含 TypeScript 类型检查）
3. 涉及 README 时先跑 `npm run docs:check`
4. PR 描述写清动机与影响；有截图 / 录屏更佳

## 开发约定

- 视觉主题在 `src/lib/themes.ts` 登记，新增风格必须同时提供页面配色（vars）与导出配色（export）
- 档位颜色属于评级预设（`src/lib/presets.ts`），主题层不覆盖用户数据
- 存档结构变更必须升 persist `version` 并编写迁移
- 面向 AI 会话的项目约定见根目录 [AGENTS.md](AGENTS.md)
