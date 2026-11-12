# dsh-web-mobile-pmsfh

[简体中文](README.md) | **English**

A dedicated mobile page for DeepSeek Harness: open the main site on a mobile device and you land in a separate interface built for narrow screens, with sessions, chat, attachments, and approvals in one place. The desktop client UI and the upstream repository stay untouched.

It serves a standalone mobile UI at `/dsh-web-mobile-pmsfh/`, calls DSH's own APIs directly, does not load the official frontend, and does not modify official code.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-amber)](https://github.com/topics/dsh-plugin)
[![dsh](https://img.shields.io/badge/dsh-0.2.2--rc.1-5B6EF5)](https://github.com/deepseek-ai/deepseek-harness)

## Features

- **Sessions**: grouped by workspace and collapsible; create, rename, and delete workspaces — deleting only removes a workspace from the list, keeping the directory and session records, and its sessions move to "Ungrouped"; long-press a session to archive it, and pick a permission level when creating one (read-only / workspace write / Full access, with a risk confirmation)
- **Conversations**: streaming output, collapsible reasoning, a notice when context is compacted; markdown and code block rendering, stop while generating, queued messages stay visible, scroll up for earlier messages, stick to the bottom with a one-tap return
- **Attachments**: pick files on the device and send them with the message through the official conversation attachment channel, 8 MB per file, removable before sending, not written to the workspace
- **Approvals**: out-of-scope operations raise an approval card with allow once, deny, enter your own, or later
- **Models**: switch model and reasoning level within a session
- **Files**: list and download workspace files, read-only
- **Interface**: Chinese and English follow the browser, light and dark follow the system; "Open desktop version" at the bottom of the list applies to this browsing session only; uses the existing DSH login state with guidance when it expires and a sign-out action

## Quick Start

Requirements: DSH `0.2.2-rc.1` (see Compatibility), Node 24 or later, and pnpm for the `dsh plugin` command.

```sh
corepack enable
```

or

```sh
npm i -g pnpm
```

Once pnpm is available, install the plugin:

```sh
git clone https://github.com/renlang119/dsh-web-mobile-pmsfh.git
dsh plugin --profile web add ./dsh-web-mobile-pmsfh
```

The `dsh plugin` command above installs the plugin for the server started by `dsh web`. The DSH desktop client manages its own plugins; to use it there too, open Settings → Plugins in the client.

Then restart DSH however your deployment runs it:

```sh
sudo systemctl restart dsh-web
```

First visit: opening the main site on a mobile device redirects automatically, or you can open `https://<domain>/dsh-web-mobile-pmsfh/` directly; if it does not redirect, check whether "Open desktop version" was chosen in this browsing session — that preference is session-scoped (sessionStorage) and resets when the page is closed.

## Compatibility

| DSH | Status |
| --- | --- |
| `0.2.2-rc.1` | Supported, running in production |
| other `0.2.x` | Untested; endpoint signatures may differ |

## Tech Stack

Node 24 · DeepSeek Harness `0.2.2-rc.1` · Cordis plugin · vanilla JavaScript (no build) · markdown-it

The mobile page is a single-page vanilla JS app; it does not load the official frontend or go through a bundler, and it has no extra runtime dependencies.

## Project Structure

```text
dsh-web-mobile-pmsfh/
├─ lib/index.js       host half: static routes and connection.admit checks
├─ client/client.js   desktop client: redirect narrow screens to the mobile page
├─ mobile/            mobile page
│  ├─ index.html
│  ├─ app.js / app.css
│  └─ vendor/         markdown-it and CJK punctuation patch
├─ cordis.patch.yml   plugin mount configuration
├─ types.d.ts         protocol and data shapes
└─ tsconfig.json      type-check only, no emit
```

## Quality

- **Types**: `types.d.ts` defines the protocol and data shapes; sources use `@ts-check`; `tsc --noEmit` is clean
- **Syntax**: `node --check` covers the host and the mobile page
- **Assets**: content-hash ETags return 304 on repeat visits and take effect right after an upgrade
- **No build chain**: the repository is the runtime artifact; no install or build step

## Routes

| Path | Content |
| --- | --- |
| `/dsh-web-mobile-pmsfh/` | Mobile page |
| `/dsh-web-mobile-pmsfh/app.js` | Page script |
| `/dsh-web-mobile-pmsfh/app.css` | Page styles |
| `/dsh-web-mobile-pmsfh/vendor/markdown-it.min.js` | Markdown rendering |
| `/dsh-web-mobile-pmsfh/vendor/markdown-it-cjk-friendly.min.js` | `**` handling for CJK punctuation |

The bare path redirects with a 302 to the trailing-slash form.

## Security

- No account system of its own: unauthenticated access to the plugin page is rejected by DSH's login check (401); if that check service is unavailable, the plugin returns 503 and does not let the request through.
- When exposing the service through a reverse proxy, add authentication at the proxy layer (Basic Auth / OIDC / mTLS) and do not expose the DSH port directly to the internet.
- Model output is rendered by markdown-it (`html: false`), and links are limited to `http/https/mailto`; HTML responses carry CSP, nosniff, no-referrer, and `X-Frame-Options: DENY`.

## Known limitations

- Subagent sessions are not listed (matching the desktop client: subagents do not take top-level rows).
- Attachments use the official conversation attachment channel and are not written to the workspace; workspace files are read-only.
- The plugin relies on DSH's internal session-check endpoint: if a DSH upgrade changes it, the plugin deactivates rather than allowing access.
- Single-user use is recommended: DSH itself does not separate accounts, so a shared deployment needs isolation in front.

## Update

Pull the latest code in the cloned directory and restart:

```sh
git pull
sudo systemctl restart dsh-web
```

The install is a link, so keep the cloned directory.

To uninstall:

```sh
dsh plugin --profile web remove dsh-web-mobile-pmsfh
sudo systemctl restart dsh-web
```

## Development

For local debugging, use a separate `DSH_HOME` and port so production data is unaffected:

```sh
DSH_HOME=~/.dsh-test dsh --profile web --no-open --port 3080
```

Implementation notes: static assets get content-hash ETags and return 304 on repeat visits; bundled dependencies are cached for 30 days.

## License

[MIT](LICENSE)
