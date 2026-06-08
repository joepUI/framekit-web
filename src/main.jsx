import React, { useState, useEffect, lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import LandingPage from './LandingPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { I18nProvider, useI18n } from './i18n/index.jsx'
import './index.css'

// ── Lazy load 各工具页，首屏不打包进来 ──────────────────────────────────────
const App            = lazy(() => import('./App.jsx'))
const BgRemoveApp    = lazy(() => import('./BgRemoveApp.jsx'))
const VideoGifApp    = lazy(() => import('./VideoGifApp.jsx'))
const SpriteEditorApp = lazy(() => import('./SpriteEditorApp.jsx'))
const FormatConverterApp = lazy(() => import('./FormatConverterApp.jsx'))
const GifToSpriteApp = lazy(() => import('./GifToSpriteApp.jsx'))

// ── Hash 路由映射 ────────────────────────────────────────────────────────────
const ROUTES = {
  '':              'landing',
  'sprite-sheet':  'sprite-sheet',
  'bg-remove':     'bg-remove',
  'video-gif':     'video-gif',
  'sprite-editor': 'sprite-editor',
  'format-converter': 'format-converter',
  'gif-to-sprite': 'gif-to-sprite',
}

function getPageFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return ROUTES[hash] ?? 'landing'
}

function setHash(page) {
  const hash = page === 'landing' ? '' : page
  window.history.pushState(null, '', hash ? `#/${hash}` : location.pathname)
}

// ── Loading fallback ─────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', color: 'var(--text-dim)', fontSize: '0.9rem',
    }}>
      <i className="ri-loader-4-line" style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} />
      加载中...
    </div>
  )
}

// ── Placeholder ──────────────────────────────────────────────────────────────
function Placeholder({ name, onBack }) {
  const { t } = useI18n()
  return (
    <div className="app">
      <header className="app-header">
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
          borderRadius: '6px', padding: '4px 12px', fontSize: '0.8rem', cursor: 'pointer',
          marginBottom: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px',
        }}>
          ← {t('common.home')}
        </button>
        <h1>FrameKit</h1>
        <p style={{ color: 'var(--text-muted)' }}>{name} — {t('placeholder.comingSoon')}</p>
      </header>
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)', fontSize: '1.1rem' }}>
        {t('placeholder.developing')}
      </div>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────────
function Root() {
  const [page, setPage] = useState(getPageFromHash)

  // 监听浏览器后退/前进
  useEffect(() => {
    const onPop = () => setPage(getPageFromHash())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function navigate(target) {
    setPage(target)
    setHash(target)
    window.scrollTo(0, 0)
  }

  const goHome = () => navigate('landing')

  function renderPage() {
    switch (page) {
      case 'sprite-sheet':  return <App onBack={goHome} />
      case 'bg-remove':     return <BgRemoveApp onBack={goHome} />
      case 'video-gif':     return <VideoGifApp onBack={goHome} />
      case 'sprite-editor': return <SpriteEditorApp onBack={goHome} />
      case 'format-converter': return <FormatConverterApp onBack={goHome} />
      case 'gif-to-sprite': return <GifToSpriteApp onBack={goHome} />
      default:              return <LandingPage onSelectTool={navigate} />
    }
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <ErrorBoundary onBack={page !== 'landing' ? goHome : undefined}>
        {renderPage()}
      </ErrorBoundary>
    </Suspense>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </I18nProvider>
  </React.StrictMode>,
)
