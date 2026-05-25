import { useI18n } from '../i18n/index.jsx'

export default function ChromaParams({ tolerance, smooth, despill, edgeSmooth, onChange, title, hint }) {
  const { t } = useI18n()
  const displayTitle = title ?? t('chroma.title')
  const displayHint = hint ?? t('chroma.hint')
  // 只有调用方显式传了 title 或 hint 才显示标题行
  const hasHeader = title !== undefined || hint !== undefined

  const toggles = [
    edgeSmooth !== undefined && { key: 'edgeSmooth', label: t('chroma.edgeSmooth'), val: edgeSmooth },
    { key: 'despill', label: t('chroma.despill'), val: despill },
  ].filter(Boolean)

  return (
    <div className="option-card" style={{ marginTop: 16, padding: '16px 18px', minHeight: 'auto' }}>
      {hasHeader && (
        <div className="chroma-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text)' }}>{displayTitle}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{displayHint}</span>
        </div>
      )}

      <div className="grid-2col" style={{ display: 'grid', gap: 16 }}>
        <div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{t('chroma.tolerance')}: {tolerance}</span>
          <input type="range" min={0} max={255} value={tolerance}
            onChange={e => onChange({ tolerance: parseInt(e.target.value) })}
            style={{ width: '100%', marginTop: 4 }}
          />
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4 }}>{t('chroma.toleranceHint')}</div>
        </div>
        <div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{t('chroma.feather')}: {smooth}px</span>
          <input type="range" min={0} max={30} step={1} value={smooth}
            onChange={e => onChange({ smooth: parseInt(e.target.value) })}
            style={{ width: '100%', marginTop: 4 }}
          />
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4 }}>{t('chroma.featherHint')}</div>
        </div>
      </div>

      {toggles.length > 0 && (
        <div className={toggles.length > 1 ? 'grid-2col' : undefined}
          style={{ display: toggles.length > 1 ? 'grid' : 'flex', gap: 16, marginTop: 14 }}>
          {toggles.map(item => (
            <div
              key={item.key}
              className="option-card"
              style={{ padding: '0 14px', minHeight: 'auto', height: 42, cursor: 'pointer', display: 'inline-flex' }}
              onClick={() => onChange({ [item.key]: !item.val })}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: '100%', cursor: 'pointer', margin: 0 }}>
                <span style={{
                  width: 18, height: 18, flexShrink: 0,
                  border: item.val ? 'none' : '2px solid var(--border)',
                  background: item.val ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 12, lineHeight: 1,
                }}>
                  {item.val && '✓'}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{item.label}</span>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
