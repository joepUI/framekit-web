import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import LandingPage from './LandingPage.jsx'
import App from './App.jsx'
import BgRemoveApp from './BgRemoveApp.jsx'
import VideoGifApp from './VideoGifApp.jsx'
import SpriteEditorApp from './SpriteEditorApp.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { I18nProvider, useI18n } from './i18n/index.jsx'
import './index.css'

function Placeholder({ name, onBack }) {
  const { t } = useI18n()
  return (
    <div className="app">
      <header className="app-header">
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            borderRadius: '6px',
            padding: '4px 12px',
            fontSize: '0.8rem',
            cursor: 'pointer',
            marginBottom: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          ← {t('common.home')}
        </button>
        <h1>FrameKit</h1>
        <p style={{ color: 'var(--text-muted)' }}>{name} — {t('placeholder.comingSoon')}</p>
      </header>
      <div style={{
        textAlign: 'center',
        padding: '80px 20px',
        color: 'var(--text-muted)',
        fontSize: '1.1rem',
      }}>
        {t('placeholder.developing')}
      </div>
    </div>
  )
}

function Root() {
  const [page, setPage] = useState('landing')
  const goHome = () => setPage('landing')

  switch (page) {
    case 'sprite-sheet':
      return <App onBack={goHome} />
    case 'bg-remove':
      return <BgRemoveApp onBack={goHome} />
    case 'video-gif':
      return <VideoGifApp onBack={goHome} />
    case 'sprite-editor':
      return <SpriteEditorApp onBack={goHome} />
    default:
      return <LandingPage onSelectTool={setPage} />
  }
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
