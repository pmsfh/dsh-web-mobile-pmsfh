# dsh-web-mobile-pmsfh

**中文** · [English](README.en.md)

**给 DeepSeek Harness 一个专用的移动端页面。** 移动设备打开主站自动进入，会话、聊天、附件、审批都在这个为窄屏设计的独立界面里，桌面端 UI 与主仓库零改动。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-amber)](https://github.com/topics/dsh-plugin)
[![dsh](https://img.shields.io/badge/dsh-0.2.2--rc.1-5B6EF5)](https://github.com/deepseek-ai/deepseek-harness)

## 是什么

`dsh-web-mobile-pmsfh` 是 DSH 的移动端页面插件：在 `/dsh-web-mobile-pmsfh/` 下挂一套独立的移动页，直接调 DSH 自己的接口，不加载官方前端，也不改官方代码，桌面端完全不介入

DSH 的官方 Web UI 按桌面布局设计，侧边栏、悬浮输入框、文件选择在窄屏移动设备上都不顺手。

- 触摸 + 窄屏 ≤768px 的移动设备访问主站时，自动进入移动页
- 想用桌面版：列表底部「进入桌面版」，只对当前这次浏览生效，重新打开还是移动页

## 功能

**会话**

- 按工作区分组折叠；新建 / 重命名 / 删除工作区，删除只从列表移除，目录与会话记录保留，其会话转入「未分组」
- 长按会话归档；新建会话时选权限档位：只读 / 工作区可写 / Full access（需确认风险）

**对话**

- 流式输出；思考过程折叠可展开；上下文压缩时显示提示
- markdown 与代码块渲染；生成中可停止，后续消息排队可见；上翻加载更早消息；贴底跟随，偏移后一键回到底部

**附件**

- 移动设备上选文件随消息发送，走官方聊天附件通道（单文件上限 8 MB，发送前可移除，不落工作区）

**审批**

- 越界操作弹审批卡：允许一次 / 拒绝 / 其他（自己输入）/ 稍后

**模型**

- 会话内切换模型与推理等级

**文件**

- 工作区文件列表与下载，只读

**界面**

- 中英双语跟随浏览器，深浅色跟随系统
- 沿用 DSH 登录状态，过期有引导，可退出登录

## 兼容性

| DSH | 状态 |
| --- | --- |
| `0.2.2-rc.1` | 已适配，线上运行 |
| 其他 `0.2.x` | 未验证，端点签名可能不同 |

## 安装

前置：DSH 版本见上表；Node ≥ 24；`dsh plugin` 需要 pnpm（`corepack enable` 或 `npm i -g pnpm`）

```sh
git clone https://github.com/renlang119/dsh-web-mobile-pmsfh.git
dsh plugin --profile web add ./dsh-web-mobile-pmsfh
```

然后重启 DSH 服务，按你的部署方式来

```sh
sudo systemctl restart dsh-web
```

上面的命令是给 `dsh web` 启动的服务端安装插件；DSH 桌面客户端自己管理插件，如果也要在桌面端使用，在客户端的设置 → 插件页里安装

安装为 link 方式，克隆目录要保留

升级：在该目录执行 `git pull` 后重启

卸载：执行 `dsh plugin --profile web remove dsh-web-mobile-pmsfh` 后重启

首次访问：用移动设备打开主站会自动跳转，也可以直接开 `https://<域名>/dsh-web-mobile-pmsfh/`，如果没跳，检查这次浏览是否点过「进入桌面版」；那是会话级偏好（sessionStorage），关掉页面重开即恢复默认

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

- 不自带账号体系：未登录访问插件页面会被 DSH 的登录校验直接拒绝（401）；校验服务不可用时返回 503，不放行
- 反向代理公开时，请在代理层加认证（Basic Auth / OIDC / mTLS），不要把 DSH 端口直接暴露到公网
- 模型输出经 markdown-it 渲染（`html: false`），链接白名单仅 `http/https/mailto`；HTML 响应带 CSP、nosniff、no-referrer、`X-Frame-Options: DENY`

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

实现要点：静态资源按内容哈希打 ETag，重复访问回 304；内置依赖缓存 30 天。

本地调试建议用独立 `DSH_HOME` 和端口，避免影响生产数据：

```sh
DSH_HOME=~/.dsh-test dsh --profile web --no-open --port 3080
```

## License

MIT
