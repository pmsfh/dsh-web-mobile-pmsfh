// 行为冒烟：用 jsdom 载入真实 index.html + app.js，桩掉 fetch/WebSocket，
// 覆盖列表分组、聊天折叠与弹层交互。此前这些路径只在目标机手工点过。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'

const html = fs.readFileSync(new URL('../mobile/index.html', import.meta.url), 'utf8')
const appSource = fs.readFileSync(new URL('../mobile/app.js', import.meta.url), 'utf8')
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
  window.fetch = async (url, init = {}) => {
    const path = String(url)
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ path, body })
    let value = {}
    if (path.endsWith('/api/session/list')) value = { items: SESSIONS }
    else if (path.endsWith('/api/session/models')) value = { groups: [] }
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
  const context = dom.getInternalVMContext()
  vm.runInContext(mdSource, context, { filename: mdPath })
  vm.runInContext(cjkSource, context, { filename: cjkPath })
  vm.runInContext(appSource, context, { filename: appPath })

  const ws = WS.instances[0]
  assert.ok(ws, 'app should open one mux socket')
  ws.open()
  ws.emit('ev', { type: 'ready', clientId: 'client-1' })
  ws.emit('ws', { type: 'baseline', value: { items: WORKSPACES, archivedSessionIds: ARCHIVED } })

  return { dom, window, document: window.document, ws, calls, errors }
}

async function openChat(app, id = 's1') {
  app.window.history.replaceState(null, '', `#/s/${id}`)
  app.window.dispatchEvent(new app.window.Event('hashchange'))
  await waitFor(() => app.ws.sent.some((frame) => frame.streamId === `sf-${id}`))
}

function emitSnapshot(app, records, id = 's1') {
  app.ws.emit(`sf-${id}`, {
    type: 'snapshot',
    header: { running: false },
    cursor: 10,
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

  app.document.querySelector('.q-opt').click()
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
  assert.equal(sheet.querySelector('.fs-status').textContent, 'Saved on this device · Default · 15.0px')

  // Re-picking the current level is a no-op: nothing is written until a real change.
  sheet.querySelector('.fs-opt[data-scale="1"]').click()
  sheet.querySelector('.fs-chip[data-family="sans"]').click()
  assert.equal(app.window.localStorage.getItem(FONT_KEY), null)

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
  assert.equal(app.window.localStorage.getItem(FONT_KEY), '{"scale":1.125,"family":"sans"}')
  assert.equal(app.document.querySelector('.sheet'), sheet, 'panel stays open for preview')
  assert.equal(app.document.getElementById('app').inert, true)
  assert.equal(sheet.querySelectorAll('.fs-opt.on').length, 1)
  assert.equal(sheet.querySelector('.fs-opt.on').getAttribute('data-scale'), '1.125')
  assert.equal(sheet.querySelector('.fs-opt[data-scale="1"]').getAttribute('aria-checked'), 'false')
  assert.equal(sheet.querySelector('.fs-meta b').textContent, '16.9px')
  assert.equal(sheet.querySelector('.fs-status').textContent, 'Saved on this device · Large · 16.9px')

  sheet.querySelector('.fs-chip[data-family="serif"]').click()
  assert.match(cssVar(app, '--font-family'), /Songti SC/)
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
  assert.match(cssVar(good, '--font-family'), /ui-monospace/)
  const sheet = await openFontPanel(good)
  assert.equal(sheet.querySelector('.fs-opt.on').getAttribute('data-scale'), '1.25')
  assert.equal(sheet.querySelector('.fs-chip.on').getAttribute('data-family'), 'mono')
  assert.equal(sheet.querySelector('.fs-status').textContent, 'Saved on this device · Larger · 18.8px · Monospace')
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
    assert.match(cssVar(app, '--font-family'), label.endsWith('Serif') ? /Songti SC/ : /-apple-system/, raw)
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
  assert.match(cssVar(app, '--font-family'), /-apple-system/)
  assert.equal(app.window.localStorage.getItem(FONT_KEY), '{"scale":1,"family":"sans"}')
  assert.equal(app.document.querySelector('.sheet'), sheet)
  assert.equal(sheet.querySelector('.fs-opt.on').getAttribute('data-scale'), '1')
  assert.equal(sheet.querySelectorAll('.fs-opt[aria-checked="true"]').length, 1)
  assert.equal(sheet.querySelector('.fs-chip.on').getAttribute('data-family'), 'sans')
  assert.equal(sheet.querySelector('.fs-meta b').textContent, '15.0px')
  assert.equal(sheet.querySelector('.fs-status').textContent, 'Saved on this device · Default · 15.0px')
  assert.deepEqual(app.errors, [])
})
