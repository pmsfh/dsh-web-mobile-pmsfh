// 客户端跳转防线：桌面端 bundle 只负责把触屏窄屏带到移动页。这里用 vm
// 桩跑真实的 client/client.js，覆盖跳转、会话级逃生、FAB 与旧标记清理；
// 这些判断此前只能靠真机验证。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const sourcePath = fileURLToPath(new URL('../client/client.js', import.meta.url))
const LEGACY_KEY = 'dsh-web-mobile-pmsfh:desktop'

function storage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null },
    setItem(key, value) { map.set(key, String(value)) },
    removeItem(key) { map.delete(key) },
    has(key) { return map.has(key) },
  }
}

function blockedStorage() {
  const fail = () => { throw new Error('storage blocked') }
  return { getItem: fail, setItem: fail, removeItem: fail, has: fail }
}

function makeElement(tag) {
  return {
    tagName: tag.toUpperCase(),
    id: '',
    href: '',
    textContent: '',
    title: '',
    style: { cssText: '' },
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value) },
    appendChild() {},
  }
}

function loadClient(options = {}) {
  const {
    pathname = '/',
    coarse = false,
    narrow = false,
    escaped = false,
    language = 'zh-CN',
    legacy = false,
    badStorage = false,
  } = options
  const calls = []
  const warnings = []
  const elements = new Map()
  const bodyChildren = []
  const document = {
    body: {
      appendChild(node) {
        bodyChildren.push(node)
        if (node.id) elements.set(node.id, node)
      },
    },
    getElementById(id) { return elements.get(id) || null },
    createElement(tag) { return makeElement(tag) },
    addEventListener() {},
  }
  const localStorage = badStorage ? blockedStorage() : storage(legacy ? { [LEGACY_KEY]: '1' } : {})
  const sessionStorage = badStorage ? blockedStorage() : storage(escaped ? { [LEGACY_KEY]: '1' } : {})
  let exported = null
  const sandbox = {
    console: { warn: (...args) => warnings.push(args.join(' ')) },
    location: { pathname, replace(url) { calls.push(url) } },
    localStorage,
    sessionStorage,
    navigator: { language },
    document,
    matchMedia(query) {
      return { matches: query.includes('pointer') ? coarse : narrow }
    },
  }
  sandbox.window = sandbox
  sandbox.__ModuleLoader__ = {
    load(registration) {
      assert.equal(registration.id, 'dsh-web-mobile-pmsfh')
      exported = registration.factory(() => {})
    },
  }
  vm.runInNewContext(source, sandbox, { filename: sourcePath })
  assert.ok(exported, 'client bundle should register through __ModuleLoader__')
  exported.apply()
  return { calls, warnings, bodyChildren, elements, localStorage, sessionStorage, exported }
}

test('redirects a coarse, narrow phone that has not escaped', () => {
  const r = loadClient({ coarse: true, narrow: true, legacy: true })
  assert.deepEqual(r.calls, ['/dsh-web-mobile-pmsfh/'])
  assert.equal(r.bodyChildren.length, 0)
  assert.equal(r.localStorage.has(LEGACY_KEY), false)
  assert.equal(r.warnings.length, 0)
})

test('leaves a mouse pointer or a wide viewport on the desktop UI', () => {
  const mouse = loadClient({ coarse: false, narrow: true })
  assert.deepEqual(mouse.calls, [])
  assert.equal(mouse.bodyChildren.length, 0)

  const wide = loadClient({ coarse: true, narrow: false })
  assert.deepEqual(wide.calls, [])
  assert.equal(wide.bodyChildren.length, 0)
})

test('honours the session-scoped escape and adds a way back', () => {
  const r = loadClient({ escaped: true, coarse: true, narrow: true })
  assert.deepEqual(r.calls, [])
  assert.equal(r.bodyChildren.length, 1)
  const fab = r.bodyChildren[0]
  assert.equal(fab.id, 'dsh-web-mobile-pmsfh-fab')
  assert.equal(fab.href, '/dsh-web-mobile-pmsfh/')
  assert.equal(fab.textContent, '📱')
  assert.equal(fab.attrs['aria-label'], '移动版')
})

test('uses the English FAB label when the browser is not Chinese', () => {
  const r = loadClient({ escaped: true, coarse: true, narrow: true, language: 'en-US' })
  assert.equal(r.bodyChildren.length, 1)
  assert.equal(r.bodyChildren[0].attrs['aria-label'], 'Mobile version')
})

test('does not duplicate the FAB when apply runs again', () => {
  const r = loadClient({ escaped: true, coarse: true, narrow: true })
  assert.equal(r.bodyChildren.length, 1)
  r.exported.apply()
  assert.equal(r.bodyChildren.length, 1)
})

test('does nothing on the mobile page itself', () => {
  const r = loadClient({ pathname: '/dsh-web-mobile-pmsfh/', coarse: true, narrow: true })
  assert.deepEqual(r.calls, [])
  assert.equal(r.bodyChildren.length, 0)
})

test('clears the legacy permanent flag on the official UI', () => {
  const r = loadClient({ coarse: false, narrow: true, legacy: true })
  assert.equal(r.localStorage.has(LEGACY_KEY), false)
  assert.deepEqual(r.calls, [])
})

test('storage failures still redirect instead of blocking the page', () => {
  const r = loadClient({ coarse: true, narrow: true, badStorage: true })
  assert.deepEqual(r.calls, ['/dsh-web-mobile-pmsfh/'])
  assert.equal(r.bodyChildren.length, 0)
  assert.equal(r.warnings.length, 0)
})
