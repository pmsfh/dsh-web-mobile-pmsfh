import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { apply } from '../lib/index.js'
import { localizeHtml } from '../lib/html-locale.js'

function createHarness() {
  const routes = new Map()
  const ctx = {
    webServer: {
      register(route) {
        routes.set(route.path, route.handler)
        return () => {}
      },
    },
    effect(fn) {
      return fn()
    },
    get(name) {
      if (name === 'connection') return { admit: () => ({}) }
      return undefined
    },
  }
  apply(ctx)
  return routes
}

function call(handler, acceptLanguage, ifNoneMatch) {
  const headers = {}
  let status = 0
  let body = ''
  const req = { headers: { 'accept-language': acceptLanguage } }
  if (ifNoneMatch) req.headers['if-none-match'] = ifNoneMatch
  const res = {
    writeHead(code, values) {
      status = code
      Object.assign(headers, values)
    },
    end(value) {
      body = value === undefined ? '' : Buffer.from(value).toString('utf8')
    },
  }
  return handler(req, res).then(() => ({ status, headers, body }))
}

test('HTML route localises title and lang, and varies on Accept-Language', async () => {
  const routes = createHarness()
  const handler = routes.get('/dsh-web-mobile-pmsfh/')
  assert.ok(handler)

  const en = await call(handler, 'en-US,en;q=0.9')
  assert.equal(en.status, 200)
  assert.equal(en.headers.vary, 'accept-language')
  assert.match(en.body, /<html lang="en">/)
  assert.match(en.body, /<title>Sessions · Mobile<\/title>/)

  const zh = await call(handler, 'zh-CN')
  assert.equal(zh.status, 200)
  assert.match(zh.body, /<html lang="zh-CN">/)
  assert.match(zh.body, /<title>会话 · 移动版<\/title>/)
  assert.notEqual(en.headers.etag, zh.headers.etag)

  const cached = await call(handler, 'en-US,en;q=0.9', en.headers.etag)
  assert.equal(cached.status, 304)
  assert.equal(cached.body, '')

  const switched = await call(handler, 'zh-CN', en.headers.etag)
  assert.equal(switched.status, 200)
  assert.match(switched.body, /<title>会话 · 移动版<\/title>/)
})

test('the real shell keeps its body and gets the selected title', async () => {
  const source = await readFile(new URL('../mobile/index.html', import.meta.url), 'utf8')
  const en = localizeHtml(source, 'en')
  assert.match(en, /<html lang="en">/)
  assert.match(en, /<title>Sessions · Mobile<\/title>/)
  assert.match(en, /<div id="app"><\/div>/)
  assert.match(en, /\/dsh-web-mobile-pmsfh\/app\.js/)
})