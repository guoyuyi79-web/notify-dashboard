# 通知运营看板 v2（多项目 Sheet 链接）

## 架构
各项目自己的 Google 表格跑脚本 → 共享表格 → 本站粘贴**一个或多个**链接清洗展示。  
网站不存令牌、不拉 GA4。

## 使用
1. 各项目表格跑最新 `MG18_panel.gs`，生成 `panel_overview` / `panel_scenario`
2. 共享：知道链接的任何人 = 查看者
3. 打开网站，**每行粘贴一个 Sheet 链接**，点「加载并清洗全部」
4. 用「项目代号 / 查看类型 / 队列天数」等筛选

## 脚本配置要点
- `config_params`：查看类型（行为分析/文案分析）+ 场景参数名（可逗号多个）
- `config_scenarios`：增加列「查看类型」
- `config_filter`「场景参数名」也可逗号多个（兼容旧用法）

## 部署
上传本目录到 GitHub（必须含 `api/sheet.js`），Vercel Framework=Other，无需环境变量。

网站: https://notify-dashboard-suri.vercel.app/
