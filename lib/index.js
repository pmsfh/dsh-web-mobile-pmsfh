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
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name. */
export const name = 'dsh-web-mobile-pmsfh'

/** Required services: the HTTP carrier only. */
export const inject = ['webServer']

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile')

/** Whitelisted asset table — request path → file + content type. */
const ASSETS = new Map([
  ['/dsh-web-mobile-pmsfh/', { file: 'index.html', type: 'text/html; charset=utf-8', cache: 'no-cache' }],
  ['/dsh-web-mobile-pmsfh/app.js', { file: 'app.js', type: 'text/javascript; charset=utf-8', cache: 'no-cache' }],
  ['/dsh-web-mobile-pmsfh/app.css', { file: 'app.css', type: 'text/css; charset=utf-8', cache: 'no-cache' }],
  // Vendored, version-pinned upstream files: immutable, cache hard.
  ['/dsh-web-mobile-pmsfh/vendor/markdown-it.min.js', { file: 'vendor/markdown-it.min.js', type: 'text/javascript; charset=utf-8', cache: 'public, max-age=2592000, immutable' }],
])

export function apply(ctx) {
  ctx.effect(() => {
    const disposers = []
    // Bare path (no trailing slash) → redirect to the canonical slash form.
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-web-mobile-pmsfh',
      handler: async (req, res) => {
        res.writeHead(302, { location: '/dsh-web-mobile-pmsfh/' })
        res.end()
      },
    }))
    for (const [path, spec] of ASSETS) {
      disposers.push(ctx.webServer.register({
        kind: 'exact',
        path,
        handler: async (req, res) => {
          try {
            const data = await readFile(join(ROOT, spec.file))
            res.writeHead(200, { 'content-type': spec.type, 'cache-control': spec.cache })
            res.end(data)
          } catch {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('not found')
          }
        },
      }))
    }
    return () => { for (const d of disposers) d() }
  }, 'dsh-web-mobile-pmsfh routes')
}
