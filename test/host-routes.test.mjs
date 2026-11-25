// 宿主路由防线：鉴权失败、方法限制、静态缓存与安全响应头。这些路径此前
// 只靠手工探针，401/403/503、裸路径 302 与 304 都没有自动化覆盖。
import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

function createHarness(admitImpl = () => ({})) {
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
      return name === 'connection' ? { admit: admitImpl } : undefined
    },
  }
  apply(ctx)
  return routes
}

async function call(handler, { method = 'GET', headers = {} } = {}) {
  let status = 0
  const outHeaders = {}
  let body = Buffer.alloc(0)
  const req = { method, headers }
  const res = {
    writeHead(code, values) {
      status = code
      Object.assign(outHeaders, values || {})
    },
    end(value) {
      body = value === undefined ? Buffer.alloc(0) : Buffer.from(value)
    },
  }
  await handler(req, res)
  return { status, headers: outHeaders, body: body.toString('utf8') }
}

const paths = (routes) => [...routes.keys()]

test('every plugin route rejects unauthenticated and untrusted requests', async () => {
  const unauth = createHarness(() => ({ rejection: 401 }))
  const untrusted = createHarness(() => ({ rejection: 403 }))
  for (const path of paths(unauth)) {
    const a = await call(unauth.get(path))
    const b = await call(untrusted.get(path))
    assert.equal(a.status, 401, `${path} should be 401`)
    assert.equal(a.headers['x-content-type-options'], 'nosniff')
    assert.equal(b.status, 403, `${path} should be 403`)
    assert.equal(b.headers['x-content-type-options'], 'nosniff')
  }
})

test('auth service failure is fail-closed on every route', async () => {
  const routes = createHarness(() => { throw new Error('connection down') })
  for (const path of paths(routes)) {
    const res = await call(routes.get(path))
    assert.equal(res.status, 503, `${path} should be 503`)
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
  }
})

test('bare path redirects for GET and HEAD only', async () => {
  const routes = createHarness()
  const handler = routes.get('/dsh-web-mobile-pmsfh')
  const get = await call(handler)
  assert.equal(get.status, 302)
  assert.equal(get.headers.location, '/dsh-web-mobile-pmsfh/')

  const head = await call(handler, { method: 'HEAD' })
  assert.equal(head.status, 302)

  const post = await call(handler, { method: 'POST' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.allow, 'GET, HEAD')
  assert.equal(post.headers['x-content-type-options'], 'nosniff')
})

test('write methods are rejected on every asset route', async () => {
  const routes = createHarness()
  for (const path of paths(routes)) {
    const res = await call(routes.get(path), { method: 'POST' })
    assert.equal(res.status, 405, `${path} should be 405`)
    assert.equal(res.headers.allow, 'GET, HEAD')
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.equal(res.body, 'method not allowed')
  }
})

test('static assets carry nosniff, an ETag and the expected cache policy', async () => {
  const routes = createHarness()
  const app = await call(routes.get('/dsh-web-mobile-pmsfh/app.js'))
  assert.equal(app.status, 200)
  assert.match(app.headers['content-type'], /javascript/)
  assert.equal(app.headers['cache-control'], 'no-cache')
  assert.equal(app.headers['x-content-type-options'], 'nosniff')
  assert.ok(app.headers.etag)

  const cached = await call(routes.get('/dsh-web-mobile-pmsfh/app.js'), {
    headers: { 'if-none-match': app.headers.etag },
  })
  assert.equal(cached.status, 304)
  assert.equal(cached.body, '')
  assert.equal(cached.headers.etag, app.headers.etag)
  assert.equal(cached.headers['x-content-type-options'], 'nosniff')

  const vendor = await call(routes.get('/dsh-web-mobile-pmsfh/vendor/markdown-it.min.js'))
  assert.equal(vendor.status, 200)
  assert.equal(vendor.headers['cache-control'], 'public, max-age=2592000, immutable')
  assert.equal(vendor.headers['x-content-type-options'], 'nosniff')
})

test('HTML response keeps CSP, nosniff and the language vary', async () => {
  const routes = createHarness()
  const res = await call(routes.get('/dsh-web-mobile-pmsfh/'), {
    headers: { 'accept-language': 'en-US,en;q=0.9' },
  })
  assert.equal(res.status, 200)
  assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/)
  assert.equal(res.headers['x-content-type-options'], 'nosniff')
  assert.equal(res.headers.vary, 'accept-language')
  assert.match(res.body, /<html lang="en">/)
})

test('only whitelisted paths are registered', () => {
  const routes = createHarness()
  assert.equal(routes.has('/dsh-web-mobile-pmsfh/unknown'), false)
  assert.equal(routes.size, 6) // 5 assets + bare-path redirect
})
