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
// 阅读内容：对话流、列表文字、面板里供阅读后决策的正文。
const SCALED = [
  'body', '.msg', '.md h1', '.md h2', '.md h3', '.md h4', '.md code', '.md pre code', '.md table',
  'details.reasoning summary', '.reasoning-body', '.tc-head', '.tc-sum', '.tc-body pre', '.tc-result',
  '.ws-name', '.srow .t', '.srow .m', '.empty', '.err',
  '.ap-reason', '.ap-args', '.q-text', '.q-detail', '.cs-confirm-desc',
]

const scaled = /var\(--font-scale\)/

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
  assert.deepEqual(bodyLines.filter((line) => scaled.test(line)), ['font-size: calc(15px * var(--font-scale));'])
})
