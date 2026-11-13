# dsh-web-mobile-pmsfh

**简体中文** | [English](README.en.md)

DeepSeek Harness 的移动端页面插件：移动设备打开主站自动进入，会话、对话、
附件、审批都在这个为窄屏设计的独立界面里完成；不动桌面端界面，也不改主仓库
代码。

它在 `/dsh-web-mobile-pmsfh/` 路径下挂一套独立的移动页，直接调 DSH 自己的
接口，不加载官方前端，也不改官方代码。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-amber)](https://github.com/topics/dsh-plugin)
[![npm](https://img.shields.io/npm/v/dsh-web-mobile-pmsfh.svg)](https://www.npmjs.com/package/dsh-web-mobile-pmsfh)
[![dsh](https://img.shields.io/badge/dsh-0.2.2--rc.1-5B6EF5)](https://github.com/deepseek-ai/deepseek-harness)

## 功能概览

- **会话**：按工作区分组折叠；新建、重命名、删除工作区，删除只从列表移除，
  目录与会话记录保留，会话转入「未分组」；长按会话归档，新建时选权限档位
  （仅可查看 / 工作区内修改 / 完全权限，完全权限启用前需确认风险）
- **对话**：流式输出、思考过程折叠、上下文压缩提示；markdown 与代码块渲染，
  生成中可停止，后续消息排队可见，上翻加载更早消息，贴底跟随与一键回到底部
- **附件**：移动设备上选文件随消息发送，走官方对话附件通道，单文件上限
  8 MB，发送前可移除，不落工作区
- **审批**：越界操作弹出审批卡，可选允许一次、拒绝、稍后，也可自行输入后
  提交
- **模型**：会话内切换模型与推理等级
- **文件**：工作区文件列表与下载，只读
- **界面**：中英双语跟随浏览器，深浅色跟随系统；列表底部「进入桌面版」只对
  本次浏览生效；沿用 DSH 登录状态，过期有引导，可退出登录

## 快速开始

环境要求：DSH `0.2.2-rc.1`（见「兼容性」）、Node.js ≥ 24；`dsh plugin`
需要 pnpm，经 corepack 启用或全局安装：

```bash
corepack enable
```

或

```bash
npm i -g pnpm
```

装好后，两种方式选一种安装；安装完成后重启 DSH 服务，重启命令按实际部署方式
调整。

### 方式一：从 npm 安装

适合直接使用，能收到新版本的更新提示：

```bash
dsh plugin --profile web add dsh-web-mobile-pmsfh
```

### 方式二：从源码安装

适合自行修改；克隆目录需保留，更新时在目录内拉取：

```bash
git clone https://github.com/renlang119/dsh-web-mobile-pmsfh.git
dsh plugin --profile web add ./dsh-web-mobile-pmsfh
```

`dsh plugin` 命令安装到 `dsh web` 启动的服务端；DSH 桌面客户端自行管理
插件，要在桌面端使用，在客户端的设置 → 插件页里安装。

如果本机 npm 指向国内镜像，无法安装这个包，在命令后面加
`--registry=https://registry.npmjs.org`。

重启命令示例：

```bash
sudo systemctl restart dsh-web
```

首次访问：用移动设备打开主站会自动跳转，也可以直接开
`https://<域名>/dsh-web-mobile-pmsfh/`；如果没跳转，检查这次浏览是否点过
「进入桌面版」——那是会话级偏好（sessionStorage），关闭页面重新打开即恢复
默认。

## 兼容性

| DSH | 状态 |
| --- | --- |
| `0.2.2-rc.1` | 已适配 |
| 其他 `0.2.x` | 未验证，端点签名可能不同 |

## 技术栈

Node.js 24 · DeepSeek Harness `0.2.2-rc.1` · Cordis 插件 · 原生 JavaScript
（无构建）· markdown-it

移动页是单页原生 JS 应用，不加载官方前端、不走打包器；运行时没有额外依赖，
克隆后即可运行。

## 项目结构

```text
dsh-web-mobile-pmsfh/
├─ lib/index.js       host 侧：静态路由与 connection.admit 校验
├─ client/client.js   桌面端：窄屏设备跳转到移动页
├─ mobile/            移动页
│  ├─ index.html
│  ├─ app.js / app.css
│  └─ vendor/         markdown-it 与 CJK 标点兼容补丁
├─ cordis.patch.yml   插件挂载配置
├─ types.d.ts         协议与数据形状定义
└─ tsconfig.json      仅类型检查，不产出构建物
```

## 质量

- **类型**：`types.d.ts` 定义协议与数据形状，源码带 `@ts-check`，
  `tsc --noEmit` 全绿
- **语法**：`node --check` 覆盖 host 侧与移动页
- **静态资源**：按内容哈希发 ETag，重复访问返回 304，升级后立即生效
- **无构建链**：仓库即运行物，没有安装与构建步骤

## 路由

| 路径 | 内容 |
| --- | --- |
| `/dsh-web-mobile-pmsfh/` | 移动页 |
| `/dsh-web-mobile-pmsfh/app.js` | 页面脚本 |
| `/dsh-web-mobile-pmsfh/app.css` | 页面样式 |
| `/dsh-web-mobile-pmsfh/vendor/markdown-it.min.js` | markdown 渲染 |
| `/dsh-web-mobile-pmsfh/vendor/markdown-it-cjk-friendly.min.js` | CJK 标点下的 `**` 处理 |

裸路径 302 跳转到带斜杠形式。

## 安全

- 不自带账号体系：未登录访问插件页被 DSH 登录校验拦下（401）；校验服务
  不可用时返回 503，不放行
- 经反向代理对外暴露时，在代理层加认证（Basic Auth / OIDC / mTLS），不要
  把 DSH 端口直接暴露公网
- 模型输出经 markdown-it 渲染（`html: false`），链接限定
  `http/https/mailto`；HTML 响应带 CSP、nosniff、no-referrer 与
  `X-Frame-Options: DENY`

## 已知限制

- 不列子代理会话（与桌面端一致：子代理不占顶层行）
- 附件走官方对话附件通道，不写入工作区；工作区文件只读
- 依赖 DSH 内部的会话校验接口：DSH 升级若改动它，插件会不激活而不是放行
- 建议只单人使用：DSH 本身没有多账号区分，多人共用要自己在外面做隔离

## 更新

从 npm 安装的，更新到新版本后重启：

```bash
dsh plugin --profile web add dsh-web-mobile-pmsfh@latest
sudo systemctl restart dsh-web
```

从源码安装的，在克隆目录拉取最新代码后重启：

```bash
git pull
sudo systemctl restart dsh-web
```

## 卸载

从 `web` profile 移除插件后重启：

```bash
dsh plugin --profile web remove dsh-web-mobile-pmsfh
sudo systemctl restart dsh-web
```

## 开发

本地调试建议使用独立的 `DSH_HOME` 与端口，避免影响生产数据：

```bash
DSH_HOME=~/.dsh-test dsh --profile web --no-open --port 3080
```

实现要点：静态资源按内容哈希发 ETag，重复访问返回 304；内置依赖缓存
30 天。

## 许可证

[MIT](LICENSE) © 2026 renlang119
