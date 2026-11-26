# 发布前真实冒烟

手动在真实 DSH 实例上跑，不进 CI。脚本只依赖 `playwright-core` 与系统 Chrome/Chromium，不下载浏览器。

## 用法

```sh
DSH_URL=https://example.com \
DSH_USER=... \
DSH_PASS=... \
DSH_SESSION_ID=session-... \
npm run e2e:smoke
```

必需：`DSH_URL`、`DSH_USER`、`DSH_PASS`。
可选：
- `DSH_SESSION_ID`：直接打开指定会话；列表为空时必须给。
- `DSH_SEND_MESSAGE=1`：真实发一条短消息，验证流式回复（会消耗模型额度）。
- `CHROME_PATH`：Chrome/Chromium 路径，默认找常见的 `/usr/bin` 位置。
- `CHROME_NO_SANDBOX=1`：以 root 运行时加 `--no-sandbox`。

## 覆盖

登录、会话列表、会话页、模型面板、审批弹层注入、中英双语、console 与失败响应检查。审批只注入并关闭，不向服务端提交应答；会话数据不会被修改。

退出码：`0` 全通过，`1` 有失败，`2` 缺环境或找不到浏览器。
