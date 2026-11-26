// 设计令牌防线：var(--x) 拼错或令牌被删时，浏览器只会静默回落，样式
// 局部失效而不报错。这里对 app.css 做定义集与引用集对账。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs
  .readFileSync(new URL('../mobile/app.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

test('every CSS var() reference has a definition', () => {
  const defined = new Set([...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]))
  const used = new Set([...css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map((m) => m[1]))
  const missing = [...used].filter((name) => !defined.has(name)).sort()
  assert.deepEqual(missing, [], `CSS variables used but never defined: ${missing.join(', ')}`)
})
