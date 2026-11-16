# 夯拉榜 v1.4.0 移动端体验专项报告

> 执行日期：2026-11-16
> 基线：`1.3.0`（工程质量加固完成版）
> 交付版本：`1.4.0`
> 范围：移动端布局、触摸交互、弹窗与键盘、图片与文件能力、安全区与视口、移动端自动化验证。
> 本报告只写**实际量测到 / 实际执行过**的内容；没有真机验证的部分在 §8 明确标注。

---

## 1. 改造前发现的移动端问题

用 headless Chrome + CDP 在 9 种视口逐页量测（详见 §6），并逐张截图人工核对。改造前的问题：

| # | 页面 | 现象（实测） | 原因 | 影响 | 处理 |
|---|---|---|---|---|---|
| 1 | 全局顶栏 | 320 / 360px 顶栏高 **80px**，「编辑器」「模板」「我的排名」被拆成两行（一个字一行） | 内层 `flex-wrap` + 导航项没有 `whitespace-nowrap`，品牌 + 三项导航在 320px 放不下就换行 | 高：首屏被顶栏吃掉 14%，导航难读 | 单行紧凑顶栏（§4.1） |
| 2 | 档位行 | 卡片被压成「Chat…」「Claude」被裁切；每行只放得下一张卡 | 行内 2×2 工具条（4×26px）常显 + 右侧 `pr-[78px]` 预留；卡片默认 `flex-shrink:1` 被压缩，`truncate` 再截断 | 高：核心内容不可读 | 触屏收起工具条、卡片 `shrink-0 + max-w-full`、长名换行（§4.2） |
| 3 | 档位行 | 触摸时编辑 / 删除小按钮（28px）盖在名字上 | `@media (hover:none)` 把 `.chip-actions` 设为常显 | 高：既挡内容又难按 | 触屏隐藏，改为点卡片进编辑抽屉（§4.3） |
| 4 | 全局滚动 | 手指落在卡片上时页面**滚不动** | `.chip-drag { touch-action: none }` + `PointerSensor`，按下即锁定滚动 | 高：一屏全是卡片，无法正常浏览 | `MouseSensor + TouchSensor(长按 220ms)` + `touch-action: manipulation`（§4.4） |
| 5 | 编辑 / 档位弹窗 | 手机上仍是桌面居中框，内容一多就超出屏幕，保存按钮在屏幕外；输入框 14px，iOS 聚焦会自动放大页面 | `DialogContent` 无 `max-height`，固定 `w-[420px]` 居中；输入框字号 <16px | 高：表单无法完整操作 | 底部抽屉 + 内部滚动 + 粘底操作条 + 16px 输入（§4.5） |
| 6 | 全局 | 底部操作栏、toast、悬浮按钮没有让出安全区；`100vh` 在地址栏收起时多一截 | 缺 `viewport-fit=cover` / `env(safe-area-inset-*)` / `dvh` | 中：刘海屏 / 圆角屏遮挡 | 安全区 + `100dvh`（§4.6） |
| 7 | 编辑器 | 右下角全屏按钮压住档位卡片 / 项目库标题 | 桌面悬浮按钮在手机上照搬 | 中：遮挡内容 | 手机收进设置抽屉，仅「已隐藏导航」时浮出（§4.7） |
| 8 | 项目库 | 标题 + 180px 提示 + 144px 搜索 + 两个按钮挤在一行，320px 下换行凌乱 | 单行 `flex-wrap` 没有移动端分层 | 中：信息密度高、控件被挤 | 手机上标题行 + 全宽搜索行（§4.8） |
| 9 | 编辑器 | 标题是单行 input，320px 只能看到一半（示例榜单就有 20 字） | input 不换行，超出部分横向滚动 | 中：第一眼像被裁掉 | 自适应高度 textarea（§4.9） |
| 10 | 640px 横屏 | 项目库按钮 / 搜索框缩到 32px | 用了 `sm:`（640）切换紧凑尺寸 | 中：横屏手机又变成小目标 | 触控密度统一用 `md:`（768）（§4.10） |
| 11 | 图片 | 手机上编辑弹窗里的上传入口沿用桌面尺寸，进度只在 toast 里 | 弹窗没有移动端形态 | 中：上传反馈弱 | 抽屉内 64px 上传位 + 现有进度条（§4.5） |
| 12 | 我的排名 / 模板 / 预览 | 页面顶部间距偏大；预览页卡片可能横向溢出 | 容器 padding 沿用桌面；只读卡片 `max-w-[260px]` + `truncate` | 低 | 统一 `px-4 pt-6`、只读卡片 `max-w-full` + 换行（§4.2） |

> 说明：改造前 `document.scrollWidth - innerWidth === 0`，单看"页面级横向溢出"会漏掉问题 2/3/12——裁切发生在 `overflow:hidden` 的档位行**内部**。所以本次同时量了卡片右边界、控件尺寸，并逐张看图。

---

## 2. 根本原因

1. **桌面优先的断点选择**：`md`（768）以前只用来切换"工具条出现 / 底栏消失"，但导航、项目库、按钮密度用的是 `sm`（640）甚至无断点，导致 320–430px 直接复用桌面排版。
2. **以"鼠标 hover"为默认交互**：编辑 / 删除 / 档位工具条都靠 hover 出现；触屏兜底是"常显 26–28px 小按钮"，既挡内容又不达标。
3. **拖拽传感器与滚动冲突**：`PointerSensor` 需要 `touch-action:none` 才能在触摸上工作，代价是卡片区域完全不能滚动。二者只能换方案，不能靠加 `preventDefault` 修。
4. **弹窗没有移动端形态**：`DialogContent` 是固定宽度 + 垂直居中 + 无最大高度；桌面够用，手机上内容超出视口就没有出口。
5. **没有把"视口"当成动态量**：`100vh`、缺 `viewport-fit`、缺安全区、缺软键盘高度处理。
6. **输入框字号**：iOS Safari 对 <16px 的输入框会在聚焦时放大整个页面，这是布局跳动的直接原因。
7. **单行 input 承担标题**：桌面勉强够用，窄屏必然截断。

---

## 3. 修改的文件与内容

### 3.1 布局与样式

| 文件 | 修改 |
|---|---|
| `index.html` | viewport 增加 `viewport-fit=cover`、`interactive-widget=resizes-content` |
| `src/index.css` | `100dvh` 回退；`--kb-inset`；`.chip-drag` 改 `touch-action: manipulation`；触屏隐藏 `.row-tools` / `.chip-actions`；手机弹窗底部抽屉（`92dvh`、内部滚动、把手、安全区）；触屏输入框 16px（含 iPad `pointer:coarse`）；`html[data-kb="1"]` 时隐藏底栏；`scroll-padding-bottom` |
| `src/components/TopBar.tsx` | 单行顶栏：logo 32/34、导航 44px 高、`whitespace-nowrap`、`md` 以上恢复桌面尺寸；品牌按钮 42×40 命中区 |
| `src/components/TierRow.tsx` | 标签列 88 / 104 / 176px 三档；触屏去掉 `pr-[78px]`；只读行同步；只读卡片 `max-w-full` + 换行 |
| `src/components/ItemChip.tsx` | 根节点 `shrink-0 max-w-full`；名称手机换行 / 桌面截断；点卡片进编辑（仅触屏）；拖拽后 350ms 内吞掉 click；触屏关闭双击删除 |
| `src/components/Pool.tsx` | 手机两行布局（标题 + 操作、全宽搜索）；按钮 40px；提示文案区分触屏 / 鼠标 |
| `src/components/TitleBlock.tsx` | `input` → 自适应高度 `textarea`，Enter 结束编辑，换行替换为空格 |
| `src/components/ui/button.tsx` | 手机 44px / 桌面 36px（`h-11 md:h-9`），`sm` 40/28，`icon` 44/36 |
| `src/components/ui/dialog.tsx` | 桌面 `max-h` + 内部滚动；聚焦输入框后延迟 `scrollIntoView` |
| `src/components/DisplaySettings.tsx` | 开关 48×28（桌面 36×20）；分段按钮手机加高；滑杆增加触摸高度 |
| `src/components/FancySelect.tsx` | 触发器手机 40px / 桌面 36px |
| `src/pages/EditorPage.tsx` | 底栏 56px + 安全区；页面底部 `calc(112px + safe)`；全屏按钮手机上仅在"已隐藏导航"时出现，抽屉新增全屏入口；抽屉关闭按钮 40px |
| `src/pages/MinePage.tsx` / `TemplatesPage.tsx` / `PreviewPage.tsx` | 移动端 padding 与安全区 |

### 3.2 交互与逻辑

| 文件 | 修改 |
|---|---|
| `src/components/TierBoard.tsx` | `PointerSensor` → `MouseSensor(distance 6) + TouchSensor(delay 220, tolerance 8)`；键盘传感器保留 |
| `src/components/ItemDialog.tsx` | 编辑态新增「位置」2×2（上移 / 下移 / 上一档 / 下一档）、删除 + 二次确认、粘底操作条、16px 输入、移动端上传 |
| `src/components/TierEditDialog.tsx` | 新增档位「上移 / 下移」、粘底操作条、16px 输入 |
| `src/store/board.ts` | 新增 `nudgeItem(id, ±1)`、`shiftItem(id, ±1)`（含档位 / 项目库边界与容量校验） |
| `src/lib/drag.ts` | 新增 `locateItem()`（条目的容器 / 下标 / 档位下标） |
| `src/App.tsx` | `visualViewport` 监听，写入 `--kb-inset` 与 `data-kb`（`scale > 1.05` 时视为缩放、不抬升） |
| `src/components/Toaster.tsx` / `ImageProgress.tsx` | 底部位置让出安全区 |

### 3.3 测试与文档

- 新增 `scripts/mobile-check.mjs`（9 视口布局量测 + 44 项触屏交互，零依赖 CDP）。
- `src/store/board.test.ts` +9 例（nudge / shift / 边界 / 容量 / 撤销 / 档位排序）。
- `src/lib/drag.test.ts` +2 例（`locateItem`）。
- `package.json` 新增 `browser:check` / `mobile:check`；版本 `1.4.0`。
- `README.md` / `README_EN.md`：移动端特性、手机拖拽 FAQ、两个检查脚本、结构树。
- `AGENTS.md`：触屏目标、拖拽传感器、弹窗形态、输入框字号、断点选择的硬约定。
- `ROADMAP.md`：v1.4 记录。

**没有改**：数据模型、存储层、迁移、分享协议、评级规则、桌面布局与配色。

---

## 4. 移动端布局与交互方案

### 4.1 顶栏：单行优先

- `<768`：logo 32px + 三项导航（图标 + 文字，44px 高，`whitespace-nowrap`，`px-1.5`）。实测 320px 仍单行，顶栏 57px。
- `≥768`：恢复原来的品牌文字、导航 `py-2`、右侧完整工具条（桌面不变）。
- 安全区：`pt-[env(safe-area-inset-top)]`（Safari 普通浏览为 0，PWA / 刘海屏生效）。

### 4.2 档位与卡片

- 标签列从固定 104px 改为 **88 / 104 / 176px**（<640 / <768 / ≥768），320px 下给卡片多留 16px。
- 触屏不再为行内工具条预留 78px。
- 卡片 `shrink-0 max-w-full`：不再被 flex 压缩；名字在手机换行（`overflow-wrap:anywhere`），桌面仍是单行省略号。
- 只读预览同步规则。
- 实测：320px 两张大卡并排完整显示；40 字条目名换行不越界（`right 344 ≤ parentRight 357`）；16 字档位名在 88px 列内换行，行高 202px 但无横向溢出。

### 4.3 触屏操作路径（不依赖 hover / 拖拽）

- **点卡片** → 编辑抽屉（仅 `hover:none`；桌面保持悬停小按钮）。
- 抽屉里 44px 按钮：上移 / 下移 / 移到上一档 / 移到下一档 / 删除（二次确认）。
- **点档位名** → 档位弹窗：改名 / 换色 / 上移 / 下移 / 删除。
- 拖拽仍在，作为快捷方式；两条路径都写进 README FAQ。
- 触屏关闭了"双击删除"，避免连点两下打开编辑时误删。

### 4.4 拖拽与滚动

- `MouseSensor(distance:6)`：桌面手感与原来一致（真实浏览器拖拽回归通过）。
- `TouchSensor(delay:220, tolerance:8)`：长按 0.2 秒才抓起；手指移动超过 8px 视为滚动，取消拖拽。
- `.chip-drag` 从 `touch-action:none` 改为 `manipulation`，普通滑动可以滚页面。
- 拖拽反馈：`DragOverlay` 放大 1.04 + 阴影（原有）。
- 自动滚动：沿用 dnd-kit 默认的 `autoScroll`（未关闭）；**未单独做自动化断言**（见 §9）。

### 4.5 弹窗：手机底部抽屉

- `≤639px`：`.dlg-content` 全宽贴底、圆角 20px、顶部把手、`max-height: calc(92dvh - var(--kb-inset))`、内部滚动、`overscroll-contain`、底部安全区。
- 桌面：仍居中 420px 卡片，新增 `max-h-[calc(100dvh-2rem)]` 与内部滚动（内容多时不再顶出屏幕）。
- 编辑 / 档位弹窗的操作条 `sticky bottom-0`：320×568 下内容可滚动，操作条始终在可视区（实测 footer bottom 551 ≤ 568）。
- 键盘：`visualViewport` 差值写入 `--kb-inset`，抽屉整体抬高；输入框聚焦后延迟 `scrollIntoView`；Android 上键盘弹出时固定底栏自动隐藏。
- 输入框：触屏 ≥16px（含 iPad），标题除外。

### 4.6 安全区与动态视口

- `viewport-fit=cover` + `env(safe-area-inset-bottom)`：底栏、抽屉、toast、进度条、全屏按钮。
- `min-height: 100vh` 后追加 `100dvh`。
- 底栏 56px + 安全区；页面底部留 `calc(112px + safe)`，最后一张卡不会被底栏压住。

### 4.7 导航与低频入口

- 手机保留：底部 4 个高频操作（添加项目 / 预览 / 分享 / 设置）+ 顶栏 3 个页面入口。
- 全屏（直播 / 录屏）是低频：收进设置抽屉；隐藏后右上角浮出"恢复导航"按钮，不会把自己锁死。
- 桌面工具条原样保留，不重复塞进手机顶栏。

### 4.8 项目库

- 手机：第一行标题 + 添加 / 图片按钮，第二行全宽搜索，第三行一行提示。
- 桌面：恢复单行（标题 + 提示 + 搜索 + 按钮）。
- 触屏提示改为「点条目可编辑（长按后拖动）」，不再宣传双击删除。

### 4.9 标题

- 自适应高度 textarea，按内容换行、自动长高；Enter 结束编辑并收起键盘；粘贴的换行替换为空格。
- 桌面也受益：长标题不再被单行 input 截断。

### 4.10 断点策略

- 触控密度（按钮高度、输入字号、底栏、抽屉）统一用 **768** 作为分界；640 横屏仍是手机尺寸。
- 768 以上沿用桌面工具条与密度（鼠标优先），但 `hover:none` 的触屏仍走"点卡片编辑 / 隐藏 hover 工具条"的路径。

---

## 5. 新增及修改的测试

### 5.1 单元测试（vitest）

| 文件 | 新增 | 覆盖 |
|---|---:|---|
| `src/store/board.test.ts` | +11 | `nudgeItem` 档位内 / 项目库内上下移、两端返回 false、`shiftItem` 跨档 / 回项目库 / 第一档边界、目标档位满时拒绝、移动可撤销、`moveTier` 上下移与边界 |
| `src/lib/drag.test.ts` | +2 | `locateItem` 的容器 / 下标 / 档位下标 / 不存在 id |
| 合计 | **236 例**（原 223） | 全部通过 |

### 5.2 移动端浏览器检查（新增 `scripts/mobile-check.mjs`）

**布局量测**：9 视口 × 4 页面 = 36 组，逐组断言：

- `document.scrollWidth - innerWidth ≤ 0`（页面级横向溢出）
- 排除屏幕外导出画布后，无元素越出视口
- 触屏宽度下无 <32px 的可点区域
- 顶栏高度、底栏高度、档位行高度 / 标签列宽度

视口：320×568、360×740、375×812、390×844、430×932、**640×360（横屏）**、768×1024、**844×390（横屏）**、1024×768。

**触屏交互**：390×844（真实触摸事件，非鼠标模拟），共 44 项：

1. 点卡片 → 底部抽屉（位置 / 宽度 / 可滚动）
2. 抽屉内按钮 / 输入框 ≥36px
3. 「移到下一档」→ 条目确实换档
4. 删除 → 二次确认 → 条目消失
5. 长按 220ms 拖拽 → 跨档成功
6. 弹窗内上传 BMP → FileReader → canvas → JPEG，提交入项目库
7. 分享抽屉贴底、全宽、内容正确
8. 设置抽屉控件 ≥36px、含全屏入口
9. **移动端导出 PNG 落盘（491,119 B）**
10. 4 风格 × 2 明暗预览无横向溢出（8 项）
11. 最大字号 24 / 图片 96 / 间距 32 / 歪斜 45 组合无溢出
12. 40 字条目名换行不越界
13. 档位「下移」生效（顶级 / 夯 互换）
14. 16 字档位名在 88px 列内换行
15. 320px 抽屉可滚动、粘底操作条可见
16. 抽屉输入框 16px
17. 我的排名：快照卡片不溢出、按钮 ≥36px
18. 移动端导出 JSON 落盘
19. 移动端导入 JSON → 新快照，且不覆盖编辑器

### 5.3 桌面回归

`npm run browser:check` 原有 34 项全部通过（上传 / 拖拽 / 分享往返 / 快照恢复 / PNG / 存储降级 / 移动端视口）。

---

## 6. 实际执行的命令与结果

| 命令 | 结果 |
|---|---|
| `npm run test` | **10 文件 / 236 例全部通过**，0 失败，1.4s |
| `npm run docs:check` | 锚点 / 双语 / 事实三项全过（命令集已含 `browser:check`、`mobile:check`） |
| `npm run build` | 成功，`dist/index.html` **2,233,941 B**（gzip 1,374.16 kB） |
| `npm run build:web` | 成功，主 JS **624,147 B**（gzip 202.15 kB）、CSS 47,840 B、字体 1,150,924 B、3 个页面 chunk、导出 chunk 13.75 kB |
| `npm run browser:check` | **34/34 通过**，17.9s |
| `npm run mobile:check` | **44/44 交互断言通过**，36 组布局量测 0 问题，退出码 0 |

体积对比 1.3.0：单文件 +13.3 KB（+0.6%），网页版主包 +8.7 KB（+1.4%）。无新增运行时依赖（两份检查脚本是 dev 工具，零依赖）。

---

## 7. 已验证的屏幕尺寸与浏览器

| 项 | 内容 |
|---|---|
| 浏览器 | Google Chrome **157.0.8103.52**（Windows，headless=new） |
| 视口 | 320×568、360×740、375×812、390×844、430×932、640×360、768×1024、844×390、1024×768 |
| 输入方式 | CDP `Input.dispatchTouchEvent`（`touchStart` / `touchMove` / `touchEnd`）+ `Emulation.setTouchEmulationEnabled`；桌面为鼠标事件 |
| 触摸媒体查询 | 移动视口下 `(hover: none)` / `(pointer: coarse)` 生效（触屏 CSS 分支被实际执行） |
| 导出 | `Browser.setDownloadBehavior` 实际落盘 PNG / JSON 并校验大小 |
| 页面 | 编辑器、模板库、我的排名、只读预览（含 8 套主题的分享预览） |

---

## 8. 真实手机测试情况

**没有做真机测试。** 当前环境只有桌面 Windows + Chrome，没有 iOS / Android 设备，也没有 BrowserStack 之类的云真机。

因此以下项目**只验证到 Chromium 移动模拟层**，不能等同于真机：

- iOS Safari 的软键盘遮挡、`100dvh` 行为、`visualViewport` 抬升效果
- 刘海屏 / 圆角屏的真实安全区数值（模拟环境下 `env(safe-area-inset-*)` 为 0）
- iOS 的 `position: sticky` 粘底操作条与滚动锁定
- 真实手指长按 220ms 的触发率、拖拽自动滚动
- 相册 / 相机的系统选择器
- 移动端分享链接复制（`navigator.clipboard` 权限）

上线前建议在 1 台 iPhone（Safari）和 1 台 Android（Chrome）上按 §5.2 的 19 条路径走一遍。

---

## 9. 尚未解决的问题与已知限制

| # | 问题 | 原因 / 风险 | 处理与建议 |
|---|---|---|---|
| 1 | 真机未验证 | 见 §8 | 发版前人工走查；本报告不声称真机通过 |
| 2 | 拖拽自动滚动未单独断言 | dnd-kit 默认开启，但自动化里没有构造"拖到屏幕边缘停住"的用例 | 已保留默认 `autoScroll`；真机验证时重点看 |
| 3 | 768px 以上沿用桌面密度（36px） | 桌面工具条与鼠标优先，避免平板出现两套 UI | iPad 触屏路径可用（点卡片编辑 / 无 hover 依赖），但目标偏小；后续可按 `pointer:coarse` 统一放大 |
| 4 | 桌面 hover 小按钮 20px | 1.2 起的既有设计，本次不改桌面视觉 | 低于 WCAG 2.5.8 的 24px 建议值；键盘 / 触屏均有替代路径，列入后续优化 |
| 5 | 软键盘抬升依赖 `visualViewport` 启发式 | iOS 键盘动画期间 `innerHeight - vv.height` 可能有 1 帧误差；捏合缩放已排除 | 需真机确认；若不稳可改为只做 `scrollIntoView` |
| 6 | toast 可能短暂盖住打开的抽屉 | toast 的 `z-index` 高于弹窗（既有行为） | 影响 2 秒左右；后续可在弹窗打开时把 toast 移到顶部 |
| 7 | 超长档位名会让行变得很高 | 16 字是上限，换行是正确行为；行高 202px | 属于极端数据，未裁切；如需可限制为 2 行 + 省略号 |
| 8 | 分享链接复制未在移动模拟中点击 | 无剪贴板权限，点了会走兜底 | 桌面逻辑未改；真机验证时补一条 |
| 9 | 横屏 ≥768 会切成桌面工具条 | 宽度足够，工具栏能放下 | 属预期；若希望横屏也用底栏，可改为 `pointer:coarse` 判定 |

---

## 10. 结论

- 手机端已从"把桌面缩小"改为独立布局：单行顶栏、可读的档位卡片、底部抽屉、44px 触控区、长按拖拽 + 非拖拽备用路径。
- 320 / 360 / 375 / 390 / 430 / 640 / 768 / 844 / 1024 九种视口、四个页面、36 组布局量测全部无横向溢出、无 <32px 触控目标。
- 44 项触屏交互断言全部通过，包含跨档拖拽、换位、删除、上传、分享、PNG / JSON 导出导入、8 套主题。
- 桌面端 34 项真实浏览器回归全部通过，布局与交互未退化。
- 真机（iOS Safari / Android Chrome）尚未验证，已在 §8 / §9 明确列出，不声称已完成。

---

## 11. v1.4.1 补记：导出 PNG 在真机上的两个坑

> 这一节是上线后收到的真实反馈（"电脑端能导出，手机上点了没反应"）的根因记录。
> 它同时说明 §8 的结论为什么重要：**同一段代码在 Chromium 移动模拟层里是通的**，
> `npm run mobile:check` 的"PNG 落盘"断言当时也是绿的。

### 11.1 症状

手机点「导出 PNG」后，界面提示"已导出 PNG，去下载目录看看"，但相册、「文件」、下载目录里都没有图；
微信里打开则完全没有任何反馈。

### 11.2 根因一：iOS / 内置浏览器不接受程序化下载

原实现：

```ts
const dataUrl = await toPng(node, { pixelRatio: 2 });
const a = document.createElement("a");
a.href = dataUrl;
a.download = `${timestamp()}-${name}-排行榜.png`;
a.click();               // 游离节点 + data URL，且在 await 之后
```

- **iOS Safari**：`await` 已经用掉了用户手势（transient activation），之后对游离 `<a>` 的 `click()`
  会被静默拦截；`data:` URL 的 `download` 本身也不可靠。
- **微信 / QQ / 微博等内置浏览器**（WKWebView / X5）：`download` 属性被忽略，点了什么都不发生。

两者都不会抛错，所以代码照常走到 `toast("已导出 PNG")`——这就是"假成功"。

### 11.3 根因二：长榜单超过 iOS 画布上限

固定 2 倍像素比时，导出画布 1200px 宽、27 个档位高度 2892px，生成 **2400×5784** 的位图。
iOS 的画布上限是单边 4096、面积约 16.7M 像素，超限时得到的是空白图或下半截被裁掉的图。
（实测：默认 5 档 → 2400×1384 正常；27 档 → 直接越界。）

### 11.4 修复

| 措施 | 位置 |
|---|---|
| 按设备能力分通道：桌面 / Android 直接下载，iOS 与内置浏览器先出保存面板 | `src/lib/saveImage.ts` `pickSaveChannel()` |
| 下载一律用 Blob + 真实挂载到文档里的 `<a>`，不再用 data URL | `downloadBlob()` |
| 保存面板提供「保存 / 分享」（系统分享，可存相册）与「直接下载」，并提示可长按保存 | `src/components/SaveImageDialog.tsx` |
| 像素比按单边 4096 / 面积 16M 自适应，向下取整避免 4096 顶成 4106 | `exportPixelRatio()` |
| 非「艺术」档位标签时 `skipFonts`，省掉 1.1MB 字体的 base64 | `exportBoardPng()` |
| 分享弹窗预览改用 Blob 对象地址，下载同源分流 | `ShareDialog.tsx` |
| 移动端导出前先收起设置抽屉，避免两层弹窗抢焦点 | `EditorPage.tsx` |

### 11.5 验证

- `src/lib/saveImage.test.ts`：13 例，钉住 iPhone / iPadOS 桌面 UA / 微信 / Android / 桌面 的通道判定，
  以及 1200×780、1200×2892、1200×8000 等尺寸不越界。
- `npm run mobile:check`：新增 iPhone UA 用例——点「导出 PNG」必须弹出带图片的保存面板，
  面板里点「直接下载」仍能落盘。
- 实测同一份 27 档榜单：修复前 2400×5784（越界），修复后 1692×4077（安全），体积 2.31MB → 1.31MB。
- 桌面端普通榜单仍输出 2400px 宽，画质未降。

### 11.6 仍然存在的限制

- iPhone / Android 真机仍未实测；`navigator.share` 是否真的调起系统面板取决于设备与系统版本，
  失败时会回落到"长按图片保存"的提示，这条路任何手机浏览器都支持。
- 保存面板里的「保存 / 分享」在桌面 Chrome 上不可用（`canShare({files})` 为 false），
  桌面本来就走直接下载，不会看到这个面板。
