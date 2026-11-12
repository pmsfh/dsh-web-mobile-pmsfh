# dsh-web-mobile-pmsfh

[中文](README.md) · **English**

**A dedicated mobile page for DeepSeek Harness.** Open the main site on a mobile device and you land in a separate interface built for narrow screens, with sessions, chat, attachments, and approvals in one place. The desktop client UI and the upstream repository stay untouched.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-amber)](https://github.com/topics/dsh-plugin)
[![dsh](https://img.shields.io/badge/dsh-0.2.2--rc.1-5B6EF5)](https://github.com/deepseek-ai/deepseek-harness)

## What it is

`dsh-web-mobile-pmsfh` is a mobile page plugin for DSH: it serves a standalone mobile UI at `/dsh-web-mobile-pmsfh/`, calls DSH's own APIs directly, does not load the official frontend, and does not modify official code. The desktop client is not involved at all.

The official DSH web UI is designed for desktop layouts; its sidebar, floating composer, and file picker are awkward on narrow screens.

- On touch devices with a viewport of 768px or less, opening the main site goes straight to the mobile page.
- To use the desktop layout instead, choose "Open desktop version" at the bottom of the list. This applies to the current browsing session only; opening the page again returns to the mobile page.

## Features

**Sessions**

- Grouped by workspace and collapsible; create, rename, and delete workspaces. Deleting only removes a workspace from the list; the directory and session records are kept, and its sessions move to "Ungrouped".
- Long-press a session to archive it. When creating a session, choose a permission level: read-only / workspace write / Full access (with a risk confirmation).

**Chat**

- Streaming output; collapsible reasoning; a notice when context is compacted.
- Markdown and code block rendering; stop a response while it generates; queued messages stay visible; scroll up to load earlier messages; stick to the bottom, with a one-tap return when you scroll away.

**Attachments**

- Pick files on the device and send them with the message through the official chat attachment channel (8 MB per file, removable before sending, not written to the workspace).

**Approvals**

- Out-of-scope operations raise an approval card: allow once / deny / other (enter your own) / later.

**Models**

- Switch model and reasoning level within a session.

**Files**

- List and download workspace files, read-only.

**Interface**

- Chinese and English follow the browser; light and dark follow the system.
- Uses the existing DSH login state, with guidance when it expires and a sign-out action.

## Compatibility

| DSH | Status |
| --- | --- |
| `0.2.2-rc.1` | Supported, running in production |
| other `0.2.x` | Untested; endpoint signatures may differ |

## Installation

Requirements: a DSH version from the table above, Node 24 or later, and pnpm on PATH for the `dsh plugin` command (`corepack enable` or `npm i -g pnpm`).

```sh
git clone https://github.com/renlang119/dsh-web-mobile-pmsfh.git
dsh plugin --profile web add ./dsh-web-mobile-pmsfh
```

Then restart DSH however your deployment runs it (systemd example: `sudo systemctl restart dsh-web`).

These commands install into the `web` profile (the one used by `dsh web`). The desktop client manages its own profile; to install there, use Settings → Plugins in the client.

The install is a link, so keep the cloned directory: to upgrade, run `git pull` there and restart; to uninstall, run `dsh plugin --profile web remove dsh-web-mobile-pmsfh` and restart.

First visit: opening the main site on a mobile device redirects automatically, or you can open `https://<domain>/dsh-web-mobile-pmsfh/` directly. If it does not redirect, check whether "Open desktop version" was chosen in this browsing session; that preference is session-scoped (sessionStorage) and resets when the page is closed.

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
- Attachments use the official chat attachment channel and are not written to the workspace; workspace files are read-only.
- The plugin relies on DSH's internal session-check endpoint: if a DSH upgrade changes it, the plugin deactivates rather than allowing access.
- Single-user use is recommended: DSH itself does not separate accounts, so a shared deployment needs isolation in front.

## Development

```
lib/index.js       host half: static routes + connection.admit checks
client/client.js   desktop client: narrow-screen redirect
mobile/            mobile page (vanilla JS, no build step)
cordis.patch.yml   plugin mount configuration
```

Implementation notes: static assets get content-hash ETags and return 304 on repeat visits; bundled dependencies are cached for 30 days.

For local debugging, use a separate `DSH_HOME` and port so production data is unaffected:

```sh
DSH_HOME=~/.dsh-test dsh --profile web --no-open --port 3080
```

## License

MIT
