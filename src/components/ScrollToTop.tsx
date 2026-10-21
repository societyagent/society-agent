import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/** New page = top of the page. Back/forward keep the browser's own scroll position; #anchors land just below the sticky bar. */
export function ScrollToTop() {
  const { pathname, hash } = useLocation(), type = useNavigationType()
  useEffect(() => {
    if (!hash) { if (type !== 'POP') window.scrollTo({ top: 0, behavior: 'instant' }); return }
    const go = () => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start', behavior: 'instant' })
    const raf = requestAnimationFrame(go)
    // web fonts and tables change the height above the target after the first paint; settle once more
    const t = window.setTimeout(go, 250)
    void document.fonts?.ready.then(go)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [pathname, hash, type])
  return null
}
