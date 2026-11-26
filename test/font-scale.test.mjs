// 样式边界防线：字号档位只乘阅读内容（--font-scale），页头、按钮、面板等固定区
// 必须保持裸 px。改 app.css 时若把固定区顺手乘上倍率，页头会撑高、触控盒会
// 变形，而任何运行时检查都不会报错——这里按选择器对账。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs
  .readFileSync(new URL('../mobile/app.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// 选择器（按逗号拆开后逐个）→ 该规则块内的声明文本；@media 内层块同样收录。
function declarationsBySelector() {
  const out = new Map()
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of m[1].split(',')) {
      const key = selector.trim()
      if (!key || key.startsWith('@')) continue
      out.set(key, (out.get(key) || '') + m[2])
    }
  }
  return out
}

// 固定区：页头与按钮、徽标与时间戳、面板自身的字号。
const FIXED = [
  '.hd', '.hd h1', '.hd .sub', '.hd button', '.hd .back', '.hd .pending',
  '.ws-chev', '.ws-count', '.srow .go',
  '.jump-down', '.tsep', '.msg.user .mt', '.stopped', '.chatnote',
  '.c-attach', '.c-send', '.c-model', '.c-chip', '.c-chip-x',
  '.sheet-close', '.sheet-title', '.sheet-item', '.sheet-sec', '.sheet-empty',
  '.sheet-back', '.sheet-nav-title', '.si-value', '.si-chev',
  '.btn-primary', '.btn-ghost', '.effort-chip',
  '.fs-chip', '.fs-status', '.fs-reset', '.fs-pv-title', '.fs-pv-menu', '.fs-pv-btn',
  '.fs-opt-name', '.fs-opt-px',
]
// 阅读内容：对话流、列表文字、面板里供阅读后决策的正文（提问卡选项 .q-opt 与
// 同卡的 .q-text / .q-detail 同随档位缩放）。
const SCALED = [
  'body', '.msg', '.md h1', '.md h2', '.md h3', '.md h4', '.md code', '.md pre code', '.md table',
  'details.reasoning summary', '.reasoning-body', '.tc-head', '.tc-sum', '.tc-body pre', '.tc-result',
  '.ws-name', '.srow .t', '.srow .m', '.empty', '.err',
  '.ap-reason', '.ap-args', '.q-text', '.q-detail', '.q-opt', '.cs-confirm-desc',
]
// 固定字体区：页头、面板与对话框壳、toast。换字体只作用正文，这些壳必须显式
// 钉回系统字体，否则壳内标题、状态行、按钮会从 body 继承所选字体。
const CHROME_FONT = ['.hd', '.sheet', '.cs-confirm', '.mtoast']
// 跟随字体的阅读文本：body 之外的都住在面板壳里，得自己引回 --font-family。
const BODY_FONT = ['body', '.fs-pv-body', '.ap-reason', '.cs-confirm-desc']

const scaled = /var\(--font-scale\)/
const sansFont = /font-family:\s*var\(--font-sans\)/
const bodyFont = /font-family:\s*var\(--font-family\)/

test('header, buttons and panel chrome stay at fixed px', () => {
  const blocks = declarationsBySelector()
  const offenders = FIXED.filter((selector) => scaled.test(blocks.get(selector) || ''))
  assert.deepEqual(offenders, [], `fixed-size selectors must not use --font-scale: ${offenders.join(', ')}`)
})

test('reading text follows --font-scale; the body scales its font-size only', () => {
  const blocks = declarationsBySelector()
  const missing = SCALED.filter((selector) => !scaled.test(blocks.get(selector) || ''))
  assert.deepEqual(missing, [], `reading-text selectors must use --font-scale: ${missing.join(', ')}`)
  const bodyLines = blocks.get('body').split('\n').map((line) => line.trim()).filter(Boolean)
  assert.deepEqual(bodyLines.filter((line) => scaled.test(line)), ['font-size: calc(var(--font-base) * var(--font-scale));'])
})

test('header, panel shells and toast stay on the system font; reading text follows the chosen one', () => {
  const blocks = declarationsBySelector()
  const unpinned = CHROME_FONT.filter((selector) => !sansFont.test(blocks.get(selector) || ''))
  assert.deepEqual(unpinned, [], `chrome shells must pin font-family: var(--font-sans): ${unpinned.join(', ')}`)
  const notFollowing = BODY_FONT.filter((selector) => !bodyFont.test(blocks.get(selector) || ''))
  assert.deepEqual(notFollowing, [], `reading text must use font-family: var(--font-family): ${notFollowing.join(', ')}`)
})

// 当按钮用的阅读文本：浏览器给 <button> 的是自带字体，不从 body 继承，body 上设了
// --font-family 也传不进去。这些选择器在 app.js 里都以 el('button', …) 创建，字号
// 已随档位，字体还得显式 inherit 才跟得上——删掉这条规则不会让任何运行时检查报错。
const BUTTON_TEXT = ['.srow', '.q-opt', '.ws-head', '.tc-head']
const inheritFont = /font-family:\s*inherit/

test('reading text rendered as buttons inherits the chosen font instead of the UA one', () => {
  const blocks = declarationsBySelector()
  const missing = BUTTON_TEXT.filter((selector) => !inheritFont.test(blocks.get(selector) || ''))
  assert.deepEqual(missing, [], `button-borne reading text must set font-family: inherit: ${missing.join(', ')}`)
  // 名单只收真的以按钮渲染的选择器：哪天改成 div，inherit 多余，该从名单里拿掉。
  const appSource = fs.readFileSync(new URL('../mobile/app.js', import.meta.url), 'utf8')
  const notButtons = BUTTON_TEXT.filter((selector) => !appSource.includes(`el('button', '${selector.slice(1)}'`))
  assert.deepEqual(notButtons, [], `listed selectors are no longer created as <button>: ${notButtons.join(', ')}`)
})

test('font stacks and the base text size are defined once, in the stylesheet', () => {
  const appSource = fs.readFileSync(new URL('../mobile/app.js', import.meta.url), 'utf8')
  const defined = new Set([...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]))
  // Every family id in app.js resolves to a --font-<id> stack defined in app.css …
  const ids = appSource.match(/var FONT_FAMILIES = \[([^\]]*)\]/)[1].match(/'([^']+)'/g).map((id) => id.slice(1, -1))
  assert.ok(ids.length >= 2, 'family list must not be empty')
  const missing = ids.map((id) => `--font-${id}`).filter((name) => !defined.has(name))
  assert.deepEqual(missing, [], `families referenced by app.js but not defined in app.css: ${missing.join(', ')}`)
  // … the base size is read back from --font-base, falling back when it cannot be read …
  assert.ok(defined.has('--font-base'), 'app.css must define --font-base')
  const fallback = appSource.match(/getPropertyValue\('--font-base'\)\)\s*\|\|\s*(\d+(?:\.\d+)?)/)
  assert.ok(fallback, 'fontBasePx() must fall back when --font-base is missing or not a number')
  // … and that fallback is the stylesheet value, so the two cannot drift apart …
  const base = css.match(/--font-base:\s*(\d+(?:\.\d+)?)px/)
  assert.ok(base, 'app.css must define --font-base in px')
  assert.equal(Number(fallback[1]), Number(base[1]), 'fallback base must equal --font-base in app.css')
  assert.match(appSource, /setProperty\('--font-family', 'var\(--font-' \+/, 'app.js must reference stacks, not repeat them')
  // … and app.js keeps no second copy of either.
  const duplicated = ['PingFang', 'Songti', 'ui-monospace', 'sans-serif', '-apple-system', /FONT_BASE_PX\s*=\s*\d/]
    .filter((needle) => (typeof needle === 'string' ? appSource.includes(needle) : needle.test(appSource)))
  assert.deepEqual(duplicated, [], `app.js must not carry its own copy of the font stacks or base size: ${String(duplicated)}`)
})
