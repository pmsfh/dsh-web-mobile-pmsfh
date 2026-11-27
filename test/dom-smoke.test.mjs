// 行为冒烟：用 jsdom 载入真实 index.html + app.css + app.js，桩掉 fetch/WebSocket，
// 覆盖列表分组、聊天折叠与弹层交互。此前这些路径只在目标机手工点过。
// app.css 以内联 <style> 注入：app.js 启动时要从样式表读回正文基准（--font-base）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'

const html = fs.readFileSync(new URL('../mobile/index.html', import.meta.url), 'utf8')
const appSource = fs.readFileSync(new URL('../mobile/app.js', import.meta.url), 'utf8')
const cssSource = fs.readFileSync(new URL('../mobile/app.css', import.meta.url), 'utf8')
const mdSource = fs.readFileSync(new URL('../mobile/vendor/markdown-it.min.js', import.meta.url), 'utf8')
const cjkSource = fs.readFileSync(new URL('../mobile/vendor/markdown-it-cjk-friendly.min.js', import.meta.url), 'utf8')
const appPath = fileURLToPath(new URL('../mobile/app.js', import.meta.url))
const mdPath = fileURLToPath(new URL('../mobile/vendor/markdown-it.min.js', import.meta.url))
const cjkPath = fileURLToPath(new URL('../mobile/vendor/markdown-it-cjk-friendly.min.js', import.meta.url))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(predicate, timeout = 2000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (predicate()) return
    await sleep(10)
  }
  throw new Error('waitFor timeout')
}

function makeWebSocketClass() {
  return class FakeWebSocket {
    static instances = []
    constructor(url) {
      this.url = url
      this.readyState = 0
      this.sent = []
      this.onopen = null
      this.onmessage = null
      this.onclose = null
      this.onerror = null
      this.constructor.instances.push(this)
    }
    send(payload) {
      this.sent.push(JSON.parse(payload))
    }
    close() {
      this.readyState = 3
      if (this.onclose) this.onclose({})
    }
    open() {
      this.readyState = 1
      if (this.onopen) this.onopen({})
    }
    emit(streamId, value) {
      if (this.onmessage) this.onmessage({ data: JSON.stringify({ type: 'item', streamId, value }) })
    }
  }
}

const SESSIONS = [
  { sessionId: 's1', updatedAt: 100, blank: false, running: true, projections: { values: { title: 'Alpha' } } },
  { sessionId: 's2', updatedAt: 90, blank: false, projections: { values: { title: 'Beta' } } },
  { sessionId: 's3', updatedAt: 80, blank: true },
  { sessionId: 's4', updatedAt: 70, blank: false, origin: 'subagent', parentSessionId: 's1' },
  { sessionId: 's5', updatedAt: 60, blank: false, projections: { values: { title: 'Archived' } } },
  { sessionId: 's6', updatedAt: 50, blank: false, projections: { values: { title: 'Loose' } } },
]
const WORKSPACES = [
  { workspaceId: 'w1', title: 'W One', path: '/w1', sessionIds: ['s1', 's2', 's3', 's5'] },
  { workspaceId: 'w2', title: 'Empty', path: '/w2', sessionIds: [] },
]
const ARCHIVED = ['s5']

// opts.storage：app.js 跑之前先写进 localStorage 的键值（测本机偏好的读档路径）。
// opts.cssVars：app.js 跑之前先写到 <html> 行内样式的 CSS 变量（覆盖样式表里的值）。
function createApp(opts = {}) {
  const errors = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error) => errors.push(error))
  const dom = new JSDOM(html, {
    url: 'https://pmdsh.cc/dsh-web-mobile-pmsfh/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  })
  const { window } = dom
  window.console.error = (...args) => errors.push(args.map(String).join(' '))
  window.addEventListener('error', (event) => errors.push(String(event.message)))
  window.addEventListener('unhandledrejection', (event) => errors.push(`rejection:${String(event.reason)}`))

  const calls = []
  // opts.rpc：按路径后缀给 RPC 返回自定义 value；返回 { __error } 则模拟业务错误。
  const RPC = opts.rpc || {}
  window.fetch = async (url, init = {}) => {
    const path = String(url)
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ path, body })
    let value = {}
    if (path.endsWith('/api/session/list')) value = { items: opts.sessions || SESSIONS }
    else if (path.endsWith('/api/session/models')) value = { groups: [] }
    const custom = Object.keys(RPC).find((suffix) => path.endsWith(suffix))
    if (custom) {
      const out = RPC[custom](body)
      if (out && out.__error) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({ result: { ok: false, error: { message: out.__error } } }),
        }
      }
      value = out
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ result: { ok: true, value } }),
    }
  }
  const WS = makeWebSocketClass()
  window.WebSocket = WS
  for (const [key, value] of Object.entries(opts.storage || {})) window.localStorage.setItem(key, value)
  // jsdom 默认不取外链样式表：把真实 app.css 内联进去，getComputedStyle 才有东西可读。
  // opts.css === false 时不内联：测样式表未就绪、app.js 读不到基准的那条路径。
  if (opts.css !== false) {
    const style = window.document.createElement('style')
    style.textContent = cssSource
    window.document.head.appendChild(style)
  }
  for (const [name, value] of Object.entries(opts.cssVars || {})) window.document.documentElement.style.setProperty(name, value)
  const context = dom.getInternalVMContext()
  vm.runInContext(mdSource, context, { filename: mdPath })
  vm.runInContext(cjkSource, context, { filename: cjkPath })
  vm.runInContext(appSource, context, { filename: appPath })

  const ws = WS.instances[0]
  assert.ok(ws, 'app should open one mux socket')
  ws.open()
  ws.emit('ev', { type: 'ready', clientId: 'client-1' })
  ws.emit('ws', { type: 'baseline', value: { items: opts.workspaces || WORKSPACES, archivedSessionIds: ARCHIVED } })

  return { dom, window, document: window.document, ws, calls, errors }
}

async function openChat(app, id = 's1') {
  app.window.history.replaceState(null, '', `#/s/${id}`)
  app.window.dispatchEvent(new app.window.Event('hashchange'))
  await waitFor(() => app.ws.sent.some((frame) => frame.streamId === `sf-${id}`))
}

function emitSnapshot(app, records, id = 's1', cursor = 10) {
  app.ws.emit(`sf-${id}`, {
    type: 'snapshot',
    header: { running: false },
    cursor,
    hasMore: false,
    projections: { values: {} },
    records,
  })
}

async function openChatWithCard(app) {
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
  await openChat(app)
  const now = Date.now()
  emitSnapshot(app, [
    {
      event: {
        seq: 1, type: 'tool/call', time: now,
        data: { callId: 'c1', name: 'terminal_send', arguments: JSON.stringify({ text: 'echo hi' }) },
      },
    },
  ])
  await waitFor(() => app.document.querySelectorAll('.tcard').length === 1)
}

test('list groups by workspace and hides archived, blank and subagent sessions', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)

  const titles = [...app.document.querySelectorAll('.srow .t')].map((node) => node.textContent)
  assert.deepEqual(titles, ['Alpha', 'Beta', 'Loose'])
  assert.equal(app.document.querySelectorAll('.srow .dot.run').length, 1)

  const groups = [...app.document.querySelectorAll('.ws-group')].map((node) => ({
    name: node.querySelector('.ws-name').textContent,
    rows: node.querySelectorAll('.srow').length,
  }))
  assert.deepEqual(groups, [
    { name: 'W One', rows: 2 },
    { name: 'Empty', rows: 0 },
    { name: 'Ungrouped', rows: 1 },
  ])
  assert.equal(app.document.querySelectorAll('.ws-empty-hint').length, 1)
  assert.equal(app.document.querySelectorAll('.empty-cta').length, 1)
  assert.deepEqual(app.errors, [])
})

test('chat snapshot folds messages, markdown and tool cards', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
  await openChat(app)

  const now = Date.now()
  app.ws.emit('sf-s1', {
    type: 'snapshot',
    header: { running: false },
    cursor: 10,
    hasMore: false,
    projections: { values: {} },
    records: [
      {
        event: {
          seq: 1, type: 'user/message', time: now,
          data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'hello' }] },
        },
      },
      {
        event: {
          seq: 2, type: 'assistant/chunk', time: now,
          data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '**answer**' } },
        },
      },
      {
        event: {
          seq: 3, type: 'assistant/message', time: now,
          data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '**answer**' }] } },
        },
      },
      {
        event: {
          seq: 4, type: 'tool/call', time: now,
          data: { callId: 'c1', name: 'terminal_send', arguments: JSON.stringify({ text: 'echo hi' }) },
        },
      },
      {
        event: {
          seq: 5, type: 'tool/result', time: now,
          data: { message: { content: [{ toolCallId: 'c1', content: [{ type: 'text', text: 'done' }] }] } },
        },
      },
    ],
  })

  await waitFor(() => app.document.querySelectorAll('.msg').length >= 2)
  assert.match(app.document.querySelector('.msg.user').textContent, /hello/)
  assert.ok(app.document.querySelector('.msg.assistant .md strong'))
  assert.equal(app.document.querySelector('.tcard .tc-sum').textContent, 'echo hi')
  assert.equal(app.document.querySelector('.tcard .tc-result').textContent, 'done')

  app.window.__dshwm.dispatch('session/event', {
    sessionId: 's1',
    event: {
      seq: 20, type: 'assistant/chunk', time: now,
      data: { turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text: 'live **bold**' } },
    },
  })
  await waitFor(() => app.document.querySelectorAll('.msg.assistant.live').length === 1)
  app.window.__dshwm.dispatch('session/event', {
    sessionId: 's1',
    event: {
      seq: 21, type: 'assistant/message', time: now,
      data: { turn: 2, step: 1, message: { content: [{ type: 'text', text: 'live **bold**' }] } },
    },
  })
  await waitFor(() => app.document.querySelectorAll('.msg.assistant.live').length === 0)
  assert.ok(app.document.querySelectorAll('.msg.assistant .md strong').length >= 2)
  assert.deepEqual(app.errors, [])
})

test('approval modal shows the command, traps focus and answers once', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await openChatWithCard(app)

  app.window.__dshwm.dispatch(
    'approval/request',
    { toolName: 'terminal_send', reason: 'run the probe', callId: 'c1' },
    { clientId: 'client-1', eventId: 'ap1', agentId: 's1' },
  )
  await waitFor(() => app.document.querySelector('.sheet'))
  await sleep(80)

  assert.equal(app.document.querySelector('.sheet').getAttribute('aria-label'), 'Approval required')
  assert.equal(app.document.querySelector('.ap-tool').textContent, 'terminal_send')
  assert.equal(app.document.querySelector('.ap-args').textContent, 'echo hi')
  assert.equal(app.document.getElementById('app').inert, true)
  assert.ok(app.document.activeElement.closest('.sheet'))

  app.document.querySelector('.sheet-actions .btn-primary').click()
  await waitFor(() => !app.document.querySelector('.sheet'))
  await waitFor(() => app.document.querySelector('.hd .pending').hidden === true)
  const answer = app.calls.find((call) => call.path.includes('$events/result'))
  assert.ok(answer)
  assert.equal(answer.body.payload.args.outcome.kind, 'result')
  assert.equal(answer.body.payload.args.outcome.value, 'allowed-once')
  assert.equal(app.document.getElementById('app').inert, false)
  assert.equal(app.document.querySelector('.hd .pending').hidden, true)
  assert.deepEqual(app.errors, [])
})

test('question modal submits selected answers', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await openChatWithCard(app)

  app.window.__dshwm.dispatch(
    'user-questions/request',
    {
      questions: [{
        id: 'q1',
        header: 'Pick',
        question: 'Pick one',
        multiSelect: false,
        options: [{ label: 'A' }, { label: 'B' }],
      }],
    },
    { clientId: 'client-1', eventId: 'q1', agentId: 's1' },
  )
  await waitFor(() => app.document.querySelector('.q-text'))
  assert.equal(app.document.querySelector('.q-text').textContent, 'Pick one')

  const first = app.document.querySelector('.q-opt')
  assert.equal(first.getAttribute('role'), 'radio')
  assert.equal(first.getAttribute('aria-checked'), 'false')
  first.click()
  assert.equal(first.getAttribute('aria-checked'), 'true')
  assert.equal(app.document.querySelectorAll('.q-opt')[1].getAttribute('aria-checked'), 'false')
  app.document.querySelector('.sheet-actions .btn-primary').click()
  await waitFor(() => !app.document.querySelector('.sheet'))

  const answer = app.calls.find((call) => call.path.includes('$events/result'))
  assert.ok(answer)
  assert.deepEqual(answer.body.payload.args.outcome.value.answers[0].selected, ['A'])
  assert.deepEqual(app.errors, [])
})

test('Escape closes the modal and restores background interactivity', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await openChatWithCard(app)

  app.window.__dshwm.dispatch(
    'approval/request',
    { toolName: 'terminal_send', reason: 'run the probe', callId: 'c1' },
    { clientId: 'client-1', eventId: 'ap2', agentId: 's1' },
  )
  await waitFor(() => app.document.querySelector('.sheet'))
  await sleep(80)
  assert.equal(app.document.getElementById('app').inert, true)

  app.document.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await waitFor(() => !app.document.querySelector('.sheet'))
  assert.equal(app.document.getElementById('app').inert, false)
  assert.deepEqual(app.errors, [])
})

test('long press opens the session action sheet', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)

  const row = [...app.document.querySelectorAll('.srow')]
    .find((node) => node.querySelector('.t').textContent === 'Alpha')
  const touch = new app.window.Event('touchstart', { bubbles: true })
  Object.defineProperty(touch, 'touches', { value: [{ clientX: 10, clientY: 10 }] })
  row.dispatchEvent(touch)
  await sleep(560)
  await waitFor(() => app.document.querySelector('.sheet-title'))

  assert.equal(app.document.querySelector('.sheet-title').textContent, 'Session actions')
  const actions = [...app.document.querySelectorAll('.sheet-item')].map((node) => node.textContent)
  assert.ok(actions.some((text) => text.includes('Archive this session')))
  assert.deepEqual(app.errors, [])
})

test('markdown keeps raw HTML, javascript: and data: links inert', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
  await openChat(app)

  const payload = [
    '**bold** and [ok](https://example.com)',
    '<img src=x onerror="window.__xss=1">',
    '[js](javascript:alert(1))',
    '[data](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '![pic](https://example.com/a.png)',
  ].join('\n')
  emitSnapshot(app, [
    {
      event: {
        seq: 1, type: 'assistant/message', time: Date.now(),
        data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: payload }] } },
      },
    },
  ])

  await waitFor(() => app.document.querySelector('.msg.assistant .md'))
  const markdown = app.document.querySelector('.msg.assistant .md')
  assert.ok(markdown.querySelector('strong'))
  assert.equal(markdown.querySelector('a[href="https://example.com"]').textContent, 'ok')
  assert.equal(markdown.querySelectorAll('img').length, 0)
  const remote = markdown.querySelector('a[href="https://example.com/a.png"]')
  assert.ok(remote, 'remote image renders as a plain link')
  assert.equal(remote.textContent, 'pic')
  assert.equal(markdown.querySelectorAll('a[href^="javascript:"]').length, 0)
  assert.equal(markdown.querySelectorAll('a[href^="data:"]').length, 0)
  assert.match(markdown.textContent, /<img src=x/)
  assert.equal(app.window.__xss, undefined)
  assert.deepEqual(app.errors, [])
})

// ── 字号与字体（账户面板二级页）────────────────────────────────
// 界面语言跟随 navigator.language，jsdom 下是 en-US，断言用英文词条。
const FONT_KEY = 'dsh-web-mobile-pmsfh:font'
const cssVar = (app, name) => app.document.documentElement.style.getPropertyValue(name)
// 行内变量写的是 var(--font-<id>) 引用；解析后的字体栈从 computed style 取。
const cssComputed = (app, name) => app.window.getComputedStyle(app.document.documentElement).getPropertyValue(name)
const key = (app, target, k) => target.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: k, bubbles: true }))
const tabStops = (root, selector) => [...root.querySelectorAll(selector)].filter((node) => node.tabIndex === 0).map((node) => node.dataset.scale || node.dataset.family)

async function openFontPanel(app) {
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
  app.document.querySelector('.hd button[aria-label="Account"]').click()
  await waitFor(() => app.document.querySelector('.sheet .si-row'))
  app.document.querySelector('.sheet .si-row').click()
  await waitFor(() => app.document.querySelectorAll('.sheet .fs-opt').length === 5)
  return app.document.querySelector('.sheet')
}

test('account sheet lists the font entry above sign-out and re-renders in place', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
  app.document.querySelector('.hd button[aria-label="Account"]').click()
  await waitFor(() => app.document.querySelector('.sheet .si-row'))

  const sheet = app.document.querySelector('.sheet')
  assert.equal(sheet.getAttribute('aria-label'), 'Account')
  const rows = [...sheet.querySelectorAll('.sheet-item')]
  assert.equal(rows.length, 2)
  assert.ok(rows[0].classList.contains('si-row'), 'font entry comes first')
  assert.equal(rows[0].querySelector('.si-label').textContent, 'Font & size')
  assert.equal(rows[1].textContent, 'Sign out')
  assert.equal(rows[0].querySelector('.si-value').textContent, 'Default · 15.0px')
  assert.equal(rows[0].querySelector('.si-value.is-custom'), null)
  assert.equal(cssVar(app, '--font-scale'), '1')

  rows[0].click()
  await waitFor(() => sheet.querySelectorAll('.fs-opt').length === 5)
  assert.equal(app.document.querySelectorAll('.sheet').length, 1, 'same shell — no second dialog')
  assert.equal(sheet.getAttribute('aria-label'), 'Font & size')
  assert.equal(app.document.activeElement, sheet, 'focus lands on the re-labelled dialog')
  assert.equal(sheet.querySelector('.sheet-nav-title').textContent, 'Font & size')
  assert.equal(sheet.querySelector('.sheet-back').textContent, '‹ Account')
  assert.deepEqual(
    [...sheet.querySelectorAll('.fs-opt')].map((node) => [
      node.getAttribute('data-scale'), node.getAttribute('role'), node.getAttribute('aria-checked'),
      node.querySelector('.fs-opt-name').textContent, node.querySelector('.fs-opt-px').textContent,
    ]),
    [
      ['0.875', 'radio', 'false', 'Small', '13.1px'],
      ['1', 'radio', 'true', 'Default', '15.0px'],
      ['1.125', 'radio', 'false', 'Large', '16.9px'],
      ['1.25', 'radio', 'false', 'Larger', '18.8px'],
      ['1.375', 'radio', 'false', 'Largest', '20.6px'],
    ],
  )
  assert.deepEqual(
    [...sheet.querySelectorAll('.fs-chip')].map((node) => [
      node.getAttribute('data-family'), node.getAttribute('aria-checked'), node.textContent,
    ]),
    [['sans', 'true', 'AaSystem'], ['serif', 'false', 'AaSerif'], ['mono', 'false', 'AaMonospace']],
  )
  assert.equal(sheet.querySelector('.fs-meta b').textContent, '15.0px')
  // Nothing has been written yet: the status line stays empty until a real change.
  assert.equal(sheet.querySelector('.fs-status').textContent, '')
  assert.equal(sheet.querySelector('.fs-status').getAttribute('role'), 'status')
  // Roving tabindex: one Tab stop per group, on the checked option.
  assert.deepEqual(tabStops(sheet, '.fs-opt'), ['1'])
  assert.deepEqual(tabStops(sheet, '.fs-chip'), ['sans'])

  // Re-picking the current level is a no-op: nothing is written until a real change.
  sheet.querySelector('.fs-opt[data-scale="1"]').click()
  sheet.querySelector('.fs-chip[data-family="sans"]').click()
  assert.equal(app.window.localStorage.getItem(FONT_KEY), null)
  assert.equal(sheet.querySelector('.fs-status').textContent, '')

  sheet.querySelector('.sheet-back').click()
  await waitFor(() => app.document.querySelector('.sheet .si-row'))
  assert.equal(app.document.querySelectorAll('.fs-opt').length, 0)
  assert.equal(sheet.getAttribute('aria-label'), 'Account')
  assert.deepEqual(app.errors, [])
})

test('picking a size or family applies at once, keeps the panel open and persists', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  const sheet = await openFontPanel(app)

  sheet.querySelector('.fs-opt[data-scale="1.125"]').click()
  assert.equal(cssVar(app, '--font-scale'), '1.125')
  assert.deepEqual(tabStops(sheet, '.fs-opt'), ['1.125'])
  assert.equal(app.window.localStorage.getItem(FONT_KEY), '{"scale":1.125,"family":"sans"}')
  assert.equal(app.document.querySelector('.sheet'), sheet, 'panel stays open for preview')
  assert.equal(app.document.getElementById('app').inert, true)
  assert.equal(sheet.querySelectorAll('.fs-opt.on').length, 1)
  assert.equal(sheet.querySelector('.fs-opt.on').getAttribute('data-scale'), '1.125')
  assert.equal(sheet.querySelector('.fs-opt[data-scale="1"]').getAttribute('aria-checked'), 'false')
  assert.equal(sheet.querySelector('.fs-meta b').textContent, '16.9px')
  assert.equal(sheet.querySelector('.fs-status').textContent, 'Saved on this device · Large · 16.9px')

  sheet.querySelector('.fs-chip[data-family="serif"]').click()
  assert.deepEqual(tabStops(sheet, '.fs-chip'), ['serif'])
  // JS only names the family; the stack itself comes from the stylesheet.
  assert.equal(cssVar(app, '--font-family'), 'var(--font-serif)')
  assert.equal(cssComputed(app, '--font-family'), cssComputed(app, '--font-serif'))
  assert.match(cssComputed(app, '--font-family'), /Songti SC/)
  assert.equal(app.window.localStorage.getItem(FONT_KEY), '{"scale":1.125,"family":"serif"}')
  assert.equal(sheet.querySelectorAll('.fs-chip.on').length, 1)
  assert.equal(sheet.querySelector('.fs-chip.on').getAttribute('data-family'), 'serif')
  assert.equal(sheet.querySelector('.fs-status').textContent, 'Saved on this device · Large · 16.9px · Serif')

  // Back on the account page the entry row mirrors the new setting.
  sheet.querySelector('.sheet-back').click()
  const value = app.document.querySelector('.sheet .si-value')
  assert.equal(value.textContent, 'Large · 16.9px · Serif')
  assert.ok(value.classList.contains('is-custom'))

  app.document.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await waitFor(() => !app.document.querySelector('.sheet'))
  assert.equal(cssVar(app, '--font-scale'), '1.125', 'closing the panel keeps the setting')
  assert.deepEqual(app.errors, [])
})

test('saved font prefs apply at boot; anything outside the whitelist falls back to defaults', async (t) => {
  const good = createApp({ storage: { [FONT_KEY]: '{"scale":1.25,"family":"mono"}' } })
  t.after(() => good.dom.window.close())
  assert.equal(cssVar(good, '--font-scale'), '1.25', 'applied while app.js boots')
  assert.match(cssComputed(good, '--font-family'), /ui-monospace/)
  const sheet = await openFontPanel(good)
  assert.equal(sheet.querySelector('.fs-opt.on').getAttribute('data-scale'), '1.25')
  assert.equal(sheet.querySelector('.fs-chip.on').getAttribute('data-family'), 'mono')
  // Saved earlier, not in this visit: opening the panel alone never claims a save.
  assert.equal(sheet.querySelector('.fs-status').textContent, '')
  assert.deepEqual(tabStops(sheet, '.fs-opt'), ['1.25'])
  assert.deepEqual(tabStops(sheet, '.fs-chip'), ['mono'])
  assert.deepEqual(good.errors, [])

  // [stored value, expected account-row label]: scale must be one of the five preset
  // numbers, family one of the three ids; each field falls back on its own.
  const dirty = [
    ['{"scale":1.07,"family":"comic"}', 'Default · 15.0px'],
    ['{"scale":"1.25","family":"serif"}', 'Default · 15.0px · Serif'],
    ['{"scale":1.25,"family":"comic"}', 'Larger · 18.8px'],
    ['{not json', 'Default · 15.0px'],
    ['[]', 'Default · 15.0px'],
    ['null', 'Default · 15.0px'],
  ]
  for (const [raw, label] of dirty) {
    const app = createApp({ storage: { [FONT_KEY]: raw } })
    t.after(() => app.dom.window.close())
    await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
    app.document.querySelector('.hd button[aria-label="Account"]').click()
    await waitFor(() => app.document.querySelector('.sheet .si-value'))
    assert.equal(app.document.querySelector('.sheet .si-value').textContent, label, raw)
    assert.equal(cssVar(app, '--font-family'), label.endsWith('Serif') ? 'var(--font-serif)' : 'var(--font-sans)', raw)
    assert.equal(app.window.localStorage.getItem(FONT_KEY), raw, 'boot never rewrites the stored value')
    assert.deepEqual(app.errors, [])
  }
})

test('reset returns to defaults, writes them back and keeps the panel open', async (t) => {
  const app = createApp({ storage: { [FONT_KEY]: '{"scale":1.375,"family":"serif"}' } })
  t.after(() => app.dom.window.close())
  const sheet = await openFontPanel(app)
  assert.equal(sheet.querySelector('.fs-opt.on').getAttribute('data-scale'), '1.375')

  sheet.querySelector('.fs-reset').click()
  assert.equal(cssVar(app, '--font-scale'), '1')
  assert.equal(cssVar(app, '--font-family'), 'var(--font-sans)')
  assert.deepEqual(tabStops(sheet, '.fs-opt'), ['1'])
  assert.deepEqual(tabStops(sheet, '.fs-chip'), ['sans'])
  assert.equal(app.window.localStorage.getItem(FONT_KEY), '{"scale":1,"family":"sans"}')
  assert.equal(app.document.querySelector('.sheet'), sheet)
  assert.equal(sheet.querySelector('.fs-opt.on').getAttribute('data-scale'), '1')
  assert.equal(sheet.querySelectorAll('.fs-opt[aria-checked="true"]').length, 1)
  assert.equal(sheet.querySelector('.fs-chip.on').getAttribute('data-family'), 'sans')
  assert.equal(sheet.querySelector('.fs-meta b').textContent, '15.0px')
  assert.equal(sheet.querySelector('.fs-status').textContent, 'Saved on this device · Default · 15.0px')
  assert.deepEqual(app.errors, [])
})

test('the base size falls back to 15px when --font-base cannot be read', async (t) => {
  // 两条读不到的路径：样式表未就绪（变量不存在），值在但不是 px（parseFloat 得 NaN）。
  const unreadable = [
    ['stylesheet missing', createApp({ css: false })],
    ['value is not px', createApp({ cssVars: { '--font-base': 'inherit' } })],
  ]
  for (const [, app] of unreadable) {
    t.after(() => app.dom.window.close())
    // 前提：这个环境里确实读不出数字，否则下面的断言测的不是兜底。
    const read = parseFloat(cssComputed(app, '--font-base'))
    assert.ok(Number.isNaN(read), `--font-base must not parse as a number here, got ${read}`)
    const sheet = await openFontPanel(app)
    const px = [...sheet.querySelectorAll('.fs-opt')].map((node) => node.querySelector('.fs-opt-px').textContent)
    assert.deepEqual(px, ['13.1px', '15.0px', '16.9px', '18.8px', '20.6px'])
    assert.equal(sheet.querySelector('.fs-meta b').textContent, '15.0px')
    assert.ok(!/NaN/.test(sheet.textContent), `no NaN leaks into the panel: ${sheet.textContent}`)
    sheet.querySelector('.sheet-back').click()
    await waitFor(() => app.document.querySelector('.sheet .si-row'))
    assert.equal(app.document.querySelector('.sheet .si-value').textContent, 'Default · 15.0px')
    assert.deepEqual(app.errors, [])
  }
})

test('arrow keys step through both groups, select as they go and keep one Tab stop', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  const sheet = await openFontPanel(app)
  const opt = (scale) => sheet.querySelector(`.fs-opt[data-scale="${scale}"]`)
  const chip = (family) => sheet.querySelector(`.fs-chip[data-family="${family}"]`)

  // ArrowDown from the checked size picks the next one and takes focus along.
  opt('1').focus()
  key(app, opt('1'), 'ArrowDown')
  assert.equal(app.document.activeElement, opt('1.125'), 'focus follows the selection')
  assert.equal(opt('1.125').getAttribute('aria-checked'), 'true')
  assert.equal(opt('1').getAttribute('aria-checked'), 'false')
  assert.equal(cssVar(app, '--font-scale'), '1.125')
  assert.deepEqual(tabStops(sheet, '.fs-opt'), ['1.125'])

  // ArrowUp / ArrowRight behave the same way; both ends wrap around.
  key(app, opt('1.125'), 'ArrowUp')
  assert.equal(cssVar(app, '--font-scale'), '1')
  key(app, opt('1'), 'ArrowUp')
  assert.equal(cssVar(app, '--font-scale'), '0.875')
  key(app, opt('0.875'), 'ArrowUp')
  assert.equal(cssVar(app, '--font-scale'), '1.375', 'up from the first wraps to the last')
  key(app, opt('1.375'), 'ArrowDown')
  assert.equal(cssVar(app, '--font-scale'), '0.875', 'down from the last wraps to the first')
  key(app, opt('0.875'), 'ArrowRight')
  assert.equal(cssVar(app, '--font-scale'), '1')

  // Any other key is left alone.
  key(app, opt('1'), 'a')
  assert.equal(cssVar(app, '--font-scale'), '1')
  assert.equal(app.document.activeElement, opt('1'))

  // Family group: ArrowRight picks the next family, ArrowLeft the previous one, both wrap.
  chip('sans').focus()
  key(app, chip('sans'), 'ArrowRight')
  assert.equal(app.document.activeElement, chip('serif'))
  assert.equal(chip('serif').getAttribute('aria-checked'), 'true')
  assert.equal(cssVar(app, '--font-family'), 'var(--font-serif)')
  assert.deepEqual(tabStops(sheet, '.fs-chip'), ['serif'])
  key(app, chip('serif'), 'ArrowLeft')
  assert.equal(cssVar(app, '--font-family'), 'var(--font-sans)')
  key(app, chip('sans'), 'ArrowLeft')
  assert.equal(cssVar(app, '--font-family'), 'var(--font-mono)', 'left from the first wraps to the last')
  key(app, chip('mono'), 'ArrowDown')
  assert.equal(cssVar(app, '--font-family'), 'var(--font-sans)')
  key(app, chip('sans'), 'ArrowUp')
  assert.equal(cssVar(app, '--font-family'), 'var(--font-mono)')

  // A keyboard pick is a real save, exactly like tapping.
  assert.equal(sheet.querySelector('.fs-status').textContent, 'Saved on this device · Default · 15.0px · Monospace')
  assert.equal(app.window.localStorage.getItem(FONT_KEY), '{"scale":1,"family":"mono"}')
  assert.equal(app.document.querySelector('.sheet'), sheet, 'panel stays open')
  // Tab order across the whole panel: close, back, one stop per group, reset.
  assert.deepEqual(
    [...sheet.querySelectorAll('button')].filter((node) => node.tabIndex === 0).map((node) => node.classList[0]),
    ['sheet-close', 'sheet-back', 'fs-opt', 'effort-chip', 'fs-reset'],
  )
  assert.deepEqual(app.errors, [])
})

test('Escape steps back from the font page before it closes the panel', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  const sheet = await openFontPanel(app)
  const escape = () => app.document.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

  // First Esc: back to the account page, same shell, nothing closed.
  escape()
  await waitFor(() => app.document.querySelector('.sheet .si-row'))
  assert.equal(app.document.querySelector('.sheet'), sheet, 'same shell — still open')
  assert.equal(sheet.querySelectorAll('.fs-opt').length, 0)
  assert.equal(sheet.getAttribute('aria-label'), 'Account')
  assert.equal(app.document.getElementById('app').inert, true)

  // Second Esc: closes, as on any other panel.
  escape()
  await waitFor(() => !app.document.querySelector('.sheet'))
  assert.equal(app.document.getElementById('app').inert, false)

  // The close button is not a back button: on the font page it closes the whole panel.
  await openFontPanel(app)
  sheet.querySelector('.sheet-close').click()
  await waitFor(() => !app.document.querySelector('.sheet'))
  assert.equal(app.document.getElementById('app').inert, false)
  assert.deepEqual(app.errors, [])
})

test('the base text size lives in the stylesheet alone; readouts and rendering follow it', async (t) => {
  const app = createApp({ cssVars: { '--font-base': '16px' } })
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
  app.document.querySelector('.hd button[aria-label="Account"]').click()
  await waitFor(() => app.document.querySelector('.sheet .si-row'))
  assert.equal(app.document.querySelector('.sheet .si-value').textContent, 'Default · 16.0px')
  app.document.querySelector('.sheet .si-row').click()
  await waitFor(() => app.document.querySelectorAll('.sheet .fs-opt').length === 5)
  const sheet = app.document.querySelector('.sheet')
  assert.deepEqual(
    [...sheet.querySelectorAll('.fs-opt-px')].map((node) => node.textContent),
    ['14.0px', '16.0px', '18.0px', '20.0px', '22.0px'],
  )
  assert.equal(sheet.querySelector('.fs-meta b').textContent, '16.0px')
  assert.equal(app.window.getComputedStyle(app.document.body).fontSize, '16px', 'body text is sized from the same value')

  sheet.querySelector('.fs-opt[data-scale="1.125"]').click()
  assert.equal(sheet.querySelector('.fs-status').textContent, 'Saved on this device · Large · 18.0px')
  assert.equal(app.window.getComputedStyle(app.document.body).fontSize, '18px')
  assert.deepEqual(app.errors, [])
})

// ── 新建工作区：选目录只是暂存，确认建会话时才落库 ──────────────
const DIR_LIST = {
  path: '/home/ubuntu',
  crumbs: [{ name: 'home', path: '/home' }],
  entries: [{ name: 'proj', path: '/home/ubuntu/proj', hidden: false }],
  truncated: false,
}
const createCalls = (app) => app.calls.filter((c) => c.path.endsWith('/api/workspace/create'))
const deleteCalls = (app) => app.calls.filter((c) => c.path.endsWith('/api/workspace/delete'))

async function openNewSheet(app) {
  await waitFor(() => app.document.querySelector('.srow') || app.document.querySelector('.empty-cta'))
  app.document.querySelector('.hd button[aria-label="New session"]').click()
  await waitFor(() => app.document.querySelector('.sheet .sheet-item'))
}

// 入口选择页 →「新建工作区」→ 目录浏览器 →「使用此目录」→ 待创建面板
async function openFolderPicker(app) {
  await openNewSheet(app)
  ;[...app.document.querySelectorAll('.sheet .sheet-item')].find((b) => b.textContent.includes('New workspace')).click()
  await waitFor(() => app.document.querySelector('.sheet .dir-row'))
  ;[...app.document.querySelectorAll('.sheet .cs-create')].find((b) => b.textContent.includes('Use this folder')).click()
  await waitFor(() => app.document.querySelector('.sheet .cs-ws.active'))
}

test('picking a folder only stages the workspace; creating the session materializes it', async (t) => {
  const app = createApp({ rpc: {
    '/api/directoryPicker/list': () => DIR_LIST,
    '/api/workspace/create': () => ({ workspace: { workspaceId: 'w9', path: '/home/ubuntu', title: 'ubuntu' } }),
    '/api/session/create': () => ({ sessionId: 's9' }),
  } })
  t.after(() => app.dom.window.close())
  await openFolderPicker(app)
  assert.equal(createCalls(app).length, 0, 'picking a folder must not write a workspace yet')
  assert.match(app.document.querySelector('.sheet .cs-ws.active').textContent, /ubuntu/)
  assert.match(app.document.querySelector('.sheet .cs-perm.active').textContent, /Workspace Write/, 'permission defaults to workspace write')

  ;[...app.document.querySelectorAll('.sheet .cs-create')].find((b) => b.textContent.includes('Create workspace and session')).click()
  await waitFor(() => app.calls.some((c) => c.path.endsWith('/api/session/create')))
  const wsCall = createCalls(app)[0]
  const sesCall = app.calls.find((c) => c.path.endsWith('/api/session/create'))
  assert.equal(wsCall.body.payload.args.request.path, '/home/ubuntu')
  assert.equal(sesCall.body.payload.args.request.workspaceId, 'w9')
  assert.ok(app.calls.indexOf(wsCall) < app.calls.indexOf(sesCall), 'workspace is created before the session')
  assert.deepEqual(app.errors, [])
})

test('leaving the create sheet after picking a folder leaves nothing behind', async (t) => {
  const app = createApp({ rpc: { '/api/directoryPicker/list': () => DIR_LIST } })
  t.after(() => app.dom.window.close())
  await openFolderPicker(app)
  app.document.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await waitFor(() => !app.document.querySelector('.sheet'))
  assert.equal(createCalls(app).length, 0)
  assert.equal(deleteCalls(app).length, 0)
  assert.deepEqual(app.errors, [])
})

test('a failed session removes the workspace it just created', async (t) => {
  const app = createApp({ rpc: {
    '/api/directoryPicker/list': () => DIR_LIST,
    '/api/workspace/create': () => ({ workspace: { workspaceId: 'w9', path: '/home/ubuntu' } }),
    '/api/session/create': () => ({ __error: 'boom' }),
  } })
  t.after(() => app.dom.window.close())
  await openFolderPicker(app)
  ;[...app.document.querySelectorAll('.sheet .cs-create')].find((b) => b.textContent.includes('Create workspace and session')).click()
  await waitFor(() => deleteCalls(app).length === 1)
  assert.equal(deleteCalls(app)[0].body.payload.args.request.workspaceId, 'w9')
})

test('a new workspace always comes with a session', async (t) => {
  const app = createApp({ rpc: {
    '/api/directoryPicker/list': () => DIR_LIST,
    '/api/workspace/create': () => ({ workspace: { workspaceId: 'w9', path: '/home/ubuntu' } }),
    '/api/session/create': () => ({ sessionId: 's9' }),
  } })
  t.after(() => app.dom.window.close())
  await openFolderPicker(app)
  assert.equal(app.document.querySelector('.sheet .cs-create-only'), null, 'no workspace-only action')
  assert.deepEqual(
    [...app.document.querySelectorAll('.sheet .cs-create')].map((b) => b.textContent),
    ['Create workspace and session'],
  )
  app.document.querySelector('.sheet .cs-create').click()
  await waitFor(() => app.calls.some((c) => c.path.endsWith('/api/session/create')))
  assert.equal(createCalls(app).length, 1)
  assert.deepEqual(app.errors, [])
})

test('an existing-workspace session never offers workspace creation', async (t) => {
  const app = createApp({ rpc: { '/api/session/create': () => ({ sessionId: 's9' }) } })
  t.after(() => app.dom.window.close())
  await openNewSheet(app)
  ;[...app.document.querySelectorAll('.sheet .sheet-item')].find((b) => b.textContent.includes('New session')).click()
  await waitFor(() => app.document.querySelector('.sheet .cs-ws'))
  assert.equal(app.document.querySelector('.sheet .cs-ws-new'), null, 'no workspace-creation entry in this flow')
  assert.equal(app.document.querySelectorAll('.sheet .cs-ws').length, 2)
  app.document.querySelectorAll('.sheet .cs-ws')[0].click()
  ;[...app.document.querySelectorAll('.sheet .cs-create')].find((b) => b.textContent.includes('Create session')).click()
  await waitFor(() => app.calls.some((c) => c.path.endsWith('/api/session/create')))
  assert.equal(createCalls(app).length, 0)
  assert.deepEqual(app.errors, [])
})

test('with no workspace the only entry is the workspace flow', async (t) => {
  const app = createApp({ workspaces: [], sessions: [], rpc: { '/api/directoryPicker/list': () => DIR_LIST } })
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelector('.empty-cta'))
  assert.equal(app.document.querySelector('.empty-cta').textContent, 'New workspace')
  app.document.querySelector('.empty-cta').click()
  await waitFor(() => app.document.querySelector('.sheet .dir-row'))
  assert.equal(app.document.querySelectorAll('.sheet .cs-ws').length, 0)
  assert.equal(app.document.querySelector('.sheet .cs-ws-new'), null)
  assert.deepEqual(app.errors, [])
})

test('a failed directory listing closes the sheet instead of looping', async (t) => {
  const app = createApp({ rpc: { '/api/directoryPicker/list': () => ({ __error: 'boom' }) } })
  t.after(() => app.dom.window.close())
  await openNewSheet(app)
  ;[...app.document.querySelectorAll('.sheet .sheet-item')].find((b) => b.textContent.includes('New workspace')).click()
  await waitFor(() => app.document.querySelector('.sheet .btn-ghost'))
  assert.match(app.document.querySelector('.sheet .btn-ghost').textContent, /Close/)
  const before = app.calls.filter((c) => c.path.endsWith('/api/directoryPicker/list')).length
  app.document.querySelector('.sheet .btn-ghost').click()
  await waitFor(() => !app.document.querySelector('.sheet'))
  assert.equal(app.calls.filter((c) => c.path.endsWith('/api/directoryPicker/list')).length, before)
})

test('a reconnect snapshot keeps the composer draft', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
  await openChat(app)
  emitSnapshot(app, [])
  await waitFor(() => app.document.querySelector('.c-input'))

  const input = app.document.querySelector('.c-input')
  input.value = '半截草稿'
  input.dispatchEvent(new app.window.Event('input', { bubbles: true }))

  // 重连：同一条 follow 流重发快照，整棵树重建
  emitSnapshot(app, [{
    event: {
      seq: 1, type: 'user/message', time: Date.now(),
      data: { source: { kind: 'user' }, content: [{ type: 'text', text: '你好' }] },
    },
  }])
  await waitFor(() => app.document.querySelectorAll('.msg.user').length === 1)

  assert.equal(app.document.querySelector('.c-input').value, '半截草稿')
  assert.equal(app.document.querySelector('.c-send').disabled, false)
  assert.deepEqual(app.errors, [])
})

test('sending clears the draft so a rebuild does not bring it back', async (t) => {
  const app = createApp({ rpc: { '/api/session/prompt': () => ({ ok: true }) } })
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
  await openChat(app)
  emitSnapshot(app, [])
  await waitFor(() => app.document.querySelector('.c-input'))

  const input = app.document.querySelector('.c-input')
  input.value = '要发的话'
  input.dispatchEvent(new app.window.Event('input', { bubbles: true }))
  app.document.querySelector('.c-send').click()
  await waitFor(() => input.value === '')

  emitSnapshot(app, [])
  await waitFor(() => app.document.querySelector('.c-input'))
  assert.equal(app.document.querySelector('.c-input').value, '')
  assert.deepEqual(app.errors, [])
})

test('a failed send puts the text back in the composer', async (t) => {
  const app = createApp({ rpc: { '/api/session/prompt': () => ({ __error: 'boom' }) } })
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
  await openChat(app)
  emitSnapshot(app, [])
  await waitFor(() => app.document.querySelector('.c-input'))

  const input = app.document.querySelector('.c-input')
  input.value = '发不出去的话'
  input.dispatchEvent(new app.window.Event('input', { bubbles: true }))
  app.document.querySelector('.c-send').click()
  await waitFor(() => input.value === '发不出去的话')

  assert.equal(app.document.querySelector('.c-send').disabled, false)
  // 重建后草稿也还在
  emitSnapshot(app, [])
  await waitFor(() => app.document.querySelector('.c-input'))
  assert.equal(app.document.querySelector('.c-input').value, '发不出去的话')
})

test('file bytes encode to base64 across chunk boundaries', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())

  const small = new app.window.File(['hello world'], 'a.txt')
  const smallB64 = await new Promise((resolve, reject) => {
    app.window.__dshwm.encodeFile(small, resolve, () => reject(new Error('encode failed')))
  })
  assert.equal(smallB64, 'aGVsbG8gd29ybGQ=')

  const bytes = new Uint8Array(100000).fill(65)
  const big = new app.window.File([bytes.buffer], 'big.bin')
  const bigB64 = await new Promise((resolve, reject) => {
    app.window.__dshwm.encodeFile(big, resolve, () => reject(new Error('encode failed')))
  })
  const decoded = Buffer.from(bigB64, 'base64')
  assert.equal(decoded.length, bytes.length)
  assert.equal(decoded[0], 65)
  assert.equal(decoded[bytes.length - 1], 65)
})

test('a toast stays readable while a sheet is open', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)

  ;[...app.document.querySelectorAll('.hd button')].find((b) => /Account|账户/.test(b.getAttribute('aria-label') || '')).click()
  await waitFor(() => app.document.querySelector('.sheet'))
  assert.equal(app.document.getElementById('app').getAttribute('aria-hidden'), 'true', 'background is hidden from assistive tech')

  app.window.__dshwm.toast('上传中')
  const toast = app.document.querySelector('.mtoast')
  assert.equal(toast.textContent, '上传中')
  assert.equal(toast.hasAttribute('aria-hidden'), false, 'toast is not hidden from assistive tech')
  assert.notEqual(toast.inert, true)
})

test('a snapshot keeps live events newer than its cursor without duplicating', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
  await openChat(app)
  emitSnapshot(app, [])
  await waitFor(() => app.document.querySelector('.c-input'))

  app.ws.emit('sf-s1', {
    type: 'event',
    event: { seq: 11, type: 'user/message', time: Date.now(), data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'live' }] } },
  })
  await waitFor(() => app.document.querySelectorAll('.msg.user').length === 1)

  // 重连快照：cursor 仍停在 10，records 只带回 seq 12
  emitSnapshot(app, [{
    event: { seq: 12, type: 'user/message', time: Date.now(), data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'snap' }] } },
  }], 's1', 10)
  await waitFor(() => app.document.querySelectorAll('.msg.user').length === 2)

  const texts = [...app.document.querySelectorAll('.msg.user')].map((n) => n.firstChild.textContent)
  assert.deepEqual(texts, ['live', 'snap'])
  assert.deepEqual(app.errors, [])
})

test('a snapshot without a cursor does not replay old live events', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await waitFor(() => app.document.querySelectorAll('.srow').length === 3)
  await openChat(app)
  emitSnapshot(app, [])
  await waitFor(() => app.document.querySelector('.c-input'))

  app.ws.emit('sf-s1', {
    type: 'event',
    event: { seq: 11, type: 'user/message', time: Date.now(), data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'live' }] } },
  })
  await waitFor(() => app.document.querySelectorAll('.msg.user').length === 1)

  emitSnapshot(app, [], 's1', null)
  assert.equal(app.document.querySelectorAll('.msg.user').length, 0, 'unknown cursor means trust the snapshot only')
  assert.deepEqual(app.errors, [])
})

test('workspace and permission choices expose their pressed state', async (t) => {
  const app = createApp({ rpc: { '/api/directoryPicker/list': () => DIR_LIST } })
  t.after(() => app.dom.window.close())
  await openFolderPicker(app)

  const ws = app.document.querySelector('.sheet .cs-ws')
  assert.equal(ws.getAttribute('aria-pressed'), 'true', 'staged folder is selected')
  const perms = [...app.document.querySelectorAll('.sheet .cs-perm')]
  assert.deepEqual(perms.map((b) => b.getAttribute('aria-pressed')), ['false', 'true', 'false'])

  perms[0].click()
  assert.deepEqual(perms.map((b) => b.getAttribute('aria-pressed')), ['true', 'false', 'false'])
  assert.deepEqual(app.errors, [])
})

test('tool card header reports its expanded state', async (t) => {
  const app = createApp()
  t.after(() => app.dom.window.close())
  await openChatWithCard(app)
  const head = app.document.querySelector('.tc-head')
  assert.equal(head.getAttribute('aria-expanded'), 'false')
  head.click()
  assert.equal(head.getAttribute('aria-expanded'), 'true')
  head.click()
  assert.equal(head.getAttribute('aria-expanded'), 'false')
  assert.deepEqual(app.errors, [])
})
