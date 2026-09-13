# 夯拉榜 · 从夯到拉排行榜生成器

一个"从夯到拉"排行榜（Tier List）生成器。**React 19 + TypeScript + Vite + Tailwind CSS 4 + Zustand + dnd-kit + Motion** 构建，支持导出高清 PNG、生成分享链接、保存多个榜单快照。

> "从夯到拉"是中文网络流行的本土化分级评价体系：**夯**（天花板）＞ 顶级 ＞ 人上人 ＞ NPC ＞ **拉完了**（烂到底）。万物皆可排。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | React 19 | UI 与交互 |
| 语言 | TypeScript (strict) | 全量类型 |
| 构建 | Vite 6 | 秒级 HMR / 构建 |
| CSS | Tailwind CSS 4 | `@theme inline` + CSS 变量驱动主题 |
| UI 基础组件 | shadcn/ui 风格（Radix Dialog + cva） | Button / Dialog 按需手写 |
| 拖拽 | dnd-kit | 跨档位拖拽、档内排序、DragOverlay |
| 动画 | Motion | 拖拽浮层弹性、路由切换、Toast |
| 图标 | Lucide React | |
| 状态管理 | Zustand 5 | persist 中间件 → localStorage，v2 旧档自动迁移 |
| 图片导出 | html-to-image | DOM 节点直接转高清 PNG |
| 路由 | React Router 7（HashRouter） | 编辑器 / 模板 / 我的排名 / 预览分享 |
| 部署 | Vercel | 已带 vercel.json，推上去即可 |

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 开发（http://localhost:5173）
npm run build      # 构建单文件版 → dist/index.html（JS/CSS 全内联）
```

| 场景 | 用法 |
|---|---|
| 日常使用 | 双击 `dist/index.html`（单文件，双击即用、可发给别人） |
| 开发 | `npm run dev` |
| 部署 | 推到 GitHub → Vercel 导入仓库即可（已带 vercel.json；HashRouter 无需重写规则） |

## 功能

- **四个页面**：编辑器 `/` · 模板库 `/templates` · 我的排名 `/mine` · 预览分享 `/preview`、`/r/:data`
- **评级模式一键互切**：从夯到拉 / SSR 稀有度 / 竞技梯度 T0-T4 / 经典 S~D；手工改动自动标记为"自定义"
- **项目卡**：图片 + 名称 + 一句话描述；hover 出现编辑 / 删除角标；「添加项目」弹窗支持上传 Logo
- **档位编辑弹窗**：点击档位名即可改名称 / 描述 / 图标（emoji）/ 颜色 / 删除——「从夯到拉」只是默认模板
- **拖拽**：项目在项目库 ↔ 各档位间自由拖动，跨档实时换位，档内拖动排序，拖拽浮层带弹性动画
- **分享弹窗**：自动生成分享卡片预览，一键复制链接 / 下载 PNG
- **导出 PNG**：html-to-image 对隐藏导出画布截图，2x 高清，配色跟随主题
- **项目库（未排名）**：搜索过滤、快速文字回车、图片批量入池
- **标题 + 副标题**：编辑器、预览页、导出图三处同步
- **双主题**：清爽亮色（默认）/ 曜黑工作台，一键切换，导出与预览跟随
- **响应式**：桌面 / 平板 / 移动端（移动端底部固定操作栏：添加项目 / 预览 / 分享）
- **数据持久化**：Zustand persist → localStorage（key `hangla.v3` v4 结构），v2/v3 旧档与旧分享链接自动迁移兼容

## 目录结构

```
hangla/
├── index.html
├── vite.config.ts          # react + tailwindcss + viteSingleFile 插件
├── vercel.json
├── src/
│   ├── main.tsx            # 入口：v2 存档迁移、旧分享链接兼容
│   ├── App.tsx             # HashRouter + 路由切换动画
│   ├── index.css           # Tailwind 4 + @theme inline 主题变量
│   ├── types.ts
│   ├── store/
│   │   ├── board.ts        # Zustand：榜单数据/操作/快照 + persist
│   │   └── toast.ts
│   ├── lib/
│   │   ├── presets.ts      # 评级模式预设
│   │   ├── themes.ts       # 视觉主题注册表（页面 + 导出配色）
│   │   ├── images.ts       # 图片读取/压缩入池
│   │   └── utils.ts        # cn/uid/颜色/编解码/剪贴板
│   ├── components/
│   │   ├── ui/             # shadcn 风格 Button / Dialog
│   │   ├── TopBar.tsx      # 品牌导航 + 评级/风格切换 + 动作
│   │   ├── TierBoard.tsx   # DndContext + 跨容器拖拽逻辑
│   │   ├── TierRow.tsx     # 档位行（droppable）+ 工具条
│   │   ├── ItemChip.tsx    # 可排序条目卡
│   │   ├── Pool.tsx        # 素材池
│   │   ├── ExportBoard.tsx # 导出画布（屏幕外渲染）
│   │   ├── TitleBlock.tsx
│   │   └── Toaster.tsx
│   └── pages/
│       ├── EditorPage.tsx
│       ├── PreviewPage.tsx
│       ├── TemplatesPage.tsx
│       └── MinePage.tsx
├── legacy/                 # v2 纯 vanilla 版本留档（可删）
├── dist/index.html         # 构建产物：单文件演示版
├── ROADMAP.md              # 开发规划（后续风格与功能，必读）
└── README.md
```

## 实现备注（踩过的坑）

- **dnd-kit 多容器**：碰撞检测用 `pointerWithin` 优先（指针在哪个容器就算哪个），`closestCorners` 在空档位 + 素材池场景下会被 chip 抢走 `over`；`onDragEnd` 里补了跨容器兜底移动。
- **html-to-image + 视口外节点**：导出节点用 `position:fixed; left:-9999px` 挂载时，克隆会保留偏移导致截图全空——导出前临时把节点移入视口，完成后还原。
- **单文件 + 路由**：用 HashRouter 而非 BrowserRouter，`vite-plugin-singlefile` 产物才能在 `file://` 下双击直用，Vercel 上也无需重写规则。

## 后续计划

见 [ROADMAP.md](ROADMAP.md)——抽象梗风/简洁亮色/赛博霓虹主题、解说排行榜视频、多人投票、题材模板库等。
