// @ts-check

/**
 * First-frame document localisation for the mobile page.
 *
 * The mobile shell is a static file, so the browser would otherwise show its
 * Chinese `<title>` and `lang="zh-CN"` until app.js runs. The host serves the
 * HTML per request, so it can choose the same language the page itself will
 * use and write it into the response instead.
 *
 * Keep these titles in sync with `docTitle` in mobile/app.js.
 */

/** @typedef {'zh' | 'en'} DocLang */

/** @type {Record<DocLang, string>} */
const DOC_TITLES = {
  zh: '会话 · 移动版',
  en: 'Sessions · Mobile',
}

/**
 * Pick the document language from an Accept-Language header.
 *
 * Mirrors mobile/app.js: only the highest-priority language matters, and any
 * first language other than Chinese falls back to English. A missing header
 * defaults to Chinese, matching `navigator.language || 'zh'`.
 *
 * @param {string | string[] | undefined} header
 * @returns {DocLang}
 */
export function pickDocLang(header) {
  const raw = Array.isArray(header) ? header.join(',') : header
  if (!raw) return 'zh'

  let best = ''
  let bestQ = -1
  for (const part of raw.split(',')) {
    const fields = part.trim().split(';')
    const tag = (fields[0] || '').trim().toLowerCase()
    if (!tag) continue

    let q = 1
    for (const field of fields.slice(1)) {
      const match = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(field)
      if (!match) continue
      const parsed = Number(match[1])
      if (Number.isFinite(parsed)) q = parsed
    }
    if (q <= 0) continue

    // Equal q-values keep header order: only a strictly higher q replaces.
    if (q > bestQ) {
      best = tag
      bestQ = q
    }
  }

  if (!best || best === '*') return 'zh'
  return best.startsWith('zh') ? 'zh' : 'en'
}

/**
 * Write the selected language and title into the static HTML shell.
 *
 * @param {string} html
 * @param {DocLang} lang
 * @returns {string}
 */
export function localizeHtml(html, lang) {
  const htmlLang = lang === 'zh' ? 'zh-CN' : 'en'
  const title = DOC_TITLES[lang]

  let out = html.replace(/<html\b[^>]*>/i, (tag) => {
    // Accept double-quoted, single-quoted and unquoted lang values; require a
    // whitespace boundary so data-lang / xml:lang are left alone.
    const langAttr = /(\s)lang\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i
    if (langAttr.test(tag)) {
      return tag.replace(langAttr, `$1lang="${htmlLang}"`)
    }
    return tag.replace(/>$/, ` lang="${htmlLang}">`)
  })

  out = out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
  return out
}