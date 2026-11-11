# dsh-web-mobile-pmsfh

**给 DeepSeek Harness 一个能用的手机页面。** 独立移动端聊天界面，直接跑在 DSH 自己的协议上；桌面端 UI 零改动，主仓库零改动。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-amber)](https://github.com/topics/dsh-plugin)
[![dsh](https://img.shields.io/badge/dsh-0.2.2--rc.1-5B6EF5)](https://github.com/deepseek-ai/deepseek-harness)

## 是什么

`dsh-web-mobile-pmsfh` 是 DSH 的移动端页面插件：在 `/dsh-web-mobile-pmsfh/` 下提供一套独立的聊天界面，直接调 DSH 自己的接口，不加载官方前端，也不改官方代码。

DSH 的官方 Web UI 按桌面布局设计，侧边栏、悬浮输入框、文件选择在手机窄屏上都不顺手——移动页专门解决这一点。

- 触摸 + 窄屏（≤768px）时自动从主站跳到移动页，桌面端完全不介入
- 想用桌面版：点列表底部的「进入桌面版」就能切过去，只对当前这次浏览生效，重新打开还是移动页

## 功能

- **会话**：按工作区分组、折叠，新建 / 重命名 / 删除工作区，长按会话归档
- **聊天**：流式输出、思考过程折叠、markdown、代码块、停止生成
- **附件**：手机选文件走官方 `fileUploads/upload`，随消息发送，不落工作区
- **文件**：工作区列表与下载走官方 `workspaceFiles/list|readBytes`（只读）
- **登录**：沿用 DSH 自己的登录状态；没登录时先被登录页拦住，插件自己也会再校验一次
- **缓存**：静态资源带内容哈希，重复访问直接回 304；内置依赖缓存 30 天
- **安全头**：CSP、nosniff、no-referrer、X-Frame-Options: DENY

## 兼容性

| DSH | 状态 |
| --- | --- |
| `0.2.2-rc.1` | 已适配，线上运行 |
| 其他 `0.2.x` | 未验证，端点签名可能不同 |

Node ≥ 24。

## 安装

```sh
dsh plugin --profile web add /path/to/dsh-web-mobile-pmsfh
sudo systemctl restart dsh-web
```

首次访问 `https://<域名>/dsh-web-mobile-pmsfh/`。手机浏览器打开主站会自动跳转；如果没跳，检查是否被「进入桌面版」偏好覆盖（`sessionStorage`）。

## 路由

| 路径 | 内容 |
| --- | --- |
| `/dsh-web-mobile-pmsfh/` | 移动页 |
| `/dsh-web-mobile-pmsfh/app.js` | 页面脚本 |
| `/dsh-web-mobile-pmsfh/app.css` | 页面样式 |
| `/dsh-web-mobile-pmsfh/vendor/markdown-it.min.js` | markdown 渲染 |
| `/dsh-web-mobile-pmsfh/vendor/markdown-it-cjk-friendly.min.js` | 中文标点下的 `**` 兼容 |

裸路径 302 到带斜杠形式。

## 安全

- 不自带账号体系。没登录时访问插件页面会被 DSH 的登录校验直接拒绝（401）；校验服务不可用时返回 503，不会放行。
- 通过反向代理公开时，请在代理层加认证（Basic Auth / OIDC / mTLS），不要把 DSH 端口直接暴露到公网。
- 模型输出经 markdown-it 渲染（`html: false`），链接白名单仅 `http/https/mailto`；HTML 响应带 CSP。

## 已知限制

- 不列子代理会话（与桌面端一致：子代理不占顶层行）
- 附件走官方聊天附件通道，不写入工作区；工作区文件只读
- 依赖 DSH 内部的会话校验接口：DSH 升级若改动它，插件会不激活而不是放行
- 建议只单人使用：DSH 本身没有多账号区分，多人共用要自己在外面做隔离

## 开发

```
lib/index.js       host 半：静态路由 + connection.admit 校验
client/client.js   桌面端：窄屏跳转
mobile/            移动页（原生 JS，无构建）
cordis.patch.yml   插件挂载配置
```

本地调试建议用独立 `DSH_HOME` 和端口，避免影响生产数据：

```sh
DSH_HOME=~/.dsh-test dsh --profile web --no-open --port 3080
```

## License

MIT
