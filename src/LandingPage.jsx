import { useState } from 'react'
import { version } from '../package.json'
import HamsterIP from './components/HamsterIP.jsx'
import { useI18n, LangToggle } from './i18n/index.jsx'
import { useToast } from './components/Toast.jsx'
import './LandingPage.css'

const TOOLS = [
  { id: 'sprite-sheet', icon: 'ri-movie-line', num: '01', nameKey: 'tool01.name', descKey: 'tool01.desc', ready: true },
  { id: 'sprite-editor', icon: 'ri-layout-grid-line', num: '02', nameKey: 'tool04.name', descKey: 'tool04.desc', ready: true },
  { id: 'video-gif', icon: 'ri-file-gif-line', num: '03', nameKey: 'tool03.name', descKey: 'tool03.desc', ready: true },
  { id: 'format-converter', icon: 'ri-loop-right-line', num: '04', nameKey: 'tool05.name', descKey: 'tool05.desc', ready: true },
  { id: 'gif-to-sprite', icon: 'ri-grid-line', num: '05', nameKey: 'tool06.name', descKey: 'tool06.desc', ready: true },
  { id: 'bg-remove', icon: 'ri-eraser-line', num: '06', nameKey: 'tool02.name', descKey: 'tool02.desc', ready: true },
]

export default function LandingPage({ onSelectTool }) {
  const { t } = useI18n()
  const toast = useToast()
  const [showMobileTip, setShowMobileTip] = useState(false)
  const [copied, setCopied] = useState(false)
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

  function handleToolClick(toolId) {
    if (isMobile) {
      setShowMobileTip(true)
      setCopied(false)
    } else {
      onSelectTool(toolId)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText('https://fk.designtt.cc/').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <div className="landing">
      {/* ── Navbar ── */}
      <nav className="landing-nav">
        <span className="landing-nav-logo">
          <img src="logo.png" alt="FrameKit" className="landing-nav-icon" />
          Frame<span className="landing-title-accent">Kit</span>
          <span className="landing-nav-free">Free</span>
        </span>
        <LangToggle className="landing-lang-toggle" />
      </nav>

      {/* ── Hero (compact) ── */}
      <section className="landing-hero">
        <div className="landing-hero-left">
          <h1 className="landing-title">
            Frame<span className="landing-title-accent">Kit</span>
          </h1>
          <p className="landing-subtitle">
            {t('landing.subtitle')}
          </p>
          <ul className="landing-highlights">
            {[t('landing.highlight1'), t('landing.highlight2')].map((h, i) => (
              <li key={i}>
                <span className="hl-check"><i className="ri-check-line" /></span>
                {h}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 32 }}>
            <button
              className="landing-cta"
              onClick={() => document.querySelector('.landing-tools')?.scrollIntoView({ behavior: 'smooth' })}
            >
              {t('landing.cta')} <i className="ri-arrow-down-line" />
            </button>
          </div>
        </div>
        <div className="landing-hero-right">
          <div className="hamster-card">
            <div className="hamster-glow" />
            <HamsterIP size={380} />
          </div>
          <span className="landing-hero-caption">FrameKit iP · shushu</span>
        </div>
      </section>

      {/* ── Tool Cards ── */}
      <section className="landing-tools">
        <div className="tools-divider">
          <span className="tools-sub">{TOOLS.length} Tools Available</span>
        </div>
        <div className="tools-grid">
          {TOOLS.map(tool => (
            <div
              className={`tool-card${tool.ready ? '' : ' tool-card--coming'}`}
              key={tool.id}
              onClick={() => tool.ready ? handleToolClick(tool.id) : toast.info(t('placeholder.developing'))}
            >
              <div className="tool-num">{tool.num}</div>
              <h3 className="tool-name">{t(tool.nameKey)}</h3>
              <p className="tool-desc">{t(tool.descKey)}</p>
              <div className="tool-action">
                {tool.ready ? (
                  <span className="tool-btn">{t('tool.availableNow')}</span>
                ) : (
                  <span className="tool-badge-coming">Coming Soon</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <span>FrameKit v{version} · {t('landing.footer')}</span>
        <span className="landing-footer-brand">Frame<span>Kit</span></span>
      </footer>

      {/* ── 手机端提示弹窗 ── */}
      {showMobileTip && (
        <div className="mobile-tip-overlay" onClick={() => setShowMobileTip(false)}>
          <div className="mobile-tip-modal" onClick={e => e.stopPropagation()}>
            <button className="mobile-tip-close" onClick={() => setShowMobileTip(false)}>×</button>
            <p className="mobile-tip-text">{t('landing.mobileTip')}</p>
            <p className="mobile-tip-url">https://fk.designtt.cc/</p>
            <button className="mobile-tip-copy" onClick={copyLink}>
              <i className={copied ? 'ri-check-line' : 'ri-file-copy-line'} /> {copied ? t('landing.copied') : t('landing.copyLink')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
