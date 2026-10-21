// Reports uncaught browser errors and CSP violations to /api/client-error. No personal data: message + route (ids stripped) only.
let sent = 0
const MAX_PER_PAGE = 8

function report(kind: 'error' | 'unhandledrejection' | 'csp', message: string, detail = '') {
  if (sent >= MAX_PER_PAGE) return
  sent++
  const body = JSON.stringify({ kind, message: message.slice(0, 300), detail: detail.slice(0, 600), route: location.pathname })
  try {
    if (!navigator.sendBeacon?.('/api/client-error', new Blob([body], { type: 'application/json' }))) throw new Error('beacon refused')
  } catch { void fetch('/api/client-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {}) }
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => {
    if (e.target && e.target !== window) return // resource load errors (images, fonts) are not app errors
    report('error', e.message || 'Script error', `${e.filename}:${e.lineno}:${e.colno}`)
  })
  window.addEventListener('unhandledrejection', (e) => report('unhandledrejection', e.reason instanceof Error ? e.reason.message : String(e.reason), e.reason instanceof Error ? (e.reason.stack ?? '') : ''))
  document.addEventListener('securitypolicyviolation', (e) => {
    // Wallet telemetry that we intentionally do not allow is not actionable; everything else is.
    if (e.violatedDirective.startsWith('script-src') && e.sample?.includes('ClientAnalytics')) return
    report('csp', `${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`, `${e.sourceFile}:${e.lineNumber}`)
  })
}
