# 夯拉榜 v1.3.0 质量加固报告

> 执行日期：2026-11-16
> 基线：`1.2.1`（`7273816`）
> 交付版本：`1.3.0`
> 范围：存储与启动安全、数据边界、导入、图片、分享、显示一致性、历史栈、文档自动化、回归验证。
> 本报告只记录**实际执行过**的命令与结果；没有跑过的验证会明确标注。

---

## 1. 本次修改总览

### 1.1 改了哪些模块

| 模块 | 文件 | 性质 |
|---|---|---|
| 启动与旧档迁移 | `src/main.tsx`、`src/lib/legacy.ts`（新） | 重写 |
| 存储层 | `src/lib/storage.ts` | 重写（双 Key → 单 Key 原子写） |
| 数据规范化 | `src/lib/utils.ts`、`src/types.ts` | 扩充上限、新增 `normalizeDisplay` |
| Store | `src/store/board.ts`、`src/store/ui.ts` | 新增导入 action、快照 display、历史重置、上限保护 |
| 图片 | `src/lib/images.ts` | 有限并发、进度、失败隔离 |
| 分享 | `src/lib/share.ts`、`src/components/ShareDialog.tsx` | 先估长再编码、异步编码、display 随链接 |
| 预览 / 快照 | `src/pages/PreviewPage.tsx`、`src/pages/MinePage.tsx` | 显示设置一致性、导入安全 |
| UI | `StorageNotice`、`ImageProgress`（新）、`TitleBlock`、`ItemDialog`、`TierEditDialog`、`EditorPage` | 降级横幅、进度、输入上限 |
| 文档校验 | `scripts/check-facts.mjs`、`scripts/project-facts.json`（新）、`scripts/check-i18n.mjs` | 新增事实校验 |
| 浏览器回归 | `scripts/browser-check.mjs`（新） | 零依赖 CDP 驱动真实 Chrome |

### 1.2 解决了哪些问题

1. 存储不可用（隐私模式 / 禁用站点数据）时模块顶层抛错导致**整页白屏**。
2. 可用性探测只读不写，造成**"看起来在保存、其实每次都失败"**。
3. 双 Key 存档的**回滚不可靠**与**多标签页交错错配**。
4. 「配额已满但存档还在」被误判为存储不可用，会把已有数据**藏到空的内存后端后面**（自审阶段发现并修正）。
5. `item.name` / `tier.name` / `tilt` / id 无上限，极端数据可撑坏布局或让 `transform` 失效。
6. JSON 导入无文件大小门槛；用「临时覆盖编辑器再还原」实现，污染撤销栈。
7. `FileReader` 缺 `onerror` / `onabort`，读失败时 Promise **永久挂起**，批量上传永不结束。
8. 批量图片串行处理、无进度；每次入库都可能触发整份写盘。
9. 分享**先生成完整链接再判长度**，5MB 榜单要先生成 ~7MB 字符串。
10. `display` 不随分享 / 快照走：接收者、PNG、预览各看各的外观。
11. 撤销栈是模块级单例，测试之间互相污染；导入会往历史里塞两条假记录。
12. README 数字无人校验（两份一起写错也发现不了）。

### 1.3 保持不变

- 技术栈：React 19 + TypeScript + Vite + Tailwind CSS 4 + Zustand + dnd-kit + Motion，零新增运行时依赖。
- 产品功能：5 套评级模式、4 风格 × 2 明暗、拖拽、项目库、图片重编码、撤销重做、PNG、分享、JSON、快照、单文件离线构建、Pages 构建、v2 迁移、旧分享链接。
- 路由（HashRouter）、双构建（`dist/` + `dist-web/`）、`persist version: 10`（原因见 §5.2）。
- 存档内容结构（`Board` / `Snapshot` 字段）没有破坏性变更：`display` 是**可选新增字段**。

### 1.4 架构变化（只有两处）

1. **存档信封**：`hangla.v3` 正文 + `hangla.v3::images` 图片库 → `hangla.v3` 内单个 JSON：
   `{ __hangla: 2, images: string[], value: StorageValue }`。
2. **分享 / 快照携带显示设置**：分享 payload 在 Board 顶层增加可选 `display`；`Snapshot` 增加可选 `display`。
   两者都向后兼容（缺省 = 沿用本机设置 / 不恢复外观）。

---

## 2. 问题与根因

### 2.1 存储不可用时白屏

- **现象**：浏览器禁用站点数据 / 隐私模式下打开页面，`#root` 为空，控制台一条 `SecurityError`。
- **根因**：v2 迁移写在 `main.tsx` 模块顶层，直接 `localStorage.getItem(...)`。模块求值阶段抛错 → `createRoot(...).render` 根本没执行。
- **原实现**：`if (localStorage.getItem("hangla.v3")) return;` 之外没有任何保护。
- **现实现**：迁移逻辑移入 `src/lib/legacy.ts`，统一走 `probeStorage()`；任何一步失败都返回 `false`。`main.tsx` 另外补了 `#root` 缺失的兜底。
- **为什么**：存储是否可用是运行时事实，不能在模块顶层假设。抽成函数后还能被单元测试覆盖（7 例）。

### 2.2 可用性探测只读不写 → 假持久化

- **现象**：某些环境下每次修改都"成功"，刷新全丢；只在控制台看到配额错误。
- **根因**：`pickBackend()` 只 `getItem` 一个探针键就认定可用。
- **原实现**：`localStorage.getItem("__hangla_probe__")` 不抛错 → 返回 localStorage。
- **现实现**：`probeStorage()` 三步：读能力 → 是否已有存档 → 无存档时试写探针。失败返回内存后端 + `mode`。
- **为什么**：读和写是两种权限，Safari 无痕、企业策略、配额为 0 都可能只卡写。

### 2.3 「配额满但有存档」被误判 → 数据看起来消失（自审发现）

- **现象**：第一版新探测在配额满时试写探针失败 → 判为内存模式 → 启动读到空内存 → 用户看到默认榜单。
- **根因**：把"写不进新数据"等同于"存储不可用"，忽略了读仍然正常。
- **原实现**（本轮中间版本）：`try { setItem(probe) } catch { return memory }`。
- **现实现**：`probeStorage()` 先看 `STORAGE_KEY`（以及迁移时的 v2 键）是否已有数据；有数据就直接用 localStorage，写失败交给 `onWriteError` 提示"存储已满"。
- **为什么**：配额满是可恢复故障（删几张图即可），不能因为写失败就把用户已有数据藏起来。测试 `配额已满但存档还在时仍然用 localStorage` 钉住。

### 2.4 双 Key 事务的回滚不可靠

- **现象**：极端情况下图片串位 / 整份存档读不出来。
- **根因**：正文与图片库分两个 key，只能靠"先写正文、失败再把正文写回旧值"维持一致。三个洞：
  1. 回滚本身可能失败（配额满时最需要回滚，也最可能写不进去）；
  2. 两个标签页交错写（A 写正文 → B 写正文+图库 → A 写图库）能稳定错配；
  3. 正文写成功、图库失败后进程被杀，连回滚机会都没有。
- **原实现**：`setItem(name, body)` → `setItem(bankKey, bankBody)` → catch 里 `setItem(name, prevBody)`。
- **现实现**：正文与图片表放进同一个 JSON，一次 `setItem`。失败时磁盘上仍是上一份完整存档，**没有任何回滚动作可失败**。
- **为什么**：一致性靠"原子写"而不是"失败后补偿"，后者在配额满的场景下天然不可靠。测试覆盖：写失败、连续两次失败、失败后恢复、两标签页交错、pagehide 强制写入。

### 2.5 旧图片库损坏 / 索引越界

- **现象**：图片库 JSON 坏掉时，整份存档读不出来，或图片变成空白。
- **根因**：`loadBank` 解析失败直接 `bank = []`，正文里的 `\u0000img:N` 全部解析成 `undefined`。
- **现实现**：旧格式读取时把越界 / 损坏的引用解析成 `""`（UI 按"没有图"处理），榜单文字与快照结构保留；新格式不再有独立图片库。普通字符串里出现 `\u0000img:` 字样不会被误判（用 `^\u0000img:(\d+)$` 严格匹配）。
- **为什么**：图片可以重传，榜单文字不能。损坏时优先保住结构。

### 2.6 数据边界缺失

- **现象**：导入一份构造过的 JSON，标题/档位名几千字，页面被撑爆；`tilt: 1e9` 让卡片飞出屏幕。
- **根因**：`BOARD_LIMITS` 只有 title / subtitle / desc，`item.name`、`tier.name`、`tilt`、id 长度、全档位条目总量都没有上限；`normalizeDisplay` 不存在。
- **原实现**：`name: r.name` 原样保留；`tilt: typeof r.tilt === "number" ? r.tilt : undefined`（`NaN` 也是 number）。
- **现实现**：新增 `tierName 16` / `itemName 60` / `id 64` / `tilt ±45` / `totalItems 3000`；按**码点**截断（emoji 不会被切成半个）；`normalizeDisplay` 把字号、图片尺寸、间距、歪斜、字重、字体枚举全部夹回面板范围；`setTitle` / `setSubtitle` / `updateItem` / `updateTier` / `setDisplay` 走同一套规范化。
- **为什么**：上限要按真实布局定——档位标签列固定 190px、字号 36px，16 个汉字已经要折 4 行；条目名有 220px 省略号，60 足够；3000 条是 DOM 还能承受的量级。

### 2.7 JSON 导入

- **现象**：导入 200MB 文件页面卡死；导入失败后撤销栈多出两条奇怪的历史。
- **根因**：`file.text()` 之前没有任何体积检查；为了"只存快照"，代码临时把导入数据写进编辑器、保存快照、再 `setState(prev)` 还原——这会触发两次 persist、两条历史。
- **原实现**：`store.importBoard(board); store.saveSnapshot(); useBoard.setState(prev);`
- **现实现**：8MB 文件上限；读取 / 解析 / 规范化全程有明确 toast；新增 `importBoardAsSnapshot(raw)`，只往 `snapshots` 里加一条，**完全不碰编辑器与历史**。
- **为什么**：导入是"往资料库加一份"，不是"切换当前榜单"。用专用 action 表达这个语义，比"改完再改回来"可靠。

### 2.8 FileReader 生命周期

- **现象**：某张图读取失败后，"正在处理 N 张图片"永远不消失，后续批次也不再有反应。
- **根因**：`readFileAsDataURL` 只写了 `onload`；`onerror` / `onabort` 时 Promise 永远 pending，批量循环卡死。
- **现实现**：`onload`（空结果也 reject）、`onerror`、`onabort`、同步抛错四条路径都 settle；settle 后清空三个回调。
- **为什么**：Promise 必须保证"一定会结束"，否则上层 `try/catch` 和 `finally` 都不会执行。

### 2.9 批量图片

- **现象**：一次选 20 张要等很久；处理完可能触发多次整份写盘。
- **现实现**：最多 3 张并发（`runPool`），结果按原始下标回填保证顺序；单张失败独立跳过并计数；进度写内存态（`ImageProgress`）；整批只调用一次 `addImagesToPool`。
- **为什么**：串行太慢，无限并发会让手机 OOM；合并写库避免每次几百 KB 的序列化。

### 2.10 分享编码顺序

- **现象**：含图榜单点「分享」会卡两三秒，然后才提示"太长了"。
- **根因**：`buildShareUrl` 先完整 `JSON.stringify + base64`，之后 `shareLengthInfo` 才判长度。
- **现实现**：`planShare` 三步：`estimateShareChars`（结构下界，不序列化）→ `measureShareChars`（JSON + 字节计数，不做 base64）→ 确认没超 200 万字符才编码；超过 5 万字符走分片异步编码。
- **为什么**：先花 O(n) 的便宜代价判断"值不值得编码"，避免生成注定被丢弃的巨大字符串。测试用 `btoa` 间谍证明超限时**一次编码都没有发生**。

### 2.11 显示设置的归属

- **现象**：同一份榜单，分享者看到的（以及导出的 PNG）和接收者打开链接看到的不是一套外观；快照预览和恢复后也不一致。
- **根因**：`display` 只存在本机 store，既不进分享 payload 也不进快照。
- **现实现**（明确策略）：
  - **本机偏好**：编辑器里的显示设置仍然是全局的、持久的。
  - **成品携带**：快照与分享链接各存一份保存/分享那一刻的 `display`。
  - **预览**：快照用自己的 → 分享用分享者的 → 旧数据回落到本机设置。
  - **恢复 / 复制到编辑器**：连 `display` 一起应用（确认弹窗写明）。
  - **撤销**：只回退榜单内容，不回退外观（有测试钉住，并在 README FAQ 写明）。
- **为什么**：PNG 已经烘焙了分享者的外观，链接预览必须一致，否则"分享"这件事本身不成立。

### 2.12 撤销栈隔离与语义

- **现象**：测试结果偶尔取决于执行顺序；导入后按撤销会出现"导入的榜单又回来"。
- **根因**：`undoStack` 是模块级单例，没有重置入口；导入用两次 `set` 完成，各记一条历史。
- **现实现**：导出 `resetHistory()` 并在测试 `beforeEach` 调用；导入改走 `importBoardAsSnapshot`（零历史）；补齐连续输入合并、撤销后清空 redo、删档 / 跨档拖拽 / 恢复快照 / 恢复示例的整步撤销、50 步淘汰、重新水合清空。
- **为什么**：历史是"用户操作序列"，不是"状态差异日志"。数据导入不是对当前榜单的编辑。

### 2.13 文档事实无人校验

- **现象**：`check-i18n` 只比较两份 README 的命令字符串是否相同，两份一起写错也能通过。
- **现实现**：`scripts/project-facts.json` 作为唯一来源；`check-facts.mjs` 校验数字、`npm run` 命令真实存在、在线地址与 `package.json` 一致；`src/lib/facts.test.ts` 校验配置与代码常量（预设数、风格数、快照上限、分享阈值、图片边长、存储键）一致。
- **为什么**：把"可验证事实"和"自然语言语义"分开：前者机器钉死，后者继续靠人 / AI 评审。

---

## 3. 文件修改清单

### 3.1 新增

| 文件 | 原因 |
|---|---|
| `src/lib/legacy.ts` | v2 迁移从入口抽出，可测试、存储不可用时可安全跳过 |
| `src/lib/legacy.test.ts` | 迁移的 7 个分支（含读取抛错） |
| `src/components/StorageNotice.tsx` | 内存降级时常驻提示"刷新会丢" |
| `src/components/ImageProgress.tsx` | 批量图片进度 |
| `src/lib/images.test.ts` | 并发上限、顺序、失败隔离、单次写库、进度 |
| `src/lib/facts.test.ts` | 文档事实 ↔ 代码常量 |
| `scripts/project-facts.json` | README 事实唯一来源 |
| `scripts/check-facts.mjs` | 文档数字 / 命令 / 链接校验 |
| `scripts/browser-check.mjs` | 零依赖 CDP 真实 Chrome 回归（可选，不进 CI） |
| `docs/quality-hardening-report.md` | 本报告 |

### 3.2 修改

| 文件 | 原因 |
|---|---|
| `src/main.tsx` | 迁移改为调用 `migrateLegacyBoard()`；`#root` 缺失兜底 |
| `src/lib/storage.ts` | 单 Key 原子写；四步探测；`mode`；`STORAGE_KEY` 下沉 |
| `src/lib/storage.test.ts` | 测试改为注入 backend；新增故障注入 / 旧格式 / 回收 / 删除交错 / 配额满 |
| `src/lib/utils.ts` | 上限、`normalizeDisplay`、码点截断、分享估长/测量/异步编码、FileReader 生命周期 |
| `src/lib/utils.test.ts` | 边界、display、分享体量、FileReader 测试 |
| `src/lib/share.ts` | `planShare` / `planShareSync` / `shareBase`；保留旧导出 |
| `src/lib/share.test.ts` | 编码前拦截、长度分档、中文/图片往返 |
| `src/lib/images.ts` | 有限并发、进度、单次写库、名称截断 |
| `src/store/board.ts` | `MAX_SNAPSHOTS`、`importBoardAsSnapshot`、快照 display、上限保护、`resetHistory`、migrate 规范化 |
| `src/store/board.test.ts` | 历史隔离/边界、快照 display、导入、编辑上限 |
| `src/store/ui.ts` | 图片进度状态 |
| `src/types.ts` | `Snapshot.display?` |
| `src/App.tsx` | 降级横幅 + 进度条挂载 |
| `src/components/ShareDialog.tsx` | 异步规划、超限时不编码、文案 |
| `src/components/TitleBlock.tsx` / `ItemDialog.tsx` / `TierEditDialog.tsx` | 输入 `maxLength` 与上限对齐 |
| `src/pages/EditorPage.tsx` | 副标题上限 |
| `src/pages/MinePage.tsx` | 导入体积检查、只存快照、恢复提示 |
| `src/pages/PreviewPage.tsx` | 分享 display、复制应用 display |
| `scripts/check-i18n.mjs` | 命令必须真实存在于 `package.json` |
| `package.json` / `package-lock.json` | 版本 1.3.0；`docs:check` 接入 facts |
| `README.md` / `README_EN.md` | 存储格式、显示设置归属、导入上限、结构树、开发命令 |
| `AGENTS.md` | 存储访问 / 存档格式 / 规范化 / display 归属 / 事实来源五条硬约定 |
| `ROADMAP.md` | v1.3 记录 |

### 3.3 删除

无源文件删除。`src/lib/history.ts` 未改动（历史语义变化在 `board.ts` 的调用侧）。

---

## 4. 测试报告

### 4.1 数量

| 测试文件 | 加固前 | 加固后 | 新增 |
|---|---:|---:|---:|
| `src/lib/storage.test.ts` | 8 | 25 | +17 |
| `src/lib/utils.test.ts` | 22 | 49 | +27 |
| `src/lib/share.test.ts` | 6 | 13 | +7 |
| `src/store/board.test.ts` | 19 | 42 | +23 |
| `src/lib/images.test.ts` | 0 | 12 | +12 |
| `src/lib/legacy.test.ts` | 0 | 7 | +7 |
| `src/lib/facts.test.ts` | 0 | 6 | +6 |
| `src/lib/history.test.ts` | 12 | 12 | 0 |
| `src/lib/label.test.ts` | 52 | 52 | 0 |
| `src/lib/drag.test.ts` | 5 | 5 | 0 |
| **合计** | **124（7 文件）** | **223（10 文件）** | **+99** |

### 4.2 实际执行的命令与结果

在 `npm ci` 之后按顺序执行：

| 命令 | 结果 |
|---|---|
| `npm ci --no-audit --no-fund` | 成功，`added 220 packages in 1m` |
| `npm run test` | **10 文件 / 223 例全部通过**，失败 0，用时 1.36s |
| `npm run docs:check` | 三项全通过：锚点（12 标题 × 2）、双语（11 章节 / 5 图 / 6 命令）、事实（5 套评级 / 4×2=8 主题 / 30 快照 / 8000 字符 / 640px / `hangla.v3`） |
| `npm run build` | 成功，`dist/index.html` 2,220,602 B（gzip 1,370.75 kB） |
| `npm run build:web` | 成功，`dist-web/`：index.html 1.31 kB、主 JS 615,434 B（gzip 199.68 kB）、CSS 43,676 B、字体 1,150,924 B、页面 chunk 2,806 / 4,043 / 5,074 B、导出 chunk 13,750 B |

体积对比 1.2.0 基线（`facts.md`）：单文件 +10.5 KB（gzip +3.9 KB），网页版主包 +8.8 KB（gzip +3.1 KB）。增量来自新组件、`normalizeDisplay`、`planShare`、`legacy` 与文档常量，没有新增依赖。

### 4.3 新增测试覆盖的关键点（验证的是结果，不是"没抛异常"）

- **存储**：写失败后 `map.get(NAME)` **逐字节等于旧值**，且新建一个 storage 实例仍能读出旧档；连续两次失败同样成立；两标签页交错后读到的仍是最后一次完整写入；pagehide 触发后延迟窗口内的数据落盘；旧图片库损坏时正文仍可读。
- **边界**：超长名称按码点截断、`tilt: NaN/1e9` 的落点、重复/超长 id、3000 条全局预算、`normalizeDisplay` 的每个夹紧分支。
- **导入**：导入前后 `state().tiers` **引用不变**、`history.past` 不变、快照内容经过规范化。
- **分享**：超过 200 万字符时 `btoa` 间谍**零调用**；`measureShareChars` 与真实编码长度相等；被截断的链接返回 `null`。
- **图片**：峰值并发 == 3、完成顺序打乱但入库顺序不变、单张失败不影响其余、整批 `pool` 只变一次。
- **历史**：每个用例开始时 `history == {0,0}`；连续输入合并为 1 步；撤销后编辑清空 redo；50 步上限；`rehydrate()` 后清空。
- **快照**：保存记录 display、恢复还原 display、撤销恢复快照不回退 display、旧快照不覆盖本机 display。

### 4.4 真实浏览器验证

`node scripts/browser-check.mjs`（headless Chrome，CDP，零依赖）**34/34 通过，18.1s**：

| 分组 | 覆盖项 |
|---|---|
| 启动 | 桌面渲染、无未捕获异常 / console.error |
| 持久化 | 标题编辑 → 刷新 → 仍存在（真实 localStorage + 水合） |
| 图片 | 真实 `<input type=file>` 上传 40×24 BMP → FileReader → canvas → JPEG（比例保留、1,171 字符）、新项目入库 |
| 拖拽 | CDP 鼠标事件驱动 dnd-kit，ChatGPT 从第 1 档移到第 2 档 |
| 分享 | 弹窗打开、链接在长度校验通过后才可用、复制按钮状态 |
| 分享往返 | 用独立实现构造 payload（隐藏图片 + 间距 30px）→ 打开 `#/r/...` → 标题/内容正确、`img` 数量 0、容器 `gap=30px` → 复制到编辑器 → store 里 `showImages=false` |
| 快照 | 保存 → 列表出现 → 预览 → 恢复到编辑器（内容与 display 一起回到保存时） |
| 导出 | 点击导出 PNG → 真实下载文件 486,996 B |
| 移动端 | 390×844 视口下底部栏 4 个入口可见 |
| 存储降级 | 注入 `localStorage` 写入抛错 → 不白屏、编辑器可用、常驻「刷新页面后会丢失」提示、编辑无异常 |

**没有做的浏览器验证**（不声称已完成）：

- 真机 iOS Safari / Android Chrome 的触摸拖拽（CDP 只模拟指针事件）。
- 真实多标签页并发写（单元测试用两个 storage 实例模拟，不是两个浏览器标签）。
- 浏览器在会话中途回收存储配额（无法稳定构造）。
- 系统字体差异导致的 PNG 与预览字形差异（同一台机器上一致，跨设备无法保证）。

---

## 5. 数据兼容性报告

### 5.1 逐项结论

| 数据 | 结论 | 说明 |
|---|---|---|
| 1.2.x 当前存档（`hangla.v3` + `::images`） | **兼容** | `getItem` 识别旧格式：正文 + 独立图片库；首次成功写入后转成单 Key，并删除旧图片库 |
| v2（vanilla）存档 `hangla.state.v2` | **兼容** | `migrateLegacyBoard()`；v3 已存在时不覆盖；损坏 / 读不到时安全跳过 |
| 旧分享链接（无 `display`） | **兼容** | 解码为 `display: null`，按打开者本机设置渲染（与旧行为一致） |
| 旧分享链接（`#d=` 形式） | **兼容** | `main.tsx` 重写为 `#/r/` |
| 旧快照（无 `display`） | **兼容** | 只恢复榜单内容，不改本机显示设置 |
| 带图片的榜单 / 快照 | **完整** | 图片表在同一个 JSON 内；旧格式 token 解析失败时只丢该图，不丢榜单 |
| 非法 JSON / 超大 JSON | **拒绝** | 解析失败 / 超过 8MB 都有明确提示，编辑器不变 |
| 迁移失败 | **不破坏原档** | 读失败 → 不写；写失败 → 磁盘保持上一份完整存档；回滚动作已不存在 |

### 5.2 为什么 persist version 仍是 10

`version` 描述的是 **persist 的 state 形状**。本次 state 的字段只增不减（`Snapshot.display?` 为可选），
`migrate` 仍能把旧 state 规范化为新 state，所以没有升版本的必要。

变的是**存储适配器的信封**（双 Key → 单 Key），这层对 zustand 透明，也由 `getItem` 的兼容分支处理。
升 version 会强制所有老用户跑一次 `migrate`（并因此截断超长字段），收益是零，风险反而更高。

### 5.3 已知的回滚风险（必须知道）

如果用户在 1.3.0 写入过数据后，又用 **1.2.x 的旧代码**打开同一站点：

- 旧代码会把新信封 `{__hangla:2,...}` 当成 `StorageValue`，读不到 `state`，显示默认榜单；
- 旧代码下一次写入会用旧的双 Key 格式覆盖 `hangla.v3`，新版本再打开时只能按旧格式解析，
  而 `::images` 已被删除 → **图片丢失**。

缓解：不要把线上版本回滚到 1.2.x；确需回滚时，先让用户「导出 JSON」。
彻底解决需要换 key（`hangla.v4`）或做双向格式兼容，两者都会带来配额翻倍或长期维护成本，
本次判断不值得，列入 §6 观察项。

---

## 6. 尚未解决的问题

| # | 问题 | 原因 | 风险 | 临时处理 | 后续建议 |
|---|---|---|---|---|---|
| 1 | 回滚到 1.2.x 会读不懂新存档 | 信封格式变化，旧代码无兼容分支 | 中（只在回滚时发生） | 不回滚；回滚前导出 JSON | 若确需长期双版本共存，改用新 key 并保留一个版本的只读兼容 |
| 2 | 多标签页仍是 last-writer-wins | 没有字段级合并 / CRDT | 低（同时编辑同一榜单很少见） | `storage` 事件重新水合，至少不会越走越远 | 需要时引入 per-tab 版本号 + 冲突提示 |
| 3 | 超大图解码内存 | `img.onload` 前无法得知像素数；20MB 文件可能解出 8000×8000 | 低（并发 3 + 20MB 上限缓解） | 并发限制 + 最长边 640 重编码 | 用 `createImageBitmap` + `resizeWidth` 做流式降采样 |
| 4 | 图片表损坏只能丢图 | 像素数据没有冗余 | 低 | 保留榜单结构，图片退化为空 | 可选：导出 JSON 时把图片一起带走（已是现状） |
| 5 | 分享 > 200 万字符只能下载 PNG | 没有短链服务（README 已注明 TODO） | 低 | 复制按钮禁用 + 明确提示 | 接短链后端后只需改 `buildShareUrl` |
| 6 | 跨设备字体差异 | PNG 依赖系统字体栈 | 低 | 导出使用与页面相同的字体栈 | 内嵌可选字体子集（体积代价大） |
| 7 | 触摸拖拽 / iOS 存储回收未真机验证 | 当前环境只有桌面 Chrome | 中 | CDP 鼠标事件 + 单元测试覆盖逻辑 | 发版前用真机跑一遍 §4.4 的清单 |
| 8 | 键盘操作拖拽未做端到端验证 | dnd-kit 已配置 KeyboardSensor | 低 | 代码路径存在，未写测试 | 补一条键盘拖拽的浏览器用例 |

---

## 7. 最终结论

- **是否通过本次质量加固**：通过。§2 记录的 13 类问题全部按根因修复，每一项都有对应测试；223 个单元测试与 34 项真实浏览器检查全部通过。
- **是否可以正常构建**：可以。`npm run build` 与 `npm run build:web` 在 `npm ci` 之后均成功，产物体积增量 < 0.5%。
- **是否可以正常部署**：可以。`base: "./"`、HashRouter、Pages 工作流均未改动；构建产物结构与 1.2.1 一致。
- **是否有待人工验证事项**：有，且未声称已完成——真机 iOS / Android 的触摸拖拽、真实多标签页并发、会话中途存储回收、跨设备字体差异（见 §4.4、§6）。
- **是否还有数据安全风险**：正常使用与升级路径上没有已知的静默丢数据路径；唯一中风险项是「回滚到 1.2.x」（§5.3），已明确记录并给出缓解方式。
