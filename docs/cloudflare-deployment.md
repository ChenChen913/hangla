# Cloudflare Pages 部署记录

> 记录时间：2026-11-16
> 对应版本：`1.4.1`（移动端专项 + 工程质量加固）
> 本文件不包含任何 Token / 密钥 / Account ID。

## 1. 现状

| 项 | 值 |
|---|---|
| Cloudflare 项目名 | `hangla` |
| 生产地址 | **https://hangla-9bk.pages.dev/** |
| 部署方式 | Direct Upload（`wrangler pages deploy`），**没有接 Git 集成** |
| 上次成功部署 | 2026-11-14，源提交 `7273816`（v1.2.1） |
| 当前仓库版本 | `1.4.1`（含 v1.3 存储加固、v1.4 移动端改造） |
| 状态 | 线上可访问（HTTP 200，Cloudflare 边缘，安全头正常），但**内容落后两个版本**，待重新部署 |
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

`wrangler` 当前**未登录**（11-14 用的临时 Token 已按记录删除）。二选一：

```sh
# A. OAuth 登录（推荐，不在聊天里传密钥）
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

# 4) 本地可重复的完整检查
npm run browser:check   # 桌面 34 项
npm run mobile:check    # 9 视口 + 44 项触屏交互
```

## 4. 回滚

| 方式 | 命令 / 位置 |
|---|---|
| 控制台回滚 | Cloudflare Dashboard → Workers & Pages → `hangla` → Deployments → 选上一版 → Rollback |
| 命令行查看历史 | `npx wrangler pages deployment list --project-name hangla` |
| 删除项目（不可逆） | `npx wrangler pages project delete hangla` |
| 代码回滚 | `git revert` 后重新 `npm run deploy:cf`；GitHub Pages 走正常 revert + push |

## 5. 已知限制

1. **Direct Upload 不跟 git push 联动**：每次改完代码必须手动 `npm run deploy:cf`（或后续接 Git 集成 / CI）。
2. **没有自定义域名**：目前只有 `*.pages.dev`。绑定域名后要改 canonical / og:url / og:image。
3. **双站并存**：Cloudflare 与 GitHub Pages 内容相同；canonical 已指向 Cloudflare，GitHub Pages 作为备用可继续保留。
4. **凭据**：11-14 会话中曾明文提供 Cloudflare Token / R2 Key / GitHub PAT，记录里标注为「待确认轮换」。如果还没轮换，建议在控制台吊销旧 Token，新建一个仅 `Pages:Edit` 的 Token 用于部署。
5. **构建环境**：旧记录提到 Windows 祖先 `node_modules/@types` 污染会导致 `TS2688`；本次在仓库自己的目录里 `npm ci` 后构建正常，无需临时 tsconfig。若再遇到，优先用干净环境 / `typeRoots` 指向项目自身。
