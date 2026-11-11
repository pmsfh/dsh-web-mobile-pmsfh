/**
 * dsh-web-mobile-pmsfh client bundle (v2.2, hand-written lazy-CJS factory).
 *
 * Role: bounce coarse-pointer narrow-viewport browsers (phones) from the
 * official SPA to the standalone mobile page served by the plugin's host half
 * at /_dsh-web-mobile-pmsfh/. The old CSS-overlay drawer/touch-target code is retired.
 *
 * Escape hatch (session-scoped): the mobile page's "desktop version" link sets
 * sessionStorage['dsh-web-mobile-pmsfh:desktop'] = '1' before navigating to '/',
 * and this bundle then stays out of the way for that browsing session only —
 * the next fresh visit defaults back to the mobile page.
 *
 * Legacy note: v2.0/v2.1 used a PERMANENT localStorage flag that stranded
 * users on the desktop UI with no way back. This bundle clears that legacy
 * flag on every load so previously-locked browsers recover mobile default.
 */
window.__ModuleLoader__.load({
  id: 'dsh-web-mobile-pmsfh',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports

    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    exports.name = 'dsh-web-mobile-pmsfh'
    exports.inject = []
    exports.apply = function () {
      try {
        if (location.pathname.indexOf('/_dsh-web-mobile-pmsfh') === 0) return
        // Remove the legacy permanent escape flag (one-way lock from v2.0/v2.1)
        try { localStorage.removeItem('dsh-web-mobile-pmsfh:desktop') } catch (e) {}
        var escaped = false
        try { escaped = sessionStorage.getItem('dsh-web-mobile-pmsfh:desktop') === '1' } catch (e) {}
        var coarse = window.matchMedia('(pointer: coarse)').matches
        var narrow = window.matchMedia('(max-width: 768px)').matches
        if (!escaped && coarse && narrow) {
          location.replace('/_dsh-web-mobile-pmsfh/')
          return
        }
        // Phone chose desktop for this session: give it a way back.
        if (escaped && coarse && narrow) addMobileFab()
      } catch (e) {
        // Redirect is best-effort; never block the official UI on a failure.
        console.warn('[dsh-web-mobile-pmsfh] redirect check failed', e)
      }
    }

    function addMobileFab() {
      if (document.getElementById('dsh-web-mobile-pmsfh-fab')) return
      var fab = document.createElement('a')
      fab.id = 'dsh-web-mobile-pmsfh-fab'
      fab.href = '/_dsh-web-mobile-pmsfh/'
      fab.textContent = '📱'
      fab.title = '移动版'
      fab.setAttribute('aria-label', '移动版')
      fab.style.cssText = 'position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));' +
        'z-index:2200;width:44px;height:44px;border-radius:22px;display:flex;align-items:center;' +
        'justify-content:center;background:#1a1a1a;color:#fff;font-size:20px;text-decoration:none;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.35);opacity:.85;'
      var append = function () {
        if (document.body && !document.getElementById('dsh-web-mobile-pmsfh-fab')) document.body.appendChild(fab)
      }
      if (document.body) append()
      else document.addEventListener('DOMContentLoaded', append)
    }

    return module.exports
  },
})
