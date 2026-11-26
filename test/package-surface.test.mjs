// 发布面防线：仓库即运行物，files 白名单、exports、挂载配置、锁定文件与
// engines 任何一处漂移都可能让用户装到缺文件或装不上的包。这里用真实的
// npm pack 清单对账，不靠手写文件列表。
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const pkg = readJson('package.json')
const lock = readJson('package-lock.json')

const RUNTIME_FILES = [
  'LICENSE',
  'README.en.md',
  'README.md',
  'client/client.js',
  'cordis.patch.yml',
  'lib/html-locale.js',
  'lib/index.js',
  'mobile/app.css',
  'mobile/app.js',
  'mobile/index.html',
  'mobile/vendor/markdown-it-cjk-friendly.min.js',
  'mobile/vendor/markdown-it.min.js',
  'package.json',
  'types.d.ts',
].sort()

test('package files whitelist covers runtime and excludes tests', () => {
  const files = pkg.files || []
  for (const expected of [
    'lib/',
    'client/',
    'mobile/',
    'cordis.patch.yml',
    'types.d.ts',
    'README.md',
    'README.en.md',
  ]) {
    assert.ok(files.includes(expected), `package.json files is missing ${expected}`)
  }
  assert.equal(files.some((entry) => entry.startsWith('test')), false)
  assert.equal(!pkg.private, true, 'package must stay publishable')
  assert.equal(pkg.license, 'MIT')
})

test('npm pack contains exactly the runtime package', () => {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const output = execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const pack = JSON.parse(output)[0]
  const packed = pack.files.map((file) => file.path).sort()
  assert.equal(pack.entryCount, RUNTIME_FILES.length)
  assert.deepEqual(packed, RUNTIME_FILES)
  assert.equal(packed.some((entry) => entry.startsWith('test/')), false)
})

test('main, exports and the cordis patch point at real files', () => {
  const targets = [pkg.main]
  for (const value of Object.values(pkg.exports || {})) {
    targets.push(typeof value === 'string' ? value : value.default)
  }
  for (const target of targets) {
    assert.ok(target, 'empty export target')
    assert.ok(fs.existsSync(path.join(root, target)), `missing export target ${target}`)
  }

  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.ok(fs.existsSync(path.join(root, pkg.dsh.bundle.patch)))
  assert.ok(Array.isArray(pkg.dsh.client.inject))

  const patch = fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
  assert.ok(patch.includes('- insert:'))
  assert.ok(patch.includes(`- id: ${pkg.name}`))
  assert.ok(patch.includes(`name: '${pkg.name}'`))
})

test('lockfile matches the package version and uses the official registry', () => {
  assert.equal(lock.version, pkg.version)
  assert.equal(lock.packages[''].version, pkg.version)

  const resolved = Object.values(lock.packages || {})
    .map((entry) => entry.resolved)
    .filter(Boolean)
  const bad = resolved.filter((url) => new URL(url).host !== 'registry.npmjs.org')
  assert.deepEqual(bad, [])

  const raw = fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')
  assert.equal(raw.includes('mirrors.tencentyun.com'), false)
})

test('engines declare the supported Node and DSH ranges', () => {
  assert.equal(pkg.engines.node, '>=24')
  assert.equal(pkg.engines.dsh, '>=0.2.2-rc.1 <0.2.3-0')
})
