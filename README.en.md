# dsh-web-mobile-pmsfh

[简体中文](README.md) | **English**

A dedicated mobile page for DeepSeek Harness: open the main site on a mobile
device and you land in a separate interface built for narrow screens, with
sessions, conversations, attachments, and approvals in one place. The desktop
interface and the upstream repository stay untouched.

It serves a standalone mobile page at `/dsh-web-mobile-pmsfh/`, calls DSH's own
APIs directly, does not load the official frontend, and does not modify
official code.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-amber)](https://github.com/topics/dsh-plugin)
[![npm](https://img.shields.io/npm/v/dsh-web-mobile-pmsfh.svg)](https://www.npmjs.com/package/dsh-web-mobile-pmsfh)
[![dsh](https://img.shields.io/badge/dsh-0.2.2--rc.1-5B6EF5)](https://github.com/deepseek-ai/deepseek-harness)

## Features

- **Sessions**: grouped by workspace and collapsible, plus "Ungrouped"; create,
  rename, and delete workspaces — deleting only removes a workspace from the
  list, keeping the directory and session records, and its sessions move to
  "Ungrouped"; long-press a session to archive it; creating a session picks the
  workspace through an inline directory browser and a permission level (Read
  Only / Workspace Write / Full access; only Full access requires a risk
  confirmation)
- **Conversations**: streaming output, collapsible reasoning, a notice when
  context is compacted; markdown and code block rendering, stop while
  generating, queued messages stay visible, paginated history as you scroll up,
  stick to the bottom with a one-tap return
- **Attachments**: pick files on the device, upload for a receipt, and send them
  with the next message through the official conversation attachment channel;
  8 MB per file, removable before sending, not written to the workspace
- **Approvals**: out-of-scope operations raise an approval card with allow
  once, deny, later, or a custom command of your own
- **Models**: switch model and reasoning level within a session
- **Files**: list and download workspace files, read-only
- **Interface**: Chinese and English follow the browser, light and dark follow
  the system; the composer rides above the soft keyboard; "Open desktop
  version" at the bottom of the list applies to this browsing session only,
  and a floating "📱" button appears in the corner after switching to return to
  the mobile page; uses the existing DSH login state with guidance when it
  expires and a sign-out action

## Quick Start

Requirements: DSH `0.2.2-rc.1` (see Compatibility), Node.js 24 or later, and
pnpm for the `dsh plugin` command — enable it through corepack or install it
globally:

```bash
corepack enable
```

or

```bash
npm i -g pnpm
```

Once pnpm is available, install the plugin one of two ways; after installing,
restart DSH, adjusting the restart command to how your deployment runs it.

### Option 1: Install from npm

Ready to use, with update prompts when new versions are released:

```bash
dsh plugin --profile web add dsh-web-mobile-pmsfh
```

### Option 2: Install from source

For your own modifications; keep the cloned directory, since updates are pulled
inside it:

```bash
git clone https://github.com/renlang119/dsh-web-mobile-pmsfh.git
dsh plugin --profile web add ./dsh-web-mobile-pmsfh
```

The `dsh plugin` command above installs the plugin for the server started by
`dsh web`. The DSH desktop client manages its own plugins; to use it there too,
open Settings → Plugins in the client.

If your npm points at a regional mirror and cannot find the package, append
`--registry=https://registry.npmjs.org`.

Restart command example:

```bash
sudo systemctl restart dsh-web
```

First visit: opening the main site on a mobile device redirects automatically,
or you can open `https://<domain>/dsh-web-mobile-pmsfh/` directly; if it does
not redirect, check whether "Open desktop version" was chosen in this browsing
session — that preference is session-scoped (sessionStorage) and resets when
the page is closed and reopened.

## Compatibility

| DSH | Status |
| --- | --- |
| `0.2.2-rc.1` | Supported |
| other `0.2.x` | Untested; endpoint signatures may differ |

## Tech Stack

Node.js 24 · DeepSeek Harness `0.2.2-rc.1` · Cordis plugin · vanilla
JavaScript (no build) · markdown-it

The mobile page is a single-page vanilla JS app; it does not load the official
frontend or go through a bundler, and it has no extra runtime dependencies —
clone and run.

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

## Architecture

The plugin has three parts, all inside the plugin directory, with zero changes
to the main repository; `cordis.patch.yml` inserts the plugin into the
profile's layer stack:

| Part | Role |
| --- | --- |
| `lib/index.js` | Host half: static routes behind the DSH login gate |
| `client/client.js` | Client half: bounces phones (coarse pointer, ≤ 768px) to the mobile page |
| `mobile/` | The mobile page: a vanilla JS single-page app, no official frontend, no bundler |

The mobile page talks to DSH exclusively through DSH's own wire protocol
(Typert Gateway) — there are no plugin-private endpoints:

- `POST /api/<method>`: unary RPC (sessions, workspaces, models, files, …)
- `WS /api/remote.mux`: frame-multiplexed long connection (session journal
  streams, workspace baselines, the event bus)
- `POST /api/$events/result`: approval and question answers

Five resource routes, plus a bare-path 302 redirect:

| Path | Content |
| --- | --- |
| `/dsh-web-mobile-pmsfh/` | Mobile page |
| `/dsh-web-mobile-pmsfh/app.js` | Page script |
| `/dsh-web-mobile-pmsfh/app.css` | Page styles |
| `/dsh-web-mobile-pmsfh/vendor/markdown-it.min.js` | Markdown rendering |
| `/dsh-web-mobile-pmsfh/vendor/markdown-it-cjk-friendly.min.js` | `**` handling for CJK |

Page files are read from disk per request (`no-cache`, 304 when unchanged), so
a plugin update plus a dsh-web restart takes effect immediately; vendor files
are content-hash cached for 30 days (`immutable`).

## DSH API Dependencies

The mobile page calls these internal DSH endpoints directly
(`session/follow`, `workspace/follow`, and `$events` ride the mux connection;
the rest are unary RPC):

| Endpoint | Purpose |
| --- | --- |
| `session/list`/`session/create`/`session/prompt`/`session/cancel` | List/create/prompt/stop |
| `session/selectModel` / `session/modelCatalog` | Model and reasoning level |
| `session/page` / `session/follow` | Paginated history and the live journal stream |
| `workspace/create` / `workspace/rename` / `workspace/delete` | Workspace management |
| `workspace/archiveSession` / `workspace/follow` | Archive sessions; workspace baseline stream |
| `directoryPicker/list` / `directoryPicker/createDirectory` | Directory browser for new workspaces |
| `commands/execute` | Permission preset setup (the `/permission` command) |
| `fileUploads/upload` | Attachment upload; the receipt is sent with the next message |
| `workspaceFiles/list` / `workspaceFiles/readBytes` | Workspace file list and download |
| `$events/result` | Approval and question answers |

These are DSH-internal endpoints with no stability promise: when the check
service is unavailable, the plugin returns 503 and does not let the request
through; an endpoint signature change breaks the affected features until the
plugin adapts (see Compatibility).

## Quality

- **Types**: `types.d.ts` defines the protocol and data shapes; sources use
  `@ts-check`; `tsc --noEmit` is clean
- **Syntax**: `node --check` covers the host and the mobile page
- **Assets**: content-hash ETags return 304 on repeat visits and take effect
  right after an upgrade
- **No build chain**: the repository is the runtime artifact; no install or
  build step

## Security

- No account system of its own: unauthenticated access to the plugin page is
  rejected by DSH's login check (401); if that check service is unavailable,
  the plugin returns 503 and does not let the request through
- When exposing the service through a reverse proxy, add authentication at the
  proxy layer (Basic Auth / OIDC / mTLS) and do not expose the DSH port
  directly to the internet
- Model output is rendered by markdown-it (`html: false`), and links are
  limited to `http/https/mailto`; HTML responses carry CSP, nosniff,
  no-referrer, and `X-Frame-Options: DENY`

## Self-check & Troubleshooting

- The plugin page bounces back to the DSH login page: not signed in or the
  session expired — sign in on the main site first
- The plugin page returns 503: DSH's login-check service is unavailable, the
  plugin refuses to let the request through — restore DSH itself first
- A phone opening the main site does not land on the mobile page: "Open desktop
  version" was chosen in this browsing session (session-scoped, sessionStorage);
  closing and reopening the page restores the default, and a phone switched to
  the desktop page shows a floating "📱" button to return
- The session list loads but the model list is unavailable: the DSH backend
  model service is failing — check DSH's own logs
- After a DSH upgrade the plugin page fails or misbehaves: an internal endpoint
  signature may have changed; check Compatibility for the adapted version and
  wait for the plugin to catch up

## Known limitations

- Subagent sessions are not listed (matching the desktop client: subagents do
  not take top-level rows)
- Attachments use the official conversation attachment channel and are not
  written to the workspace; workspace files are read-only
- The plugin consumes DSH-internal endpoints with no stability promise: an
  endpoint signature change breaks the affected features until the plugin
  adapts
- Single-user use is recommended: DSH itself does not separate accounts, so a
  shared deployment needs isolation in front

## Update

Installed from npm: update to the new version and restart.

```bash
dsh plugin --profile web add dsh-web-mobile-pmsfh@latest
sudo systemctl restart dsh-web
```

Installed from source: pull the latest code in the cloned directory and
restart.

```bash
git pull
sudo systemctl restart dsh-web
```

## Uninstall

Remove the plugin from the `web` profile and restart:

```bash
dsh plugin --profile web remove dsh-web-mobile-pmsfh
sudo systemctl restart dsh-web
```

## Development

For local debugging, use a separate `DSH_HOME` and port so production data is
unaffected:

```bash
DSH_HOME=~/.dsh-test dsh --profile web --no-open --port 3080
```

- No build chain: the repository is the runtime artifact; changes land after a
  dsh-web restart (page files are read from disk per request)
- Syntax check with `node --check`, type check with `tsc --noEmit`
  (`@ts-check` applies per file)
- Debug hooks: the page exposes `__dshwm.dispatch()`, which injects synthetic
  mux frames to rehearse approval and question cards; `__frames` records the
  sequence of received frame types
- Soft-keyboard fit: `#app` is pinned to the visualViewport height, with the
  `interactive-widget=resizes-content` meta alongside, so the composer rides
  above the keyboard
- The dictionaries live in the `T` object at the top of `mobile/app.js` —
  Chinese and English key sets side by side; update both when changing UI copy

Implementation notes: static assets get content-hash ETags and return 304 on
repeat visits; bundled dependencies are cached for 30 days.

## License

[MIT](LICENSE) © 2026 renlang119
