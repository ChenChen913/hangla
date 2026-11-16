# Cloudflare Pages 部署记录

> 记录时间：2026-11-16（本次重新部署已完成）
> 对应版本：`1.4.1`（移动端专项 + 工程质量加固）
> 本文件不包含任何 Token / 密钥 / Account ID。

## 1. 现状

| 项 | 值 |
|---|---|
| Cloudflare 项目名 | `hangla` |
| 生产地址 | **https://hangla-9bk.pages.dev/** |
| 部署方式 | Direct Upload（`wrangler pages deploy`），**没有接 Git 集成** |
| 最近一次应用代码自动部署 | **2026-11-16**，源提交 `36069a4`，部署 ID `677fb02c`（首次自动部署成功） |
| 当前仓库版本 | `1.4.1`（含 v1.3 存储加固、v1.4 移动端改造与本轮真机兼容加固） |
| 状态 | **自动部署已启用**：线上主 JS `index-PrOmxocu.js`，与本地构建一致；`live:check` 14/14 通过。文档提交也会触发部署，但主 JS 不变 |
| 备用站 | https://chenchen913.github.io/hangla/（GitHub Pages，push 自动发布） |

### 重要：不要写成 `hangla.pages.dev`

`hangla.pages.dev` 是**另一个同名站点**（canonical 指向 `wbk2705.win`），和本项目无关。
本项目创建时 `hangla` 这个名字已被占用，Cloudflare 分配的后缀是 `-9bk`：

- ✅ 本项目：`https://hangla-9bk.pages.dev/`
- ❌ 不是本项目：`https://hangla.pages.dev/`

`wrangler pages project list` / 部署输出里的 `*.pages.dev` 才是准的，不要按项目名拼域名。

## 2. 这次补上的部署相关文件

| 文件 | 作用 |
|---|---|
| `public/404.html` | 自定义 404（HashRouter 用 static 模式，未知路径需要真正的 404 页；GitHub Pages 也认这个文件） |
| `public/_headers` | Cloudflare 专用响应头：`/assets/*` 一年 immutable；全站 nosniff / referrer-policy / X-Frame-Options |
| `public/og-image.png` | 社交分享预览图（2400×1316，取自导出成品截图） |
| `index.html` | 增加 canonical、`og:url`、`og:image`、`twitter:card`、`robots` |
| `package.json` | `homepage` 指向 Cloudflare；新增 `npm run deploy:cf` |
| `README.md` / `README_EN.md` | 首屏在线体验、线上部署表、项目结构 |

> canonical / `og:url` / `og:image` 目前都指向 `https://hangla-9bk.pages.dev/`。
> 以后绑定自定义域名时，这三处要一起改（`index.html` 头部有注释）。

## 3. 重新部署

### 3.1 认证

本次已通过 `npx wrangler login` 完成 OAuth 登录（凭据保存在本机 `~/.wrangler`，**不要提交**）。
换机器或登录过期时二选一：

```sh
# A. OAuth 登录（推荐，不在聊天里传密钥）
#    会在浏览器打开授权页，点 Allow 即可；注意 wrangler 只等 2 分钟，超时需重跑
npx wrangler login

# B. 使用 API Token（Pages:Edit 权限）
#    PowerShell: $env:CLOUDFLARE_API_TOKEN = "…"
#    或在 CI 里作为 secret 注入
```

### 3.2 构建 + 上传

```sh
npm ci
npm run deploy:cf
# 等价于：npm run build:web && npx wrangler pages deploy dist-web --project-name hangla --branch main
```

部署前确认当前目录是仓库根（Wrangler 的 source commit 取 cwd）。

### 3.3 部署后验收

```sh
# 1) 首页 / 标题 / 资源
curl -sI https://hangla-9bk.pages.dev/

# 2) 404
curl -s -o /dev/null -w "%{http_code}\n" https://hangla-9bk.pages.dev/__not_found__

# 3) 新功能是否在线（v1.4 的编辑抽屉文案）
#    浏览器打开后在手机视口点卡片，应出现「编辑项目」底部抽屉

# 4) 线上冒烟：直接打生产地址（默认取 project-facts.json 的 demoUrl）
npm run live:check
# 换个地址：LIVE_URL=https://xxx.pages.dev/ npm run live:check

# 5) 本地可重复的完整检查
npm run browser:check   # 桌面 34 项
npm run mobile:check    # 9 视口布局 + 触屏交互门禁（关键项失败退出非 0）
```

### 3.4 本次部署记录（2026-11-16）

```
✨ Success! Uploaded 8 files (2 already uploaded) (3.31 sec)
✨ Deployment complete! Take a peek over at https://6335258f.hangla-9bk.pages.dev
```

| 项 | 结果 |
|---|---|
| 部署 ID | `6335258f-ae0a-4425-841f-18966dd51a18`（Production / `main`） |
| 源提交 | `2fbab8c`（v1.4.1） |
| 上传文件 | 8 个（新增 `404.html`、`_headers`、`og-image.png`） |
| 首页 | 200，`<title>夯拉榜 · 从夯到拉排行榜生成器</title>`，canonical / og:image 均指向本站 |
| 资源 | `index-BUy--tqN.js` 与本地 `dist-web` **同名同内容**（Vite 内容哈希可证），`Cache-Control: public, max-age=31536000, immutable` |
| 安全头 | `x-content-type-options: nosniff`、`x-frame-options: SAMEORIGIN`、`referrer-policy: strict-origin-when-cross-origin` |
| 404 | `/no-such-page` 返回 **404** 并渲染自定义 `404.html`（3279 B） |
| 线上冒烟 | `npm run live:check` **12/12**：桌面/手机无横向溢出、底部栏 4 项贴底、触屏点卡片开全宽抽屉、存储被禁不白屏且有常驻提示、`#/mine` 深链接直达、无未捕获异常 |

> `wrangler pages deployment list --project-name hangla` 可随时核对，最新一条应是 Production / `main`。
>
> 2026-11-16 后续又部署了 `c327090`（保存面板修复）、`1fb5dbb`（导出超时保护）
> 与 `e4e33cb`（移动端质量加固）。截至本轮检查，最新 Production 为 `e4e33cb` /
> 部署 ID `3b3c09c7`，线上主 JS 为 `index-CtwJsM2z.js`，`live:check` 12/12 通过。

### 3.5 本轮移动端质量加固部署（2026-11-16）

```
✨ Success! Uploaded 6 files (4 already uploaded) (4.12 sec)
✨ Deployment complete! Take a peek over at https://3b3c09c7.hangla-9bk.pages.dev
```

| 项 | 结果 |
|---|---|
| 部署 ID | `3b3c09c7-24c5-4c90-892c-8864f771e96c`（Production / `main`） |
| 源提交 | `e4e33cb`（工作区质量加固 + 报告） |
| 线上主 JS | `assets/index-CtwJsM2z.js`（632.94 kB），与本地 `dist-web` 同名同内容 |
| 生产地址 | https://hangla-9bk.pages.dev/ ，HTTP 200 |
| 线上冒烟 | `npm run live:check` **12/12** |
| GitHub Pages | run `43864182304` 成功，同为 `index-CtwJsM2z.js` |

### 3.6 GitHub Actions 自动部署（当前已启用）

`.github/workflows/ci.yml` 已包含 `deploy-cloudflare` 与 `smoke` 两个 Job。
2026-11-16 已配置 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 与
`CF_DEPLOY_ENABLED=true`，并重跑 main CI（run `43870168356`）验证：
`deploy-cloudflare` 与 `smoke` 均通过，首次自动部署 ID 为 `677fb02c`。
以后只有 `main` push 才会部署，PR 仍然不会部署生产环境。

启用需要两项 GitHub Secrets 与一个仓库变量：

| 名称 | 类型 | 内容 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Secret | Cloudflare API Token，权限至少 `Pages:Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Cloudflare Account ID（不是项目名） |
| `CF_DEPLOY_ENABLED` | Repository variable | 设为 `true` 才启用自动部署 |

配置方式（不要在聊天 / 仓库里粘贴密钥）：

```sh
# 本机执行时按提示粘贴值
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID

# 启用自动部署
gh variable set CF_DEPLOY_ENABLED --body true
```

未配置时，`cloudflare-disabled` Job 会在 main push 后输出 warning 与 Step Summary，
明确说明"质量检查通过，但生产部署未执行"；这是提示，不是部署成功。

如果需要人工审批，可在 GitHub 仓库 Settings → Environments → `production` 配置
Required reviewers。手动部署与回滚方式不变，见 §3.2 / §4。

### 3.7 真机兼容与发布流程部署（2026-11-16）

```
✨ Success! Uploaded 5 files (5 already uploaded) (5.94 sec)
✨ Deployment complete! Take a peek over at https://cb245a0c.hangla-9bk.pages.dev
```

| 项 | 结果 |
|---|---|
| 部署 ID | `cb245a0c-1d52-479d-aae2-2a8a271907d2`（Production / `main`） |
| 源提交 | `21ff5e4`（PR #1 合并，应用代码提交 `cfdb640`） |
| 线上主 JS | `assets/index-PrOmxocu.js`（633.56 kB），与本地 `dist-web` 一致 |
| 生产地址 | https://hangla-9bk.pages.dev/ ，HTTP 200 |
| 线上冒烟 | `EXPECT_ASSET=index-PrOmxocu.js npm run live:check` **14/14** |
| GitHub Pages | 应用代码部署 run `43868173655` 成功，同为 `index-PrOmxocu.js` |
| 自动部署 | **已启用**：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`CF_DEPLOY_ENABLED=true` 已配置；首次自动部署 `677fb02c`，`deploy-cloudflare` 与 `smoke` 均通过 |

## 4. 回滚

| 方式 | 命令 / 位置 |
|---|---|
| 控制台回滚 | Cloudflare Dashboard → Workers & Pages → `hangla` → Deployments → 选上一版 → Rollback |
| 命令行查看历史 | `npx wrangler pages deployment list --project-name hangla` |
| 删除项目（不可逆） | `npx wrangler pages project delete hangla` |
| 代码回滚 | `git revert` 后重新 `npm run deploy:cf`；GitHub Pages 走正常 revert + push |

## 5. 已知限制

1. **Direct Upload 默认仍是手动**：未配置 CI Secrets / `CF_DEPLOY_ENABLED` 时，
   每次改完代码必须手动 `npm run deploy:cf`。手动命令会重新构建，所以线上是"当时的工作区"；
   部署前先确认 `git status` 干净、`git log -1` 是你要发的提交。
   启用 §3.6 的自动部署后，CI 使用当前提交的 `dist-web` 产物，并校验 `deploy-meta.json` 的 SHA。
2. **没有自定义域名**：目前只有 `*.pages.dev`。绑定域名后要改 canonical / og:url / og:image。
3. **双站并存**：Cloudflare 与 GitHub Pages 内容相同；canonical 已指向 Cloudflare，GitHub Pages 作为备用可继续保留。
4. **凭据**：11-14 会话中曾明文提供 Cloudflare Token / R2 Key / GitHub PAT，记录里标注为「待确认轮换」。如果还没轮换，建议在控制台吊销旧 Token，新建一个仅 `Pages:Edit` 的 Token 用于部署。
5. **构建环境**：旧记录提到 Windows 祖先 `node_modules/@types` 污染会导致 `TS2688`；本次在仓库自己的目录里 `npm ci` 后构建正常，无需临时 tsconfig。若再遇到，优先用干净环境 / `typeRoots` 指向项目自身。

## 6. 统一发布事实

- 静态部署事实（生产地址、Cloudflare 项目名、GitHub Pages 地址）放在
  `scripts/project-facts.json`，由 `npm run docs:check` 校验；README 的线上地址与 `package.json` 的
  `homepage` 必须一致。
- 动态事实（仓库 HEAD、最近应用代码提交、两站线上主 JS、最近 CI / Pages 运行）用：

```sh
npm run release:info            # 打印
npm run release:info -- --json  # 机器可读
npm run release:info -- --check # 校验两站线上主 JS 是否等于本地构建
```

- 本文件里的部署 ID、源提交、run ID 是**部署当时的快照**；如果与 `release:info` 不一致，
  以 `release:info` 与线上 HTML 为准，并更新本文件。
- Cloudflare 的部署 ID 需要 `wrangler pages deployment list --project-name hangla` 读取，
  `release:info` 不强制依赖 wrangler 登录，因此该字段仍由人工记录。
