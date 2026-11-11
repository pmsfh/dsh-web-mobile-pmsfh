# dsh-web-mobile-pmsfh

DSH（DeepSeek Harness）插件：为手机访问提供独立移动端页面，桌面端 UI 零改动。

原 `dsh-mobile-pmsfh` v3.0.0，2026-11-11 重命名并迁出归档，代码逻辑未变。

## 功能

- **host 半**：在 `/_dsh-web-mobile/` 下提供自带聊天页（index.html + app.js + app.css + 内置 markdown-it），页面直接走 DSH wire 协议（`POST /api/<method>`、`WS /api/events.mux`、`POST /api/respond`），不加载官方 SPA bundle。
- **client 半**：只做重定向——粗指针（触摸）且窄屏（≤768px）的浏览器从官方 SPA 跳到移动页；桌面端完全不介入。
- **会话级逃生口**：移动页的「桌面版」链接写入 `sessionStorage['dsh-web-mobile-pmsfh:desktop']`，本次浏览会话不再跳转；下次新访问恢复移动页。
- 旧的 CSS 覆盖 / 抽屉方案已于 v2.0 退役。

## 路由

| 路径 | 内容 |
| --- | --- |
| `/_dsh-web-mobile/` | 移动页 index.html |
| `/_dsh-web-mobile/app.js` | 页面脚本 |
| `/_dsh-web-mobile/app.css` | 页面样式 |
| `/_dsh-web-mobile/vendor/markdown-it.min.js` | 内置依赖，30 天强缓存 |

裸路径 `/_dsh-web-mobile` 302 到带斜杠形式。所有路由在登录门之后。

## 安装

要求 DSH 0.2.x，Node ≥ 24。

```sh
dsh plugin --profile web add /path/to/dsh-web-mobile-pmsfh
sudo systemctl restart dsh-web
```

装完访问 `https://<域名>/_dsh-web-mobile/` 验证；手机浏览器打开主站应自动跳转。

## 兼容性

- v3.0.1 已按 **dsh 0.2.2-rc.1** 的 Typert Remote 签名做静态对齐：`session/list|create|prompt|cancel|page|selectModel|modelCatalog|follow`、`workspace/*`、`directoryPicker/*`、`commands/execute`、`$events/result` 的端点与参数名逐项核对。
- 本次变更：`commands/execute` 附件字段 `images` → `submittedAttachments`；client manifest 去掉已不存在的 `@deepseek-ai/dsh-client-runtime` 注入（client 半不需要任何 client 服务）。
- 尚未实机冒烟：首次安装后按「安装」一节跑一遍列表、发消息、流式回包。

## 注意

- 个人自用插件，`pmsfh` 为本地标记后缀。
- 装任何 DSH 插件都会重链 profile 的 `node_modules`；若部署里用了 `dsh-auth-gate` 登录页汉化补丁，装完需重跑补丁脚本并重启。

## 来源

归档仓 `renlang119/archive` 的 `DSH-plugins/dsh-mobile-pmsfh/`，2026-11-11 迁出并重命名。
