#!/usr/bin/env node
/**
 * Release smoke against a real DSH instance (manual, never in CI).
 *
 * Required env:
 *   DSH_URL      e.g. https://example.com
 *   DSH_USER     login user
 *   DSH_PASS     login password
 * Optional:
 *   DSH_SESSION_ID   open this session directly (needed when the list is empty)
 *   DSH_SEND_MESSAGE=1  send one real prompt (costs model tokens)
 *   CHROME_PATH      Chrome/Chromium executable (default: common Linux paths)
 *   CHROME_NO_SANDBOX=1  add --no-sandbox
 *
 * Exit code 0 = all checks passed, 1 = failure, 2 = missing setup.
 */
import fs from 'node:fs'
import process from 'node:process'
import { chromium } from 'playwright-core'

const BASE = (process.env.DSH_URL || '').replace(/\/+$/, '')
const USER = process.env.DSH_USER || ''
const PASS = process.env.DSH_PASS || ''
const SESSION_ID = process.env.DSH_SESSION_ID || ''
const SEND_MESSAGE = process.env.DSH_SEND_MESSAGE === '1'

const chromeCandidates = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate))

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function mobileContext(browser, storageState, locale) {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale,
    storageState,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  })
}

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  if (!page.url().includes('/auth/login')) return
  await page.fill('input[name="username"]', USER)
  await page.fill('input[name="password"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: 20000 }).catch(() => {})
  if (page.url().includes('/auth/login')) throw new Error('login failed; still on /auth/login')
}

async function openList(page) {
  await page.goto(`${BASE}/dsh-web-mobile-pmsfh/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 15000 })
  await page.waitForFunction(
    () => document.querySelectorAll('.srow').length > 0 || !!document.querySelector('.empty') || !!document.querySelector('.err'),
    null,
    { timeout: 15000 },
  )
  if (await page.locator('.err').count()) throw new Error(`list error: ${await page.locator('.err').innerText()}`)
  const rows = await page.locator('.srow').count()
  check('list renders', rows > 0 || (await page.locator('.empty').count()) > 0, `${rows} rows`)
}

async function openChat(page) {
  if (SESSION_ID) {
    await page.goto(`${BASE}/dsh-web-mobile-pmsfh/#/s/${encodeURIComponent(SESSION_ID)}`, { waitUntil: 'domcontentloaded' })
  } else {
    if ((await page.locator('.srow').count()) === 0) {
      throw new Error('no visible session; set DSH_SESSION_ID')
    }
    await page.locator('.srow').first().click()
  }
  await page.waitForSelector('.chat, .err', { timeout: 15000 })
  if (await page.locator('.err').count()) throw new Error(`chat error: ${await page.locator('.err').innerText()}`)
  await page.waitForSelector('.chat', { timeout: 15000 })
  const messages = await page.locator('.msg').count()
  check('chat renders', true, `${messages} messages`)
}

async function checkModelSheet(page) {
  await page.locator('.c-model').click()
  await page.waitForSelector('.sheet', { timeout: 10000 })
  await page.waitForFunction(() => {
    const empty = document.querySelector('.sheet-empty')
    return !empty || !/Loading|加载中/.test(empty.textContent || '')
  }, null, { timeout: 15000 })
  const error = await page.locator('.model-err').count()
  const choices = await page.locator('.sheet-sec, .sheet-item').count()
  check('model sheet', error === 0 && choices > 0, `${choices} model rows`)
  await page.keyboard.press('Escape')
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 5000 }).catch(() => {})
}

async function checkApprovalModal(page) {
  await page.evaluate(() => {
    const sessionId = location.hash.split('/').pop()
    window.__dshwm.dispatch(
      'approval/request',
      { toolName: 'terminal_send', reason: 'release smoke' },
      { clientId: 'release-smoke', eventId: 'release-smoke-approval', agentId: sessionId },
    )
  })
  await page.waitForSelector('.ap-tool', { timeout: 5000 })
  const tool = await page.locator('.ap-tool').innerText()
  check('approval modal', tool === 'terminal_send', tool)
  await page.keyboard.press('Escape')
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 5000 }).catch(() => {})
}

async function checkLanguage(browser, storageState, locale, expectedLang, expectedHeading) {
  const context = await mobileContext(browser, storageState, locale)
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  try {
    await page.goto(`${BASE}/dsh-web-mobile-pmsfh/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.hd h1', { timeout: 15000 })
    const lang = await page.evaluate(() => document.documentElement.lang)
    const heading = await page.locator('.hd h1').innerText()
    const title = await page.title()
    check(`language ${locale}`, lang === expectedLang && heading === expectedHeading, `${lang} / ${heading} / ${title}`)
    check(`language ${locale} console`, errors.length === 0, errors.join(' | '))
  } finally {
    await context.close()
  }
}

if (!BASE || !USER || !PASS) {
  console.error('Missing DSH_URL / DSH_USER / DSH_PASS')
  process.exit(2)
}
if (!chromePath) {
  console.error('Chrome/Chromium not found; set CHROME_PATH')
  process.exit(2)
}

let browser
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
  })

  const context = await mobileContext(browser, undefined, 'zh-CN')
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  const badResponses = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('response', (response) => {
    if (response.status() >= 400 && !/\/favicon\.ico$/.test(response.url())) {
      badResponses.push(`${response.status()} ${response.url()}`)
    }
  })

  await login(page)
  errors.length = 0
  badResponses.length = 0

  await openList(page)
  let chatReady = false
  try {
    await openChat(page)
    chatReady = true
  } catch (error) {
    check('chat renders', false, error.message)
  }
  if (chatReady) {
    await checkModelSheet(page)
    await checkApprovalModal(page)
    if (SEND_MESSAGE) {
      await page.fill('.c-input', 'release smoke ping')
      await page.click('.c-send')
      await page.waitForFunction(
        () => document.querySelectorAll('.msg.assistant').length > 0,
        null,
        { timeout: 90000 },
      )
      check('chat send', true)
    }
  }

  check('console clean', errors.length === 0, errors.join(' | '))
  check('responses clean', badResponses.length === 0, badResponses.join(' | '))

  const storageState = await context.storageState()
  await checkLanguage(browser, storageState, 'zh-CN', 'zh-CN', '会话')
  await checkLanguage(browser, storageState, 'en-US', 'en', 'Sessions')
} catch (error) {
  check('fatal', false, error.message)
} finally {
  if (browser) await browser.close()
}

const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) process.exitCode = 1
