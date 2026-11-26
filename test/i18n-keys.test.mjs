// 静态对账：mobile/app.js 中每个 T.<key> 用点都必须在中文、英文两套词条里存在，
// 两套键集合必须一致。tsc 与运行时测试都发现不了这类对象键缺失，故单列一条。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const SRC_PATH = fileURLToPath(new URL('../mobile/app.js', import.meta.url))
const src = fs.readFileSync(SRC_PATH, 'utf8')

/** Blank out comments and quoted strings, keeping newlines and code shape. */
function codeOnly(text) {
  let out = ''
  let quote = null
  for (let i = 0; i < text.length;) {
    const c = text[i]
    const n = text[i + 1]
    if (quote) {
      if (c === '\\') { out += '  '; i += 2; continue }
      if (c === quote) { quote = null; out += ' '; i++; continue }
      out += c === '\n' ? '\n' : ' '
      i++
      continue
    }
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') { out += ' '; i++ }
      continue
    }
    if (c === '/' && n === '*') {
      out += '  '; i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : ' '
        i++
      }
      out += '  '; i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += ' '; i++; continue }
    out += c
    i++
  }
  return out
}

function matchBrace(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

function collectKeys(objText) {
  const keys = []
  const seen = new Set()
  const dupes = []
  const re = /^\s{2,}([A-Za-z_$][\w$]*)\s*:/gm
  let m
  while ((m = re.exec(objText))) {
    if (seen.has(m[1])) dupes.push(m[1])
    seen.add(m[1])
    keys.push(m[1])
  }
  return { keys, dupes }
}

const anchor = src.indexOf('var T = zh ?')
assert.ok(anchor >= 0, 'T conditional initializer not found in mobile/app.js')
const zhOpen = src.indexOf('{', anchor)
const zhClose = matchBrace(src, zhOpen)
assert.ok(zhClose > zhOpen, 'zh locale object literal is not closed')
const enOpen = src.indexOf('{', zhClose)
const enClose = matchBrace(src, enOpen)
assert.ok(enClose > enOpen, 'en locale object literal is not closed')

const zhText = src.slice(zhOpen, zhClose + 1)
const enText = src.slice(enOpen, enClose + 1)
// Only string data lives in these objects; evaluating them is the exact key list.
const zh = vm.runInNewContext('(' + zhText + ')')
const en = vm.runInNewContext('(' + enText + ')')
const zhDupes = collectKeys(zhText).dupes
const enDupes = collectKeys(enText).dupes
const zhSet = new Set(Object.keys(zh))
const enSet = new Set(Object.keys(en))

const code = codeOnly(src)
const used = new Map()
let m
const staticUse = /T\.([A-Za-z_$][\w$]*)/g
while ((m = staticUse.exec(code))) {
  if (!used.has(m[1])) used.set(m[1], lineOf(code, m.index))
}
const descKeyUse = /descKey:\s*'([^']+)'/g
while ((m = descKeyUse.exec(src))) {
  if (!used.has(m[1])) used.set(m[1], lineOf(src, m.index))
}

const dynamic = []
const dynUse = /T\[([^\]]*)\]/g
while ((m = dynUse.exec(code))) {
  if (!/^[A-Za-z_$][\w$]*\.descKey$/.test(m[1].trim())) {
    dynamic.push(`${m[1].trim()} (line ${lineOf(code, m.index)})`)
  }
}

test('every T key used in mobile/app.js exists in both locales', () => {
  const missingZh = [...used].filter(([k]) => !zhSet.has(k)).map(([k, l]) => `${k} (line ${l})`)
  const missingEn = [...used].filter(([k]) => !enSet.has(k)).map(([k, l]) => `${k} (line ${l})`)
  const onlyZh = Object.keys(zh).filter(k => !enSet.has(k))
  const onlyEn = Object.keys(en).filter(k => !zhSet.has(k))
  const problems = []
  if (zhDupes.length) problems.push(`duplicate zh keys: ${zhDupes.join(', ')}`)
  if (enDupes.length) problems.push(`duplicate en keys: ${enDupes.join(', ')}`)
  if (missingZh.length) problems.push(`used but missing in zh: ${missingZh.join(', ')}`)
  if (missingEn.length) problems.push(`used but missing in en: ${missingEn.join(', ')}`)
  if (onlyZh.length) problems.push(`zh-only keys: ${onlyZh.join(', ')}`)
  if (onlyEn.length) problems.push(`en-only keys: ${onlyEn.join(', ')}`)
  assert.deepEqual(problems, [], `i18n key reconciliation failed:\n- ${problems.join('\n- ')}`)
})

test('dynamic T[...] accesses stay on the descKey table', () => {
  assert.deepEqual(dynamic, [], `unexpected dynamic T[...] access: ${dynamic.join(', ')}`)
})

function placeholders(value) {
  return [...String(value).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort()
}

test('locale placeholders match between zh and en', () => {
  const problems = []
  for (const key of Object.keys(zh)) {
    if (!(key in en)) continue
    const zhVars = placeholders(zh[key])
    const enVars = placeholders(en[key])
    if (JSON.stringify(zhVars) !== JSON.stringify(enVars)) {
      problems.push(`${key}: zh=${JSON.stringify(zhVars)} en=${JSON.stringify(enVars)}`)
    }
  }
  assert.deepEqual(problems, [], `locale placeholder mismatch:\n- ${problems.join('\n- ')}`)
})