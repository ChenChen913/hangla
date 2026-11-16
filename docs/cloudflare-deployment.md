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
| 最近部署 | **2026-11-16**，源提交 `2fbab8c`（v1.4.1），部署 ID `6335258f` |
| 当前仓库版本 | `1.4.1`（含 v1.3 存储加固、v1.4 移动端改造） |
| 状态 | **已更新**：线上产物与仓库 `2fbab8c` 一致，HTTP 200，缓存头与安全头生效，`live:check` 12/12 通过 |
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
npm run mobile:check    # 9 视口 + 44 项触屏交互
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

## 4. 回滚

| 方式 | 命令 / 位置 |
|---|---|
| 控制台回滚 | Cloudflare Dashboard → Workers & Pages → `hangla` → Deployments → 选上一版 → Rollback |
| 命令行查看历史 | `npx wrangler pages deployment list --project-name hangla` |
| 删除项目（不可逆） | `npx wrangler pages project delete hangla` |
| 代码回滚 | `git revert` 后重新 `npm run deploy:cf`；GitHub Pages 走正常 revert + push |

## 5. 已知限制

1. **Direct Upload 不跟 git push 联动**：每次改完代码必须手动 `npm run deploy:cf`（或后续接 Git 集成 / CI）。
   `npm run deploy:cf` 会重新构建，所以线上永远是"当时的工作区"而不是"远端 HEAD"——部署前先确认 `git status` 干净、`git log -1` 是你要发的提交。
2. **没有自定义域名**：目前只有 `*.pages.dev`。绑定域名后要改 canonical / og:url / og:image。
3. **双站并存**：Cloudflare 与 GitHub Pages 内容相同；canonical 已指向 Cloudflare，GitHub Pages 作为备用可继续保留。
4. **凭据**：11-14 会话中曾明文提供 Cloudflare Token / R2 Key / GitHub PAT，记录里标注为「待确认轮换」。如果还没轮换，建议在控制台吊销旧 Token，新建一个仅 `Pages:Edit` 的 Token 用于部署。
5. **构建环境**：旧记录提到 Windows 祖先 `node_modules/@types` 污染会导致 `TS2688`；本次在仓库自己的目录里 `npm ci` 后构建正常，无需临时 tsconfig。若再遇到，优先用干净环境 / `typeRoots` 指向项目自身。
