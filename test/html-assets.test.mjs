// 资源引用防线：index.html 引用的本地资源若改名不同步会静默 404（样式丢失、
// 渲染降级都不报错）。这里双向对账：页面引用的每个文件都存在于 mobile/ 下，
// mobile/ 里的可执行资源也都被页面引用，防孤儿文件混进发布包。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const mount = '/dsh-web-mobile-pmsfh/'
const mobileDir = path.join(root, 'mobile')

function readHtml() {
  return fs.readFileSync(path.join(mobileDir, 'index.html'), 'utf8')
}

function localRefs() {
  return [...readHtml().matchAll(/(?:href|src)=["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((u) => u.startsWith(mount))
    .map((u) => u.slice(mount.length))
}

function diskAssets() {
  const files = []
  const walk = (dir, prefix) => {
    for (const name of fs.readdirSync(dir)) {
      if (!prefix && name === 'index.html') continue
      const full = path.join(dir, name)
      const rel = prefix ? `${prefix}/${name}` : name
      if (fs.statSync(full).isDirectory()) walk(full, rel)
      else files.push(rel)
    }
  }
  walk(mobileDir, '')
  return files.sort()
}

test('index.html references only assets that exist', () => {
  const missing = localRefs().filter((rel) => !fs.existsSync(path.join(mobileDir, rel)))
  assert.deepEqual(missing, [], `index.html 引用的资源缺失: ${missing.join(', ')}`)
})

test('every mobile asset is referenced by index.html', () => {
  const referenced = new Set(localRefs())
  const orphans = diskAssets().filter((rel) => !referenced.has(rel))
  assert.deepEqual(orphans, [], `mobile/ 下未被引用的资源: ${orphans.join(', ')}`)
})

test('every asset reference stays under the plugin mount', () => {
  const refs = [...readHtml().matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map((m) => m[1])
  const outside = refs.filter((ref) => !ref.startsWith(mount) && !ref.startsWith('data:'))
  assert.deepEqual(outside, [], `页面引用了挂载前缀之外的资源: ${outside.join(', ')}`)
})

test('vendor scripts load before app.js', () => {
  const srcs = [...readHtml().matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((m) => m[1])
  const app = srcs.indexOf(`${mount}app.js`)
  assert.ok(app >= 0, 'app.js script not found')
  const vendors = srcs.filter((src) => src.startsWith(`${mount}vendor/`))
  assert.ok(vendors.length > 0, 'no vendor script found')
  for (const vendor of vendors) {
    assert.ok(srcs.indexOf(vendor) < app, `${vendor} must load before app.js`)
  }
})
