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

function localRefs() {
  const html = fs.readFileSync(path.join(mobileDir, 'index.html'), 'utf8')
  return [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => u.startsWith(mount))
    .map((u) => u.slice(mount.length))
}

function diskAssets() {
  const files = []
  for (const name of fs.readdirSync(mobileDir)) {
    if (name === 'index.html') continue
    const full = path.join(mobileDir, name)
    if (fs.statSync(full).isDirectory()) {
      for (const sub of fs.readdirSync(full)) files.push(`${name}/${sub}`)
    } else {
      files.push(name)
    }
  }
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
