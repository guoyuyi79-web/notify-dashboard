# 通知运营看板（Vercel · 多项目）

每个业务项目可以有**自己独立的** Google 表格 + Apps Script。  
Vercel 网站通过环境变量登记各项目的 Script 地址，服务端代理读写（解决浏览器跨域）。

## 架构

```
浏览器看板 (Vercel)
  ├─ /api/projects  -> 读 projects.config.json + 环境变量是否已配置
  ├─ /api/data?id=MG18 -> 服务端请求该项目 Apps Script?action=export
  └─ /api/pull      -> 服务端请求该项目 Apps Script action=pull
         │
         ├─ MG18 的 Apps Script / Sheet
         ├─ PDF06 的 Apps Script / Sheet
         └─ …
```

## 1. 配置多项目

编辑 `projects.config.json`：

```json
{
  "categories": ["工具", "内容"],
  "projects": [
    { "id": "MG18", "name": "MG18", "category": "工具", "enabled": true },
    { "id": "PDF06", "name": "PDF06", "category": "工具", "enabled": true }
  ]
}
```

## 2. 每个项目各自部署 Apps Script

对每个 Google 表格项目：

1. 粘贴最新 `MG18_panel.gs`（需支持 `action=export`）
2. 部署「网页应用」，拿到 `/exec` 链接
3. `config_filter` 设置「拉取令牌」

## 3. 在 Vercel 配环境变量

Project Settings -> Environment Variables：

| Name | Value |
|------|-------|
| `PROJECT_MG18_SCRIPT_URL` | `https://script.google.com/macros/s/.../exec` |
| `PROJECT_MG18_PULL_TOKEN` | 该表 config_filter 的拉取令牌 |
| `PROJECT_PDF06_SCRIPT_URL` | 另一个项目的 /exec |
| `PROJECT_PDF06_PULL_TOKEN` | 另一个令牌 |

规则：`PROJECT_<项目ID大写>_SCRIPT_URL` / `_PULL_TOKEN`

## 4. 部署到 Vercel

### 方式 A：网页导入（推荐，无需本机 Node）

1. 把本目录推到 GitHub 仓库
2.打开 https://vercel.com/new
3. Import 该仓库
4. Framework Preset 选 Other
5. Output / 根目录默认即可（静态 `public` + `api`）
6. 填好环境变量 -> Deploy

### 方式 B：本机 CLI

```bash
npm i -g vercel
cd notify-dashboard
vercel login
vercel link
vercel env add PROJECT_MG18_SCRIPT_URL
vercel env add PROJECT_MG18_PULL_TOKEN
vercel --prod
```

部署成功后的 `https://xxx.vercel.app` 就是可视化面板网站地址。

## 页面能力

- 按品类 / 项目筛选（项目可来自不同脚本）
- 按国家 / 日期区间筛选
- 展示绝对数；率在前端由数计算/展示
- 「拉取 GA4 并更新」只打选中项目的 API，避免误伤其它项目配额