import { useI18n } from '../i18n/index.jsx'

// PNG 压缩开关（各工具共用）。
// 视觉样式统一在这里；上下间距由调用处通过 style 传入（不同工具的布局上下文不同）。
export default function PngCompressToggle({ checked, onChange, style }) {
  const { t } = useI18n()
  return (
    <div
      className="option-card"
      title={t('png.compressHint')}
      style={{ padding: '0 14px', minHeight: 'auto', height: 42, cursor: 'pointer', display: 'flex', ...style }}
      onClick={() => onChange(!checked)}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: '100%', cursor: 'pointer', margin: 0 }}>
        <span style={{
          width: 18, height: 18, flexShrink: 0,
          border: checked ? 'none' : '2px solid var(--border)',
          background: checked ? 'var(--accent)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 12, lineHeight: 1,
        }}>{checked && '✓'}</span>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>{t('png.compress')}</span>
      </label>
    </div>
  )
}
