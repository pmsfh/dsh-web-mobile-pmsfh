// @ts-check
/**
 * dsh-web-mobile-pmsfh host entry (v2.0): serves the standalone mobile page.
 *
 * The plugin's host half registers static routes under /dsh-web-mobile-pmsfh/ that
 * serve a self-contained mini chat app (mobile/index.html + app.js + app.css,
 * read from disk per request so a plugin update + dsh-web restart always
 * serves fresh bytes). The page talks directly to the DSH wire protocol
 * (POST /api/<method>, WS /api/events.mux, POST /api/respond) — it never
 * loads the official SPA bundle.
 *
 * The client half (client/client.js) only redirects coarse-pointer
 * narrow-viewport browsers from the official SPA to the mobile page.
 *
 * Zero main-repo changes. All routes sit behind the login gate (dsh-auth-gate).
 */
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localizeHtml, pickDocLang } from './html-locale.js'

/** @typedef {import('../types.d.ts').CordisContext} CordisContext */
/** @typedef {import('../types.d.ts').IncomingMessage} IncomingMessage */
/** @typedef {import('../types.d.ts').ServerResponse} ServerResponse */

/** Cordis plugin name. */
export const name = 'dsh-web-mobile-pmsfh'

/** Required services: the HTTP carrier + the host connection (for browser auth). */
export const inject = ['webServer', 'connection']

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile')

/**
 * Security headers for the HTML entry. The page renders model output through
 * markdown-it (html:false) into innerHTML, so a CSP is the second line of
 * defence against any sanitiser bypass; frame-ancestors/referrer round out the
 * standalone-deployment baseline. nosniff is added to every static response
 * via STATIC_HEADERS below.
 */
const HTML_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  // The HTML body varies by the first-frame language; keep caches honest.
  vary: 'accept-language',
}

/** Headers every static response carries, including the HTML entry. */
const STATIC_HEADERS = {
  'x-content-type-options': 'nosniff',
}

/** Whitelisted asset table — request path → file + content type. */
const ASSETS = new Map([
  ['/dsh-web-mobile-pmsfh/', { file: 'index.html', type: 'text/html; charset=utf-8', cache: 'no-cache', headers: HTML_HEADERS }],
  ['/dsh-web-mobile-pmsfh/app.js', { file: 'app.js', type: 'text/javascript; charset=utf-8', cache: 'no-cache' }],
  ['/dsh-web-mobile-pmsfh/app.css', { file: 'app.css', type: 'text/css; charset=utf-8', cache: 'no-cache' }],
  // Vendored, version-pinned upstream files: immutable, cache hard.
  ['/dsh-web-mobile-pmsfh/vendor/markdown-it.min.js', { file: 'vendor/markdown-it.min.js', type: 'text/javascript; charset=utf-8', cache: 'public, max-age=2592000, immutable' }],
  ['/dsh-web-mobile-pmsfh/vendor/markdown-it-cjk-friendly.min.js', { file: 'vendor/markdown-it-cjk-friendly.min.js', type: 'text/javascript; charset=utf-8', cache: 'public, max-age=2592000, immutable' }],
])

/**
 * Gate static routes with the host's own browser-session check.
 *
 * DSH's token gate only wraps the `/api` prefix; a third-party exact route is
 * otherwise reachable without the DSH cookie. `client-connection` exposes the
 * same admission check the API uses (trusted authority + browser session), so
 * an unauthenticated request gets the same 401 here. When a login gate such as
 * dsh-auth-gate sits in front, its 302 still wins for navigations.
 * @param {CordisContext} ctx
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @returns {boolean} true when the request may proceed
 */
function admit(ctx, req, res) {
  try {
    const svc = typeof ctx.get === 'function' ? ctx.get('connection') : ctx.connection
    if (!svc || typeof svc.admit !== 'function') throw new Error('connection service unavailable')
    const admission = svc.admit(req)
    if (admission && 'rejection' in admission) {
      res.writeHead(/** @type {number} */ (admission.rejection), {
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      })
      res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden')
      return false
    }
    return true
  } catch {
    res.writeHead(503, {
      'content-type': 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff',
    })
    res.end('auth unavailable')
    return false
  }
}

/**
 * Static routes serve reads only. HEAD is allowed because Node suppresses the
 * response body on its own; anything else gets a 405 with an explicit Allow.
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @returns {boolean} true when the method may proceed
 */
function allowMethod(req, res) {
  const method = String(req.method || 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return true
  res.writeHead(405, {
    allow: 'GET, HEAD',
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  res.end('method not allowed')
  return false
}

/** @param {CordisContext} ctx */
export function apply(ctx) {
  const webServer = ctx.webServer
  if (!webServer) throw new Error('webServer service unavailable')
  ctx.effect(() => {
    /** @type {(() => void)[]} */
    const disposers = []
    // Bare path (no trailing slash) → redirect to the canonical slash form.
    disposers.push(webServer.register({
      kind: 'exact',
      path: '/dsh-web-mobile-pmsfh',
      /** @param {IncomingMessage} req @param {ServerResponse} res */
      handler: async (req, res) => {
        if (!admit(ctx, req, res)) return
        if (!allowMethod(req, res)) return
        res.writeHead(302, { location: '/dsh-web-mobile-pmsfh/' })
        res.end()
      },
    }))
    for (const [path, spec] of ASSETS) {
      disposers.push(webServer.register({
        kind: 'exact',
        path,
        /** @param {IncomingMessage} req @param {ServerResponse} res */
        handler: async (req, res) => {
          if (!admit(ctx, req, res)) return
          if (!allowMethod(req, res)) return
          try {
            let data = await readFile(join(ROOT, spec.file))
            if (spec.file === 'index.html') {
              const lang = pickDocLang(req.headers['accept-language'])
              data = Buffer.from(localizeHtml(data.toString('utf8'), lang), 'utf8')
            }
            // Content hash as a validator: `no-cache` keeps updates immediate,
            // the ETag turns a repeat visit into a bodiless 304 instead of a
            // full re-download of app.js.
            const etag = '"' + createHash('sha1').update(data).digest('base64url').slice(0, 20) + '"'
            const headers = Object.assign({ 'content-type': spec.type, 'cache-control': spec.cache, etag }, STATIC_HEADERS, spec.headers || {})
            if (req.headers['if-none-match'] === etag) {
              res.writeHead(304, headers)
              res.end()
              return
            }
            res.writeHead(200, headers)
            res.end(data)
          } catch {
            res.writeHead(404, {
              'content-type': 'text/plain; charset=utf-8',
              'x-content-type-options': 'nosniff',
            })
            res.end('not found')
          }
        },
      }))
    }
    return () => { for (const d of disposers) d() }
  }, 'dsh-web-mobile-pmsfh routes')
}
