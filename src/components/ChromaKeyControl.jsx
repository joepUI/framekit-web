import { hexToRgb } from '../utils/format.js'
import { CHROMA_MODE_CONNECTED, CHROMA_MODE_GLOBAL } from '../utils/chroma.js'
import { useI18n } from '../i18n/index.jsx'

export default function ChromaKeyControl({ mode, color, samples = [], onModeChange, onClear }) {
  const { t } = useI18n()
  const currentMode = mode || CHROMA_MODE_CONNECTED
  const hasColor = currentMode === CHROMA_MODE_CONNECTED ? samples.length > 0 : !!color

  if (!hasColor) {
    return (
      <div className="segmented-control" style={{ height: 35 }}>
        {[
          { key: CHROMA_MODE_CONNECTED, label: t('chroma.modeConnected') },
          { key: CHROMA_MODE_GLOBAL, label: t('chroma.modeGlobal') },
        ].map(item => (
          <button
            key={item.key}
            className={`segmented-btn ${currentMode === item.key ? 'active' : ''}`}
            onClick={() => onModeChange(item.key)}
            style={{ fontSize: 'var(--text-sm)', padding: '0 12px' }}
          >
            {item.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '0 10px', height: 35,
        background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
      }}>
        {currentMode === CHROMA_MODE_CONNECTED ? (
          samples.slice(0, 5).map((sample, idx) => (
            <div key={`${sample.color}-${sample.x}-${sample.y}-${idx}`} className="color-dot" style={{ background: sample.color }} />
          ))
        ) : (
          <>
            <div className="color-dot" style={{ background: color }} />
            <span className="chroma-rgb-text" style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>
              {(() => { const rgb = hexToRgb(color); return `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})` })()}
            </span>
          </>
        )}
      </div>
      <button className="btn btn-ghost" onClick={onClear}>
        {t('common.clear')}
      </button>
    </div>
  )
}
