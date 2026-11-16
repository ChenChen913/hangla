# 夯拉榜真机兼容性与发布质量报告

> 执行日期：2026-11-16
> 基线：`main` 提交 `7ce33af`
> 交付：PR #1（`quality/device-release-hardening`）已合并为 `21ff5e4`，应用代码提交 `cfdb640`
> 环境：Windows 11、Node `24.18.1`、npm `11.12.1`、Google Chrome `157.0.8103.52`（headless）
> 版本：`package.json` 仍是 `1.4.1`，本轮没有为了发版而升版本号
> 说明：本文只写实际执行 / 实际读取到的内容；真机未测的部分在 §4 明确标注。

---

## 1. 本轮发现的问题

| # | 问题 | 影响 | 状态 |
|---|---|---|---|
| 1 | 未识别的 Android WebView（UA 带 `; wv)`）只要 `"download" in a` 就按桌面下载处理 | 属性存在≠文件会落盘，可能提示"已开始下载"但相册 / 下载目录没有文件 | 已修复 |
| 2 | `QQ/` 内置浏览器未被识别；同时不能把 QQBrowser 误判成内置 WebView | QQ 里可能展示不可靠的直接下载 | 已修复 |
| 3 | 支付宝 / 飞书 / 钉钉已在正则里，但缺少回归测试 | 以后改正则容易悄悄破坏 | 已补测试 |
| 4 | `ShareDialog` 在 `toBlob` 返回 `null` 时只 `return`，不设置失败态 | 弹窗会一直显示"正在生成分享卡片…" | 已修复 |
| 5 | Canvas 创建失败 / OOM / `toBlob` 异常只显示原始错误片段 | 用户不知道是图太大、内存不足还是网络问题 | 已修复（分类提示） |
| 6 | `SaveImageDialog` 的 `busy` 在分享 API 意外抛错时可能不复位 | 按钮可能停在"正在打开…" | 已修复（try/finally） |
| 7 | Cloudflare 仍是纯手动 Direct Upload，GitHub Pages 自动部署 | 两边版本容易不一致；push 后主站不会自动更新 | 已增加可选自动部署 Job（默认关闭） |
| 8 | `live-check` 不校验线上主 JS 是否等于本次构建 | 可能"部署成功"但线上还是旧文件 | 已修复（`EXPECT_ASSET`） |
| 9 | 部署提交 / CI run / 线上 JS 分散在多份文档 | 几天后必然对不上，且文档提交容易被误认为应用版本 | 已建立 `release:info` 统一读取 |
| 10 | PR 工作流没有实际跑过 | 只能确认 YAML 存在，不能确认 `pull_request` 真的触发 | 已用 PR #1 实际验证 |
| 11 | 没有真机人工验收清单 | 容易把 Chromium 模拟当成真机通过 | 已新增 `docs/mobile-real-device-checklist.md` |
| 12 | `check-facts` 没有校验 Cloudflare 项目名 / GitHub Pages 地址 | 静态部署事实写错也不会红 | 已补校验 |

> 没有发现需要修改数据结构、存储格式或分享协议的问题；本轮没有动这些协议。

---

## 2. 根本原因

1. **把"能力存在"当成"行为可靠"**：`download` 属性、`navigator.share` 的存在都不等于
   文件一定落盘 / 分享面板一定能处理文件。桌面 Chrome 可以这样假设，未知 WebView 不行。
2. **UA 判断只覆盖了常见 App**：微信 / 微博 / 支付宝 / 钉钉 / 飞书已有，但 QQ 与
   Android 通用 WebView（`; wv)`）没有单独处理；QQBrowser 又必须排除，否则会反向误判。
3. **空 Blob 没有进入失败分支**：`html-to-image` 失败时可能返回 `null`，旧代码只判断
   `!alive || !blob` 就返回，没有把 `cardError` 置为失败态。
4. **异常分类缺失**：OOM / Canvas / 分包装载失败被揉成一段原始 message，提示不可执行。
5. **发布流程没有质量门禁**：Cloudflare 只在本地手动执行；没有"当前提交的产物"校验，
   也没有部署后的线上产物校验。
6. **发布事实没有单一来源**：提交号、部署号、CI run 是三个时间点，文档各写一遍就会漂移。
7. **没有 PR 实测**：`on: pull_request` 写了，但没有实际开 PR 跑过。
8. **真机流程缺失**：自动化只能覆盖 Chromium 模拟层，真机必须有人工清单和记录。

---

## 3. 修改的文件

| 文件 | 修改 |
|---|---|
| `src/lib/saveImage.ts` | 新增 `isGenericWebView()`；`isInAppBrowser()` 增加 QQ 并排除 QQBrowser；`planSaveUi()` 把通用 WebView 改成分享 / 长按；新增 `assertExportBlob()` 与 `exportFailureMessage()` |
| `src/lib/saveImage.test.ts` | 35 → 49 例：支付宝 / 飞书 / 钉钉 / QQ / QQBrowser / 通用 WebView / 未知 Android；空 Blob、Canvas / OOM、分包失败、超时透传；4096 单边边界 |
| `src/components/TopBar.tsx` | 导出 Blob 统一过 `assertExportBlob`；失败提示改用 `exportFailureMessage` |
| `src/components/ShareDialog.tsx` | 空 Blob / 异常设置 `cardError`，不再停在"正在生成"；失败提示分类 |
| `src/components/SaveImageDialog.tsx` | 分享按钮 `busy` 用 try/finally 复位 |
| `scripts/live-check.mjs` | 新增"线上主 JS 可定位"与 `EXPECT_ASSET` 一致性检查 |
| `scripts/release-info.mjs` | 新增：读取 HEAD、最近应用代码提交、本地构建、两站线上 JS、CI / Pages run；`--check` 校验一致性 |
| `scripts/project-facts.json` | 新增 `cloudflareProject`、`githubPagesUrl`、`release:info` 脚本登记 |
| `scripts/check-facts.mjs` | 校验 Cloudflare 项目名与 GitHub Pages 地址 |
| `.github/workflows/ci.yml` | build 写 `deploy-meta.json`；新增 `deploy-cloudflare` / `cloudflare-disabled` / `smoke` Job；部署前校验 SHA，部署后校验线上主 JS |
| `package.json` | 新增 `release:info` |
| `AGENTS.md` | 增加发布事实来源约定 |
| `README.md` / `README_EN.md` | 开发命令增加 `release:info` |
| `docs/cloudflare-deployment.md` | 自动部署配置、Secrets / 变量说明、统一事实来源、最新部署记录 |
| `docs/mobile-real-device-checklist.md` | 新增真机人工验收清单 |
| `docs/mobile-optimization-report.md` / `docs/mobile-quality-hardening-report.md` | 标注为历史快照，动态事实指向 `release:info` |
| `docs/release-and-device-quality-report.md` | 本报告 |

---

## 4. 真实设备测试情况

**没有做真机测试。** 当前环境没有连接 Android（`adb` 未安装）、没有 iPhone / iPad，
也没有 BrowserStack 之类的云真机。

已新增人工验收清单：[mobile-real-device-checklist.md](mobile-real-device-checklist.md)，包含：

- iPhone Safari：首页、添加 / 编辑、相册上传、长按拖拽、编辑抽屉、软键盘、普通 / 长榜单导出、系统分享保存。
- Android Chrome：图片上传替换、拖拽 / 上下移动、PNG 下载、JSON 导入导出、滚动与底部栏。
- 微信 iOS / Android：分享链接、PNG 预览、长按保存、无法保存时的引导。
- 支付宝 / 飞书 / 钉钉 / QQ（可选）：不出现直接下载，长按或分享提示。
- 设备型号、系统版本、浏览器版本、实际结果、截图 / 控制台错误字段。

**结论：真机项目全部为"未验证"，本报告不声称真机通过。**

---

## 5. 浏览器模拟测试结果

| 检查 | 结果 |
|---|---|
| `npm run test` | **11 个文件 / 295 例通过** |
| `npm run docs:check` | 通过（锚点 / 双语 / 事实） |
| `npm run build` | 通过，单文件 `dist/index.html` 2,244.59 kB（gzip 1,378.29 kB） |
| `npm run build:web` | 通过，主 JS `index-PrOmxocu.js` 633.56 kB |
| `npm run browser:check` | **34/34 通过**，18.6s |
| `npm run mobile:check` | **270/270 通过，0 个阻断问题，4 条非阻断提示** |
| `EXPECT_ASSET=index-PrOmxocu.js npm run live:check` | **14/14 通过** |
| `npm run release:info -- --check` | 通过：两站线上主 JS 均为 `index-PrOmxocu.js` |

移动端 4 条提示仍是 844px 横屏沿用桌面密度（15 / 8 / 6 / 5 个 32–38px 控件），
与上一轮一致，不是本轮新引入。

---

## 6. PNG 导出失败场景测试结果

硬限制保持：单边 `4096`、面积 `16,000,000`、最低清晰度 `0.1`。测试覆盖：

| 场景 | 结果 |
|---|---|
| 普通 1200×780 | 2 倍，2400×1560 |
| 1200×40960 | 0.1 倍，120×4096，刚好在上限内 |
| 1200×41000 | 拒绝，不把 0.09 抬回 0.1 |
| `toBlob` 返回 `null` | `assertExportBlob` 抛"空图片"，不下载 / 分享 |
| `toBlob` 返回空 Blob | 同上 |
| Canvas 创建失败 `toBlob` 异常 | 提示"设备无法生成（图片过大或内存不足），先删掉几张" |
| OOM / out of memory | 同一设备能力提示 |
| 动态分包加载失败 / 超时 | 提示检查网络 |
| 未知异常 | 保留原始信息并截断，不吞错 |
| 任务一直不返回 | `withTimeout` 20–30s 后失败，界面不会永远停在生成中 |
| 导出失败后的 UI | `SaveImageDialog` busy 复位；`ShareDialog` 显示失败态；TopBar 只弹 toast，无持久 loading |

**未做**：未经真机验证，没有引入分段导出 / 拼接方案；100000px 画布的拒绝路径是单元测试，
没有构造巨大 DOM 的浏览器 E2E。

---

## 7. UA 与能力检测测试结果

| 环境 | 判定 | 保存面板 |
|---|---|---|
| Windows / Mac Chrome | 完整浏览器 | 直接下载 |
| Android Chrome | 完整浏览器 | 直接下载；支持文件分享时多一个次要入口 |
| iPhone Safari | iOS | 系统分享优先；不支持则长按 |
| iPadOS 桌面 UA + 触点 > 1 | iOS | 同 iPhone |
| 微信 iOS / Android | 内置浏览器 | 只提示长按，不显示下载 / 分享 |
| 支付宝 iOS | 内置浏览器 | 只提示长按 |
| 飞书 Android | 内置浏览器 | 只提示长按 |
| 钉钉 Android | 内置浏览器 | 只提示长按 |
| QQ iOS | 内置浏览器 | 只提示长按 |
| QQBrowser Android | 完整浏览器（自带下载器） | 直接下载 |
| 通用 Android WebView `; wv)` | WebView | 有文件分享则分享，否则长按；**不显示直接下载** |
| 未识别的完整 Android 浏览器 | 完整浏览器 | 按 download 能力直接下载 |
| `navigator.share` 不存在 | — | unsupported → 长按提示 |
| `canShare({files})` 返回 false | — | unsupported → 长按提示 |
| 用户取消分享（AbortError） | — | cancelled，不报失败 |
| 分享其他异常 | — | unsupported，不误报成功 |

**残留风险**：没有 `; wv)`、也不在已知 App 正则里的第三方 WebView，仍会按
`download` 能力判断。没有把它全部归类为 iOS / 内置浏览器，是为了不误伤正常浏览器；
这类环境的真机行为需要清单验证。

---

## 8. CI 工作流调整情况

`.github/workflows/ci.yml` 现在：

1. `check`：`npm ci` → `npm test` → `npm run docs:check`
2. `build`：`npm ci` → `npm run build` → `npm run build:web` → 写 `dist-web/deploy-meta.json`
   （当前 `GITHUB_SHA` + 主 JS 文件名）→ 上传 `dist-web`
3. `browser`：下载产物 → 安装中文字体 → 确认 Chrome → `browser:check` → `mobile:check`
4. `deploy-cloudflare`：仅 main push；需要 `build` + `browser` 通过；校验
   `deploy-meta.json` 的 SHA 等于当前 `GITHUB_SHA`；检查 Secrets；`wrangler pages deploy`
   带 `--commit-hash`；`environment: production`
5. `cloudflare-disabled`：main push 但未启用变量时输出 warning + Step Summary，
   明确"质量检查通过，生产部署未执行"
6. `smoke`：仅自动部署后运行；下载产物，`EXPECT_ASSET` 校验线上主 JS 一致

实际运行：

| 事件 | run | 结果 |
|---|---|---|
| PR #1 push | `43867696029` | `check` / `build` / `browser` 通过；部署类 Job 跳过 |
| PR #1 pull_request | `43867722956` | 同上；**验证了 pull_request 工作流** |
| main merge push | `43868173565` | `check` / `build` / `browser` / `cloudflare-disabled` 通过；`deploy-cloudflare` / `smoke` 跳过 |
| GitHub Pages | `43868173655` | build + deploy 成功 |

**当前没有 GitHub Secrets**：`gh secret list` 为空，因此自动部署未启用；
`CF_DEPLOY_ENABLED` 也未设置。`cloudflare-disabled` 只发提示，不假装部署成功。

---

## 9. Cloudflare 与 GitHub Pages 实际部署版本

以下由 `npm run release:info` 与实际线上 HTML 读取：

| 项 | 值 |
|---|---|
| 应用版本 | `1.4.1` |
| 仓库 HEAD | `21ff5e4`（PR #1 合并） |
| 最近应用代码提交 | `cfdb640`（真机兼容与发布流程） |
| 本地构建主 JS | `assets/index-PrOmxocu.js`（633.56 kB） |
| Cloudflare 最新 Production | `cb245a0c-1d52-479d-aae2-2a8a271907d2`，源提交 `21ff5e4` |
| Cloudflare 线上主 JS | `assets/index-PrOmxocu.js` |
| GitHub Pages 最近部署 | run `43868173655`，成功，提交 `21ff5e4` |
| GitHub Pages 线上主 JS | `assets/index-PrOmxocu.js` |
| 最近 CI | run `43868173565`，成功，提交 `21ff5e4` |
| 线上冒烟 | `live-check` **14/14**，含主 JS 一致性 |

- 两站现在都包含本轮应用代码（`cfdb640`）；合并提交 `21ff5e4` 只是 PR merge。
- 本轮之后如果只改文档，线上主 JS 不应变化；`release:info` 会把"仓库 HEAD"与
  "最近应用代码提交"分开展示，避免把文档提交误认为新应用版本。
- Cloudflare 的部署 ID 仍需 `wrangler pages deployment list` 读取；`release:info`
  不强制依赖 wrangler 登录，所以文档里保留人工快照。

---

## 10. 尚未解决的问题

1. **真机未验证**：iPhone / Android / 微信 / 支付宝 / 飞书 / 钉钉 / QQ 的真实保存行为
   需要按 §4 清单执行；模拟层通过不等于真机通过。
2. **Cloudflare 自动部署未启用**：仓库没有 Secrets，也没有 `CF_DEPLOY_ENABLED`。
   当前只验证了工作流结构与 PR / main 的跳过行为，没有验证"真实部署 + smoke"路径。
3. **Canvas / OOM 无法在 CI 里稳定注入**：目前是单元测试覆盖空 Blob 与错误分类，
   没有真实设备的内存压力测试。
4. **未知 WebView 的残留风险**：没有 `; wv)`、也不在已知 App 名单里的第三方 WebView，
   仍按 `download` 能力处理。需要真机清单覆盖用户实际使用的 App。
5. **没有实现分段导出**：当前 html-to-image 没有经过验证的分块 + 拼接路径；
   为避免引入复杂且未测试的实现，本轮保持"超限拒绝 + 明确提示"。
6. **多次连续导出的内存累积没有真机量测**：Blob URL 释放在模拟层验证，
   但真实 iOS 的内存压力需要人工观察。
7. **`package.json` 版本仍是 1.4.1**：本轮按质量加固处理，没有擅自升版本。
8. **Actions Node 20 弃用警告**：checkout / setup-node / artifact 仍指向 Node 20，
   Runner 给出警告，不影响结果；后续升级 v5 / v6。

---

## 11. 需要人工执行的操作

### 11.1 配置 Cloudflare 自动部署（可选但推荐）

在 GitHub 仓库配置：

```sh
gh secret set CLOUDFLARE_API_TOKEN    # 权限至少 Pages:Edit
gh secret set CLOUDFLARE_ACCOUNT_ID   # Cloudflare Account ID
gh variable set CF_DEPLOY_ENABLED --body true
```

可选：Settings → Environments → `production` 配置 Required reviewers。
配置后，下一次 main push 会走"质量检查 → 构建 → 部署 → 线上冒烟"，PR 仍然不会部署。
未配置时不要期待自动部署；`cloudflare-disabled` 的 warning 不是发布成功。

### 11.2 真机验收

按 [mobile-real-device-checklist.md](mobile-real-device-checklist.md) 在至少：

- 1 台 iPhone（Safari）+ 1 台 Android（Chrome）
- iOS / Android 微信各 1 台
- 如用户群覆盖，再测支付宝 / 飞书 / 钉钉 / QQ

把设备型号、系统 / 浏览器版本、实际结果和截图填回清单。

### 11.3 发布 / 回滚

- 手动部署：`npm run deploy:cf`，然后 `EXPECT_ASSET=<主 JS> npm run live:check`。
- 自动部署启用后：main push 自动部署；失败时看 `deploy-cloudflare` / `smoke` Job 日志。
- 回滚：Cloudflare Dashboard → Deployments → 选上一版 Rollback；或 `git revert` 后重新部署。

---

## 12. 结论

### 已彻底修复（代码 + 自动化验证）

- 通用 Android WebView 不再因为 `download` 属性被当成可靠下载。
- QQ / QQBrowser 判定不再互相误伤；支付宝 / 飞书 / 钉钉 / QQ 有回归测试。
- 空 Blob、Canvas / OOM / toBlob 异常有明确提示，不再留下"生成中"或空图。
- `live-check` 能校验线上主 JS 与构建一致；Cloudflare 部署工作流有 SHA 校验与冒烟 Job。
- 发布事实有 `release:info` 统一入口；PR #1 的 push 与 pull_request 工作流都实际跑通。

### 只在模拟环境验证

- iOS 系统分享、微信长按、支付宝 / 飞书 / 钉钉 / QQ 的保存行为。
- 软键盘、滚动恢复、真实拖拽自动滚动。
- Canvas / OOM / 空 Blob 的失败注入。
- 多次连续导出的内存表现。

### 必须真机验证

- iPhone Safari 的系统分享 → 存储图像。
- 微信 / QQ 的长按保存菜单。
- Android Chrome 的下载目录与 JSON 导入导出。
- 真实设备上的长榜单导出、软键盘、安全区与横屏底部栏。

### 需要人工配置权限 / Secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- 仓库变量 `CF_DEPLOY_ENABLED=true`（以及可选的 `production` 环境审批）

在这些配置完成前，自动部署保持关闭；GitHub Pages 仍会随 push 自动发布，
Cloudflare 需要手动 `npm run deploy:cf`。当前两站已手动同步到 `index-PrOmxocu.js`，
但这不等于"自动部署已启用"。
