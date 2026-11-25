import test from 'node:test'
import assert from 'node:assert/strict'
import { localizeHtml, pickDocLang } from '../lib/html-locale.js'

test('pickDocLang follows the highest-priority language', () => {
  assert.equal(pickDocLang('zh-CN,zh;q=0.9,en;q=0.8'), 'zh')
  assert.equal(pickDocLang('en-US,en;q=0.9'), 'en')
  assert.equal(pickDocLang('zh-TW'), 'zh')
  assert.equal(pickDocLang('ja-JP,en;q=0.8'), 'en')
  assert.equal(pickDocLang('fr-FR,zh;q=0.9'), 'en')
  assert.equal(pickDocLang('en;q=0.5,zh;q=1'), 'zh')
  assert.equal(pickDocLang('zh;q=0,en;q=0.5'), 'en')
  assert.equal(pickDocLang(undefined), 'zh')
  assert.equal(pickDocLang('*'), 'zh')
})

test('localizeHtml writes lang and title without touching the rest', () => {
  const source =
    '<!doctype html><html lang="zh-CN"><head><title>会话 · 移动版</title></head><body>keep</body></html>'

  const en = localizeHtml(source, 'en')
  assert.match(en, /<html lang="en">/)
  assert.match(en, /<title>Sessions · Mobile<\/title>/)
  assert.match(en, /<body>keep<\/body>/)

  const zh = localizeHtml(source, 'zh')
  assert.match(zh, /<html lang="zh-CN">/)
  assert.match(zh, /<title>会话 · 移动版<\/title>/)
})

test('localizeHtml replaces single-quoted and unquoted lang values', () => {
  const single = localizeHtml(
    "<html lang='zh-CN'><head><title>x</title></head></html>",
    'en',
  )
  assert.match(single, /<html lang="en">/)
  assert.doesNotMatch(single, /lang='zh-CN'|lang="zh-CN"/)

  const unquoted = localizeHtml(
    '<html lang=zh-CN><head><title>x</title></head></html>',
    'en',
  )
  assert.match(unquoted, /<html lang="en">/)
})

test('localizeHtml leaves data-lang alone', () => {
  const out = localizeHtml(
    '<html data-lang="zh-CN"><head><title>x</title></head></html>',
    'en',
  )
  assert.match(out, /data-lang="zh-CN"/)
  assert.match(out, /<html data-lang="zh-CN" lang="en">/)
})

test('localizeHtml adds lang when the html tag has none', () => {
  const out = localizeHtml('<html><head><title>x</title></head></html>', 'en')
  assert.match(out, /<html lang="en">/)
})