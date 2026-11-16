# 夯拉榜移动端专项质量加固报告

> 执行日期：2026-11-16
> 基线：`origin/main` 提交 `1fb5dbb`（本地 HEAD 与远端一致）
> 环境：Windows 11、Node `24.18.1`、npm `11.12.1`、Google Chrome `157.0.8103.52`（headless）
> 交付状态：已提交并推送到 GitHub main；GitHub Actions CI 通过，GitHub Pages 与 Cloudflare 均已更新到本轮版本（部署源 `e4e33cb`）。
> 原则：本报告只写实际执行过、实际量测过的内容；没有真机验证的部分在 §10 明确列出，不声称通过。

---

## 0. 验收摘要

| 命令 | 结果 |
|---|---|
| `npm ci` | 通过，220 个包 |
| `npm run test` | **11 个文件 / 281 例全部通过** |
| `npm run docs:check` | 通过：锚点、双语、事实数字三项全过 |
| `npm run build` | 通过，单文件 `dist/index.html` 2,243.98 kB（gzip 1,378.08 kB） |
| `npm run build:web` | 通过，主 JS `index-CtwJsM2z.js` 632.94 kB（gzip 205.23 kB）、CSS 47.87 kB |
| `npm run browser:check` | **34/34 通过**，17.9s |
| `npm run mobile:check` | **270/270 项通过，0 个阻断问题，4 条非阻断提示**；退出码 0 |
| `npm run live:check` | **12/12 通过**，Cloudflare 已更新到本轮版本（见 §11） |
| GitHub Actions CI | run `43864182365` 通过：`check` 13s、`build` 32s、`browser` 1m44s |
| Cloudflare Pages | 部署 `3b3c09c7` 成功，线上主 JS `index-CtwJsM2z.js` |

移动端检查已经变成真正的失败门禁：本轮开发过程中它多次因真实问题以退出码 1 结束，
最终才收敛到 270/270。没有删除测试、没有降低断言、没有用跳过的方式制造通过。

---

## 1. 本轮发现的问题

| # | 问题 | 影响 | 状态 |
|---|---|---|---|
| 1 | `mobile:check` 只有传 `--assert` 才阻断；`package.json` 没传，发现问题仍退出 0 | 移动端检查形同虚设，CI / 本地都可能"带病通过" | 已修复 |
| 2 | `ci.yml` 只跑单测、文档和双构建，没有浏览器 / 移动端检查 | 移动端回归只能在本地手动执行，PR 可以带着断链合并 | 已修复（新增 Job，未在 GitHub 实际运行） |
| 3 | 触控标准不统一：报告写 44px，脚本同时用 32 / 36 / 40px 三套阈值 | 40 / 41 / 42px 的控件在旧脚本里被判"通过"，与文档承诺不符 | 已修复并统一 |
| 4 | `exportPixelRatio()` 先按上限算出安全比，再用 `Math.max(0.1, …)` 抬回 0.1 | 极端长榜单重新越界：1200×100000 会变成 12000px 高，超过 4096 单边限制，得到空白 / 截断图 | 已修复 |
| 5 | 保存图片面板无条件展示「直接下载」 | iOS / 微信里点了不会发生任何事，却仍提示"已开始下载" | 已修复 |
| 6 | `ShareDialog` 在无系统分享时仍显示「保存 PNG」；`MinePage` 导出 JSON 失败后回落到不可靠的下载 | 同类"假成功"风险 | 已修复 |
| 7 | 存储层用 `filter` 清洗图片数组 | `[A, null, B]` 被压缩成 `[A, B]`，token 指向错位：B 丢失，或把 B 错配给原本为空的卡片 | 已修复 |
| 8 | 新格式 `images` 不是数组时会跌回旧格式分支 | 新正文的 token 可能借用旧图片库的图，造成跨代错配 | 已修复 |
| 9 | `encodeImage()` 解码失败时原样返回 data URL | 坏图被当成成功上传：界面出现永远加载不出来的破图，存档白占空间，也没有失败提示 | 已修复 |
| 10 | 分享卡片生成失败后弹窗一直显示"正在生成分享卡片…" | 用户不知道是失败还是还在等 | 已修复（增加失败态文案） |
| 11 | 测试脚本用 `[role="status"]` 取 toast，和 dnd-kit 的读屏播报区冲突 | 自动化读到"「Gemini」已放下"而不是真实 toast，可能误判 | 已修复（Toaster 增加 `data-toast-root`） |
| 12 | `mobile-check` 的 UA / 注入脚本用例导航到同一 URL，未产生新文档 | UA 覆盖与 `addScriptToEvaluateOnNewDocument` 不生效，测试可能给出假结果 | 已修复（每次带唯一 query 强制重新加载） |
| 13 | `mobile-check` 没有"零检查"保护 | 脚本结构被改坏、分支被误删时仍可能退出 0 | 已修复 |
| 14 | 条目卡、副标题输入、项目库控件等实际命中区只有 40 / 41 / 42px | 与 44px 承诺不一致，触屏容易误触 | 已修复或显式标记为次要操作 |

> 与提示词不一致的地方：没有发现"提示词描述与代码相反"的情况。提示词点名的四处
> （门禁、PNG 下限、保存面板、存储下标）都与实际代码一致，已按根因修复。

---

## 2. 根本原因

1. **门禁是"可选参数"而不是默认行为**：`ASSERT = process.argv.includes("--assert")`，
   而 `package.json` 的 `mobile:check` 没传；`catch` 又把异常塞进 `problems`，
   在 `ASSERT=false` 时同样退出 0。问题不在断言本身，在"默认不启用"。
2. **CI 只覆盖了不需要浏览器的部分**：`ci.yml` 只有 `check` 一个 Job，没有 Chrome，
   也没有消费 `dist-web` 的浏览器 Job。
3. **触控阈值散落在脚本里**：布局检查用 32 / 40，抽屉检查用 36，报告写 44；
   三处各自维护，新增控件时没有统一裁决标准。
4. **最低像素比是"保底"而不是"拒绝线"**：`Math.max(MIN_PIXEL_RATIO, …)` 在安全比
   已经低于 0.1 时把它抬回去，画布尺寸随之突破单边上限；调用方也没有"拒绝导出"的分支。
5. **保存通道只用于"是否弹面板"，没有用于面板内部**：`SaveImageDialog` 没有接收
   `planSaveUi` 的结果，按钮写死在 JSX 里，所以 iOS / 内置浏览器仍会看到直接下载。
6. **图片 token 是数组下标，但清洗用了会改变下标的 `filter`**：新旧两条读取路径
   都用了 `filter`，非法项被删除后，后续所有合法图片左移。
7. **新格式信封判断把 `images` 类型也当成格式判断**：`parsed.images` 不是数组时
   条件不成立，代码落入旧格式分支，旧图片库被错误复用。
8. **图片解码错误被吞掉**：`encodeImage` 的 `catch` 返回原 data URL，调用方把
   "有字符串"当成"图片可用"，因此坏图不会进入失败分支。
9. **测试脚本自身的可观测性问题**：toast 选择器与 dnd-kit 播报区冲突；
   `Page.navigate` 到完全相同的 URL 不创建新文档；缺少"至少执行了一项检查"的保护。

---

## 3. 修改的文件

### 3.1 门禁与 CI

| 文件 | 修改 |
|---|---|
| `scripts/mobile-check.mjs` | 默认失败门禁；`--report-only` 才只报告；区分阻断问题 / 非阻断提示；统一触控标准；新增 9 类交互边界检查；零检查保护；toast 选择器改用 `data-toast-root`；每次用例用唯一 query 强制重新加载 |
| `package.json` | `mobile:check` 显式传入 `--assert`（脚本默认也已阻断） |
| `.github/workflows/ci.yml` | 拆成 `check` / `build` / `browser` 三个 Job；`build` 上传 `dist-web`；`browser` 下载产物、安装中文字体、确认 Chrome 可用后依次跑 `browser:check` 与 `mobile:check`；Chrome 缺失直接失败 |

### 3.2 导出与保存

| 文件 | 修改 |
|---|---|
| `src/lib/saveImage.ts` | 新增 `planExportSize()`：单边 / 面积双上限，最低清晰度作为**拒绝线**；新增 `exportSizeProblem()`；新增 `planSaveUi()` / `currentSavePlan()` / `canShareFiles()`，把保存入口收敛为纯函数 |
| `src/lib/saveImage.test.ts` | 从 16 例扩到 35 例：画布边界、非法尺寸、保存通道矩阵、系统分享成功 / 取消 / 不支持、拒绝提示 |
| `src/components/TopBar.tsx` | 导出前规划尺寸；拒绝时明确提示；不再用 `clientHeight || 1` 猜高度；按 `planSaveUi` 决定直接下载还是弹面板 |
| `src/components/SaveImageDialog.tsx` | 按环境显示主入口：桌面 / Android 下载，iOS 系统分享，微信 / QQ 只提示长按；不再渲染已知不可靠的直接下载；下载失败不再提示成功；关闭 / 换图释放 Blob URL |
| `src/components/ShareDialog.tsx` | 使用同一套保存计划；无可靠通道时隐藏保存按钮；分享卡片尺寸超限时显示失败态；下载 / 分享失败不误报成功 |
| `src/pages/MinePage.tsx` | JSON 导出按保存计划分流；内置浏览器无可靠通道时明确提示，不再回落到 download 假成功 |

### 3.3 存储与图片

| 文件 | 修改 |
|---|---|
| `src/lib/storage.ts` | 新增 `sanitizeImages()`：非法项原地降级为空串，绝不压缩下标；新旧格式都走它；新格式 `images` 非数组时按空表处理，不再跌回旧格式 |
| `src/lib/storage.test.ts` | 25 → 34 例：新增 8 例图片表故障注入 + 1 例 `visibilitychange` 落盘 |
| `src/lib/utils.ts` | `encodeImage()` 解码失败改为抛错；只有"解码成功但重编码失败"才保留原图 |
| `src/lib/images.test.ts` | 新增"解码失败不写入项目库"用例 |

### 3.4 触控尺寸与可观测性

| 文件 | 修改 |
|---|---|
| `src/components/FancySelect.tsx` | 触发器手机 `h-11`（桌面仍 `md:h-9`） |
| `src/components/Pool.tsx` | 搜索框、添加项目、图片按钮手机 `h-11`；快速添加输入 `min-h-11` |
| `src/components/ItemChip.tsx` | 条目卡 `min-h-11`，文字卡不再只有 41px |
| `src/components/ItemDialog.tsx` | 「移除图片」「归零」提到 44px |
| `src/components/DisplaySettings.tsx` | 分段选项显式标记 `data-touch-compact`（40px，注明理由） |
| `src/pages/EditorPage.tsx` | 设置抽屉的关闭 / 日夜 / 撤销 / 重做提到 44px；副标题输入 `min-h-11` |
| `src/components/ui/button.tsx` | `sm` 尺寸手机改 `h-11`（桌面仍 `md:h-7`） |
| `src/components/TopBar.tsx` | 品牌首页入口标记 `data-touch-compact`（40×44，次要入口） |
| `src/components/Toaster.tsx` | 增加 `data-toast-root`，供自动化稳定读取真实 toast |

### 3.5 文档

| 文件 | 修改 |
|---|---|
| `AGENTS.md` | 触控标准改为 44 / 40 / 32 三档；明确 `mobile:check` 默认门禁 |
| `README.md` / `README_EN.md` | `mobile:check` 标注为 CI 门禁；FAQ 说明 iOS / 微信按钮差异与极端长图拒绝行为 |
| `docs/mobile-optimization-report.md` | 新增 §12：统一触控标准，声明旧 32 / 36 阈值作废 |
| `docs/cloudflare-deployment.md` | 更正最近部署为 `1fb5dbb` / `66b74539`；注明本轮改动未部署 |
| `docs/mobile-quality-hardening-report.md` | 本报告 |

---

## 4. 每个问题对应的测试

| 问题 | 测试 |
|---|---|
| 门禁默认不阻断 | `scripts/mobile-check.mjs` 自身；本轮开发中多次真实失败退出 1；最终 270/270 退出 0；`--report-only` 为显式只报告 |
| CI 缺浏览器检查 | `.github/workflows/ci.yml` 新增 `browser` Job；本地等价命令全部执行（CI 未在 GitHub 实际运行，见 §8） |
| 触控标准不统一 | 9 视口 × 4 页面布局检查；390px 触屏交互中的抽屉 / 设置 / 我的排名 / 保存面板检查；4 条横屏提示 |
| PNG 极端尺寸 | `src/lib/saveImage.test.ts` 的「导出画布尺寸」与「拒绝导出提示」共 10 例 |
| 保存面板通道 | `saveImage.test.ts` 的「保存通道」「保存面板入口规划」「系统分享」；`mobile-check` 的 iPhone 分享成功 / 取消 / 不支持、微信、Blob URL 释放 |
| 存储下标错位 | `storage.test.ts` 的「图片表损坏时的索引稳定性」8 例 |
| 新格式 images 损坏跌回旧格式 | 同上「新格式的 images 字段损坏时按空表处理，绝不跌回旧图片库错配图片」 |
| 坏图被当成成功 | `images.test.ts` 新增「解码失败（坏图）时跳过该图」；`mobile-check` 用损坏 BMP 走真实 FileReader / Image 解码 |
| 分享卡片失败无提示 | `ShareDialog` 增加 `cardError`；桌面浏览器回归覆盖正常分享卡片路径；极端失败路径由尺寸单测覆盖 |
| toast 选择器冲突 | `Toaster` 增加 `data-toast-root`；`mobile-check` 的 toast 遮挡 / 分享成功 / 取消文案断言改用稳定选择器 |
| 同 URL 不产生新文档 | `mobile-check` 的 `gotoEditor()` 每次带唯一 query，iPhone / 微信用例真实重新加载 |
| 零检查保护 | `mobile-check` 结束时若 `results.length === 0` 或布局结果为空，直接判失败 |

---

## 5. 极端 PNG 导出测试结果

上限常量：`MAX_EXPORT_SIDE = 4096`、`MAX_EXPORT_AREA = 16_000_000`、`MIN_EXPORT_PIXEL_RATIO = 0.1`。

| 画布输入 | 结果 | 像素比 | 输出尺寸 | 总面积 | 结论 |
|---|---|---:|---|---:|---|
| 1200×780（普通） | 成功 | 2 | 2400×1560 | 3,744,000 | 普通榜单清晰度未降 |
| 1200×2892（27 档） | 成功 | 1.41 | 1692×4077 | 6,898,284 | 与修复后的安全输出一致 |
| 1200×3210（30 档） | 成功 | 1.27 | 1524×4076 | 6,211,824 | 完整且不越界 |
| 1200×12000（接近最大条目数） | 成功 | 0.34 | 408×4080 | 1,664,640 | 降低清晰度但不越界 |
| 1200×40000（极端） | 成功 | 0.1 | 120×4000 | 480,000 | 0.1 倍仍可完整导出 |
| 1200×100000（极端） | **拒绝** | 安全比 0.04096 | — | — | 不会把 0.04 抬回 0.1 后越界 |
| 6000×6000（面积受限） | 成功 | 0.66 | 3960×3960 | 15,681,600 | 面积不超过 16M |
| 0、负数、NaN、Infinity | **拒绝** | — | — | — | `invalid-size`，不产生 NaN / 负值 |

- 所有成功生成的尺寸都逐项校验了 `width ≤ 4096`、`height ≤ 4096`、总面积 ≤ 16,000,000。
- 拒绝时调用方走 `exportSizeProblem()`：过长提示"先删掉几个档位或项目再试"，
  尺寸异常提示"刷新页面后重试"；不会静默返回空白图。
- `clientHeight` 量不出来时不再用 `|| 1` 猜，直接按尺寸异常拒绝。
- 普通榜单仍按 2 倍导出；桌面浏览器回归实测导出 486,996 B，未出现清晰度回退。

---

## 6. 移动端保存通道测试结果

### 6.1 通道判定（单元测试，全部通过）

| 环境 | 通道 | 主入口 | 直接下载 | 系统分享 | 长按提示 |
|---|---|---|---|---|---|
| Windows Chrome | download | download | 显示 | 不显示（无文件分享） | 不显示 |
| Android Chrome | download | download | 显示 | 支持时作为次要入口 | 不显示 |
| iPhone Safari + 系统分享 | sheet | share | **不显示** | 显示 | 显示 |
| iPhone Safari 无系统分享 | sheet | longpress | **不显示** | 不显示 | 显示 |
| iPadOS 桌面 UA（触点 > 1） | sheet | share | **不显示** | 显示 | 显示 |
| 微信 iOS | sheet | longpress | **不显示** | 不显示 | 显示 |
| 微信 Android | sheet | longpress | **不显示** | 不显示 | 显示 |
| 无 download + 有分享 | sheet | share | 不显示 | 显示 | 显示 |
| 无 download + 无分享 | sheet | longpress | 不显示 | 不显示 | 显示 |

### 6.2 面板 UI（`mobile-check` 实测）

- **iPhone + 分享可用**：面板只有「保存 / 分享」「关闭」，没有出现任何"下载"按钮；
  点击分享后 `navigator.share` 被调用 1 次，面板关闭，文案为"已交给系统…"，
  且没有偷偷落盘 PNG。
- **iPhone + 分享取消**：面板保持打开，toast 为「已取消」，没有"失败 / 已导出"字样。
- **iPhone + 分享不可用**：不显示分享按钮、不显示下载按钮，明确提示长按保存。
- **微信 iOS**：按钮只有「关闭」，文案包含「长按」「存储图像」。
- **Blob URL 释放**：关闭面板后 `created=1 / revoked≥1`，没有把几 MB 的位图留在内存里。
- **下载失败**：`downloadBlob` 抛错时提示"下载没有启动，请长按图片保存"，不再提示成功。

> 以上 iPhone / 微信场景是 **UA + `navigator.share` 注入的浏览器模拟**，不是真机（见 §10）。

---

## 7. 存储损坏恢复测试结果

| 故障场景 | 结果 |
|---|---|
| 图片数组正常 `[A, B]` | token 0 → A，token 1 → B |
| 图片数组含 `null` `[A, null, B]` | token 0 → A，token 1 → 空图，token 2 → B；后续图片不左移 |
| 图片数组含数字 / 对象 / 普通 URL | 非法项原地变空串；合法项仍按原下标恢复；外部 URL 不会被塞回 `<img>` |
| token 指向非法位置 | 该卡片退化为空图，同档其他卡片图片不受影响 |
| token 超出数组范围 | 空图；标题等其他字段照常读出 |
| 旧版双 Key 图片库含 `null` | 与旧正文 token 对齐：`[A, null, B]` 仍解析为 A / 空 / B |
| 新格式 `images` 字段不是数组，且磁盘上还留着旧图片库 | 新正文按空表处理，token 全部为空；**不会借用旧图片库的 B** |
| 图片数组完全损坏（全是非法项） | 榜单仍能打开，所有图片为空，标题与文字保留 |
| 整份 JSON 不是合法 JSON | 返回 `null`，不抛错（原有行为） |
| 页面切后台 `visibilitychange → hidden` | 延迟窗口内的最后修改立即落盘 |

结论：单张图片损坏不会导致整份榜单打不开，也不会把其他卡片的图片错配给当前卡片。

---

## 8. 移动端自动化检查是否真正成为 CI 门禁

### 8.1 本地门禁

- `scripts/mobile-check.mjs` 默认 `ASSERT = true`；只有显式 `--report-only` 才只报告。
- `package.json` 的 `mobile:check` 也显式带 `--assert`。
- 以下情况都会返回非零退出码：
  - Chrome 找不到（退出 2）
  - `dist-web/index.html` 缺失（退出 2）
  - Chrome 调试端口无响应（退出 2）
  - 脚本执行异常 / WebSocket 断开（退出 1）
  - 页面 10s 内没有加载出来（退出 1）
  - 布局溢出、元素越界、触控尺寸不达标、触屏交互失败（退出 1）
  - 一项检查都没执行（退出 1）
- 非阻断提示单独记录（当前 4 条，均为 844px 横屏沿用桌面密度），不影响退出码。
- 本轮开发过程中该脚本多次以退出码 1 拦下真实问题（例如一次运行有 32 个阻断问题，
  涉及触控尺寸、iPhone 面板出现下载按钮、坏图未提示等），最终才达到 270/270。

### 8.2 CI

`.github/workflows/ci.yml` 现在有三个 Job：

1. `check`：`npm ci` → `npm test` → `npm run docs:check`
2. `build`：`npm ci` → `npm run build` → `npm run build:web` → 上传 `dist-web` artifact
3. `browser`：下载 `dist-web` → 安装 `fonts-noto-cjk` → 定位 Chrome（找不到直接失败）
   → `npm run browser:check` → `npm run mobile:check`

桌面与移动端检查共用同一个 Job、同一次 Chrome 安装和同一份构建产物，不重复构建。
**限制：本轮已 push 并实际运行 GitHub Actions，CI 通过；第一次运行暴露的是测试环境差异，不是应用缺陷。**

- run `43862792619`：`check` / `build` 通过，`browser` 在移动端阶段失败。
  原因是 Linux headless Chrome 没有指针设备，桌面宽度也报告 `(hover: none)`，
  旧断言"桌面宽度被误判为 hover:none"把它判成阻断问题。
- 修复：该断言改为非阻断提示，并记录 `maxTouchPoints`；提交 `ff15f09`。
- run `43863488562`：`check`、`build`、`browser` 全部通过；`browser` Job 2m17s。
- 报告更新提交 `e4e33cb` 的 run `43864182365` 也通过（`browser` 1m44s）。
- 提示（非失败）：actions/checkout、setup-node、upload/download-artifact 仍使用 Node 20，
  Runner 给出弃用警告；Ubuntu 26 标签迁移也有提示，均不影响本轮结果。

---

## 9. 桌面端回归情况

`npm run browser:check` **34/34 通过**（17.9s），覆盖：

- 桌面启动、无白屏、无未捕获异常
- 标题编辑与刷新恢复
- 真实 BMP 上传 → FileReader → canvas → JPEG 重编码
- 项目库提交、跨档拖拽
- 分享弹窗、分享链接长度校验
- 快照保存 / 预览 / 恢复
- PNG 导出落盘（486,996 B）
- 分享链接往返与显示设置
- 移动端视口底部栏
- localStorage 不可用时的内存降级与常驻提示

桌面布局与鼠标交互未改动；触控尺寸调整都带 `md:` 回退（如 `h-11 md:h-9`）。

---

## 10. 真机测试情况

**没有做真机测试。** 当前环境没有连接 Android 设备（`adb` 未安装），也没有 iPhone / iPad，
没有 BrowserStack 之类的云真机。

因此以下内容**只验证到 Chromium 移动模拟层**，不能等同于真机：

- iOS Safari 真实的异步下载拦截、系统分享面板、"存储图像"落相册
- 微信 / QQ 内置浏览器真实的长按菜单与 `download` 忽略行为
- iOS 软键盘高度、`100dvh`、`visualViewport` 抬升的真实表现
- 刘海屏 / 圆角屏的真实 `env(safe-area-inset-*)` 数值（模拟环境为 0）
- 真实手指长按 220ms 的触发率、拖拽自动滚动的速度与手感
- Android Chrome 的真实下载目录与 JSON 导入
- 相册 / 相机系统选择器、真实剪贴板权限

因此本报告**不声称真机通过**；上述项目列入 §12。

---

## 11. Cloudflare 与 GitHub Pages 实际部署版本

| 项 | 实际值 |
|---|---|
| 本轮功能提交 / 部署源 | `e4e33cb`（后续仅报告文档更新，不改变 app 产物） |
| Cloudflare 最新 Production | 部署 ID `3b3c09c7-24c5-4c90-892c-8864f771e96c`，源提交 `e4e33cb`，分支 `main` |
| Cloudflare 线上主 JS | `assets/index-CtwJsM2z.js`（**包含本轮改动**） |
| GitHub Pages 最近部署 | workflow run `43864182304`，`success`，提交 `e4e33cb` |
| GitHub Pages 线上主 JS | `assets/index-CtwJsM2z.js`（**包含本轮改动**） |
| 本轮构建主 JS | `assets/index-CtwJsM2z.js`（632.94 kB） |
| 结论 | GitHub Pages 与 Cloudflare 均已更新到本轮版本 |

- Cloudflare 是 Direct Upload（`wrangler pages deploy`），没有接 Git 集成，push 不会自动更新它；
  本轮已在确认后手动执行 `npm run deploy:cf`。
- 本次 Cloudflare 部署：`✨ Success! Uploaded 6 files (4 already uploaded)`，
  预览地址 `https://3b3c09c7.hangla-9bk.pages.dev`，生产地址不变。
- GitHub Pages 由 `deploy-pages.yml` 在 push 后自动发布，run `43864182304` 已成功。
- `npm run live:check` 默认目标 `https://hangla-9bk.pages.dev/` **12/12 通过**；
  线上主 JS 已是 `index-CtwJsM2z.js`，不再是旧的 `index-S3QYH0ri.js`。
- 后续每次改完代码仍需手动执行 `npm run deploy:cf`（Direct Upload 的已知限制）。

---

## 12. 尚未解决的问题与已知限制

1. **真机未验证**：见 §10。iOS / Android / 微信的真实行为需要在发版前人工走一遍。
2. **CI 只在 push 上实际运行过**：run `43863488562` 已通过；`pull_request` 事件尚未触发验证。
   第一次运行还暴露了 Linux headless 的 `hover:none` 环境差异，已改为非阻断提示。
3. **横屏 ≥768px 仍沿用桌面密度**：844×390 下有 15 个工具栏控件为 32–38px，
   `mobile:check` 将其记为非阻断提示。这是既有产品决策（避免平板出现两套 UI），
   不是本轮新引入的问题；若要彻底解决，需要用 `pointer: coarse` 统一放大桌面工具条。
4. **原生开关 / 滑杆 / 取色器不参与几何判定**：开关轨道为 48×28，滑杆高度更小；
   它们由组件样式保证，未纳入 44px 硬标准。
5. **极端 PNG 拒绝路径没有浏览器级 E2E**：100000px 画布需要构造巨大的 DOM，
   当前用单元测试覆盖规划与提示；真实长图只验证到 27 / 30 档和 40000px 规划。
6. **软键盘是模拟的**：通过写入 `--kb-inset: 300px` 验证抽屉与粘底操作条会抬高，
   不是真实 iOS 键盘。
7. **滚动位置恢复、系统分享、返回键行为都在 Chromium 模拟层验证**：
   iOS Safari 的滚动锁定 / 恢复策略可能不同。
8. **图片上传"用户取消选择"没有可断言的状态**：取消文件选择器不会触发 `change`；
   本报告验证的是"文件损坏 / 解码失败"的恢复路径。
9. **toast 仍可能遮住抽屉中部的文字**：本次只断言不遮挡底部保存 / 取消按钮；
   toast 容器是 `pointer-events-none`，不会拦截点击。
10. **Cloudflare 不会随 push 自动部署**：本轮已手动部署 `3b3c09c7`，但后续每次
    push 后仍需执行 `npm run deploy:cf`；GitHub Pages 会自动发布，两者节奏不同。
11. **`package.json` 版本仍是 1.4.1**：本轮按质量加固处理，没有擅自升版本号。
12. **Actions 依赖的 Node 20 弃用提示**：checkout / setup-node / artifact 仍指向 Node 20，
    Runner 给出警告但不影响结果；后续升级到 v5 / v6 即可。

---

## 13. 结论

本轮不是"把移动端再做一遍"，而是把已知边界补齐：

- 移动端检查从"可选报告"变成默认失败门禁，并接入 CI 的独立浏览器 Job；
- 触控目标从三套阈值收敛为 44 / 40 / 32 三档，脚本、代码、报告使用同一套数字；
- 极端长图不再用最低像素比突破硬上限，放不下时明确拒绝而不是生成空白图；
- 保存面板按设备给入口：桌面 / Android 下载，iOS 分享，微信 / QQ 只提示长按；
- 存储图片表损坏时保留原始下标，不再把其他卡片的图片错配给当前卡片；
- 坏图解码失败不再被当成成功上传；
- 桌面端 34/34 回归通过，单位测试 281/281 通过；
- GitHub Actions CI run `43864182365` 通过；
- GitHub Pages 与 Cloudflare 都已更新到本轮版本，线上主 JS 为 `index-CtwJsM2z.js`。

**仍未完成**：真机测试。自动化、CI、桌面回归和线上部署都已完成；真机行为（iOS 系统分享、
微信长按、真实软键盘与安全区）仍需在发版前人工走一遍，不能把模拟层通过当成真机通过。
Cloudflare 的 Direct Upload 特性意味着以后每次 push 后还需要手动执行 `npm run deploy:cf`。
