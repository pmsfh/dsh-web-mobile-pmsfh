# dsh-web-mobile-pmsfh

DSH（DeepSeek Harness）插件：为手机访问提供独立移动端页面，桌面端 UI 零改动。

原 `dsh-mobile-pmsfh` v3.0.0，2026-11-11 重命名并迁出归档。v3.1.0 起文件功能改用官方 `fileUploads` / `workspaceFiles` 接口。

## 功能

- **host 半**：在 `/_dsh-web-mobile-pmsfh/` 下提供自带聊天页（index.html + app.js + app.css + 内置 markdown-it），页面直接走 DSH wire 协议（`POST /api/<namespace>/<method>`、`WS /api/remote.mux`），不加载官方 SPA bundle。
- **附件与文件**：手机选文件走官方 `fileUploads/upload`（聊天附件暂存，receiptId 随下一条消息发送，不落工作区）；工作区文件列表/下载走官方 `workspaceFiles/list|readBytes`（只读，scope 为当前会话）。
- **登录与退出**：移动页在 `dsh-auth-gate` 之后。未登录导航由 gate 302 到登录页；页面内 fetch 遇 401、或 WS 断开且 `/auth/status` 报未登录时自动跳登录页；头部「⋯ → 退出登录」以 POST `/auth/logout` 登出。
- **client 半**：只做重定向——粗指针（触摸）且窄屏（≤768px）的浏览器从官方 SPA 跳到移动页；桌面端完全不介入。
- **会话级逃生口**：移动页的「桌面版」链接写入 `sessionStorage['dsh-web-mobile-pmsfh:desktop']`，本次浏览会话不再跳转；下次新访问恢复移动页。
- 旧的 CSS 覆盖 / 抽屉方案已于 v2.0 退役。

## 路由

| 路径 | 内容 |
| --- | --- |
| `/_dsh-web-mobile-pmsfh/` | 移动页 index.html |
| `/_dsh-web-mobile-pmsfh/app.js` | 页面脚本 |
| `/_dsh-web-mobile-pmsfh/app.css` | 页面样式 |
| `/_dsh-web-mobile-pmsfh/vendor/markdown-it.min.js` | 内置依赖，30 天强缓存 |

裸路径 `/_dsh-web-mobile-pmsfh` 302 到带斜杠形式。所有路由在登录门之后。

## 安装

要求 DSH 0.2.x，Node ≥ 24。

```sh
dsh plugin --profile web add /path/to/dsh-web-mobile-pmsfh
sudo systemctl restart dsh-web
```

装完访问 `https://<域名>/_dsh-web-mobile-pmsfh/` 验证；手机浏览器打开主站应自动跳转。

## 兼容性

- v3.1.1 已按 **dsh 0.2.2-rc.1** 的 Typert Remote 签名做静态对齐：`session/list|create|prompt|cancel|page|selectModel|modelCatalog|follow`、`workspace/*`、`directoryPicker/*`、`commands/execute`、`$events/result` 的端点与参数名逐项核对。
- 文件功能已全部改用官方接口：上传 `fileUploads/upload`、列表/下载 `workspaceFiles/list|readBytes`，不再依赖 `/_dsh-file/*` 路由（那属于已退役的 dsh-file-pmsfh）。
- 本次变更：`commands/execute` 附件字段 `images` → `submittedAttachments`；client manifest 去掉已不存在的 `@deepseek-ai/dsh-client-runtime` 注入（client 半不需要任何 client 服务）。
- 尚未实机冒烟：首次安装后按「安装」一节跑一遍列表、发消息、流式回包。

## 注意

- 个人自用插件，`pmsfh` 为本地标记后缀。
- 装任何 DSH 插件都会重链 profile 的 `node_modules`；若部署里用了 `dsh-auth-gate` 登录页汉化补丁，装完需重跑补丁脚本并重启。

## 来源

归档仓 `renlang119/archive` 的 `DSH-plugins/dsh-mobile-pmsfh/`，2026-11-11 迁出并重命名。
