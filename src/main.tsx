import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
// Fonts are imported from JS so Vite resolves and fingerprints the font files (CSS @import would leave dead relative URLs under Tailwind v4).
import '@fontsource-variable/dm-sans'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import './index.css'
import App from './App.tsx'
import { installErrorReporting } from './lib/monitor'

installErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
)
