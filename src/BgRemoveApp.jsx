import { useState, useCallback, useEffect } from 'react'
import Panel from './components/Panel.jsx'
import { fmtSize, baseName, rgbToHex, hexToRgb } from './utils/format.js'
import { applyChroma } from './utils/chroma.js'
import { useToast } from './components/Toast.jsx'
import ChromaParams from './components/ChromaParams.jsx'
import { useI18n } from './i18n/index.jsx'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export default function BgRemoveApp({ onBack }) {
  const { t } = useI18n()
  const [file, setFile] = useState(null)
  const [imgUrl, setImgUrl] = useState(null)
  const [imgW, setImgW] = useState(0)
  const [imgH, setImgH] = useState(0)
  const [imageData, setImageData] = useState(null)

  const [chromaColor, setChromaColor] = useState(null)
  const [tolerance, setTolerance] = useState(28)
  const [smooth, setSmooth] = useState(14)
  const [despill, setDespill] = useState(true)
  const [edgeSmooth, setEdgeSmooth] = useState(true)
  const [previewMode, setPreviewMode] = useState('result')
  const [solidBgColor, setSolidBgColor] = useState('#2e70ff')
  const [clickPos, setClickPos] = useState(null)

  const [origCanvas, setOrigCanvas] = useState(null)
  const [previewCanvas, setPreviewCanvas] = useState(null)
  const [drag, setDrag] = useState(false)
  const toast = useToast()

  // 卸载时释放图片 ObjectURL（切回首页时触发）
  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl) }, [imgUrl])

  // ── Step 1: Upload ──
  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) {
      toast.error(t('bg.invalidImage'))
      return
    }
    if (f.size > MAX_SIZE) {
      toast.error(t('bg.tooLarge'))
      return
    }
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    const url = URL.createObjectURL(f)
    setFile(f)
    setImgUrl(url)
    setChromaColor(null)
    setClickPos(null)
    setImageData(null)

    // 加载图片获取尺寸和 ImageData
    const img = new Image()
    img.onload = () => {
      setImgW(img.naturalWidth)
      setImgH(img.naturalHeight)
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      setImageData(ctx.getImageData(0, 0, c.width, c.height))
    }
    img.src = url
  }

  // 原图 canvas：imageData 或 canvas 挂载时重绘
  useEffect(() => {
    if (!origCanvas || !imageData) return
    origCanvas.width = imageData.width
    origCanvas.height = imageData.height
    origCanvas.getContext('2d').putImageData(imageData, 0, 0)
  }, [origCanvas, imageData])

  // 预览 canvas：任何参数变化时重绘
  useEffect(() => {
    if (!previewCanvas || !imageData) return
    const w = imageData.width
    const h = imageData.height
    previewCanvas.width = w
    previewCanvas.height = h
    const ctx = previewCanvas.getContext('2d')

    if (!chromaColor) {
      ctx.putImageData(imageData, 0, 0)
    } else {
      const copy = new ImageData(new Uint8ClampedArray(imageData.data), w, h)
      applyChroma(copy, chromaColor, tolerance, smooth, despill, edgeSmooth)

      if (previewMode === 'alpha') {
        const alphaData = new ImageData(w, h)
        for (let i = 0; i < copy.data.length; i += 4) {
          const a = copy.data[i + 3]
          alphaData.data[i] = a
          alphaData.data[i + 1] = a
          alphaData.data[i + 2] = a
          alphaData.data[i + 3] = 255
        }
        ctx.putImageData(alphaData, 0, 0)
      } else if (previewMode === 'solid') {
        ctx.fillStyle = solidBgColor
        ctx.fillRect(0, 0, w, h)
        const tmpC = document.createElement('canvas')
        tmpC.width = w; tmpC.height = h
        tmpC.getContext('2d').putImageData(copy, 0, 0)
        ctx.drawImage(tmpC, 0, 0)
      } else {
        ctx.clearRect(0, 0, w, h)
        ctx.putImageData(copy, 0, 0)
      }
    }
  }, [previewCanvas, imageData, chromaColor, tolerance, smooth, despill, previewMode, solidBgColor])

  // ── Pick color ──
  function pickColor(e) {
    if (!imageData || !origCanvas) return
    const rect = origCanvas.getBoundingClientRect()
    const sx = Math.round((e.clientX - rect.left) / rect.width * origCanvas.width)
    const sy = Math.round((e.clientY - rect.top) / rect.height * origCanvas.height)
    const px = origCanvas.getContext('2d').getImageData(sx, sy, 1, 1).data
    setChromaColor(rgbToHex(px[0], px[1], px[2]))
    setClickPos({ x: sx, y: sy })
  }

  // ── Export ──
  function downloadPng() {
    if (!imageData || !chromaColor) return
    const w = imageData.width, h = imageData.height
    const copy = new ImageData(new Uint8ClampedArray(imageData.data), w, h)
    applyChroma(copy, chromaColor, tolerance, smooth, despill, edgeSmooth)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    c.getContext('2d').putImageData(copy, 0, 0)
    c.toBlob(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${baseName(file.name)}-nobg.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      toast.success(t('bg.pngDl'))
    }, 'image/png')
  }

  const step1Done = !!file && !!imageData
  const step2Done = !!chromaColor

  return (
    <div className="app">
      <header className="app-toolbar">
        {onBack && (
          <button className="btn btn-ghost" onClick={onBack}>
            <i className="ri-arrow-left-s-line" /> {t('common.home')}
          </button>
        )}
        <h1 className="toolbar-title">{t('tool02.title')}</h1>
        <span className="toolbar-badge">{t('common.free')}</span>
      </header>

      {/* ── Step 1: 上传图片 ── */}
      <Panel stepNum={1} title={t('bg.stepUpload')} done={step1Done} defaultOpen={true} metaText={step1Done ? file.name : ''}>
        {!step1Done ? (
          <>
            <div
              className={`dropzone ${drag ? 'drag' : ''}`}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
              onClick={() => document.getElementById('bg-file-input').click()}
              role="button"
              aria-label={t('bg.dropImage')}
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && document.getElementById('bg-file-input').click()}
            >
              <input
                id="bg-file-input"
                type="file"
                accept="image/*"
                onChange={e => handleFile(e.target.files[0])}
                style={{ display: 'none' }}
              />
              <div className="dropzone-icon"><i className="ri-image-line" /></div>
              <div className="dropzone-text">
                <strong>{t('bg.dropImage')}</strong>{t('upload.orClick')}
              </div>
            </div>
            <p className="upload-hint">{t('bg.hint')}</p>
          </>
        ) : (
          <div className="video-preview-card">
            <img src={imgUrl} alt="preview" style={{ width: 200, borderRadius: 0, flexShrink: 0, objectFit: 'contain', background: '#f5f0e5' }} />
            <div className="video-info">
              <h3>{file.name}</h3>
              <div className="video-info-row">
                <div className="video-info-item">{t('common.dimension')} <span>{imgW}×{imgH}</span></div>
                <div className="video-info-item">{t('common.size')} <span>{fmtSize(file.size)}</span></div>
              </div>
              <button
                className="btn btn-ghost"
                style={{ marginTop: 10 }}
                onClick={() => {
                  URL.revokeObjectURL(imgUrl)
                  setFile(null); setImgUrl(null); setImageData(null)
                  setChromaColor(null); setClickPos(null)
                }}
              >
                {t('common.reselect')}
              </button>
            </div>
          </div>
        )}
      </Panel>

      {/* ── Step 2: 取色去背景 ── */}
      <Panel stepNum={2} title={t('bg.stepChroma')} done={step2Done} locked={!step1Done} defaultOpen={false}
        metaText={step2Done ? `${chromaColor}` : ''}
      >
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          {t('bg.chromaHint')}
        </p>

        {imageData && (
          <div className="grid-2col" style={{ display: 'grid', gap: 14 }}>
            {/* 左栏：原图 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{t('bg.original')}</span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--accent)', marginTop: 2 }}>
                    {chromaColor ? t('bg.colorPicked') : t('bg.clickSample')}
                  </div>
                </div>
                {chromaColor && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '0 10px', height: 35,
                      background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: 0, flexShrink: 0,
                        background: chromaColor, border: '1px solid var(--border)',
                      }} />
                      <span className="chroma-rgb-text" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>
                        {(() => { const rgb = hexToRgb(chromaColor); return `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})` })()}
                      </span>
                    </div>
                    <button className="btn btn-ghost" onClick={() => { setChromaColor(null); setClickPos(null) }}>
                      {t('common.clear')}
                    </button>
                  </div>
                )}
              </div>
              <div style={{
                position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                border: '1px solid var(--border)', background: '#000',
              }}>
                <canvas ref={setOrigCanvas} onClick={pickColor} style={{ width: '100%', display: 'block', cursor: 'crosshair' }} />
                {!chromaColor && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.35)', pointerEvents: 'none',
                  }}>
                    <div style={{
                      background: 'rgba(255,255,255,0.92)', borderRadius: 'var(--radius-sm)',
                      padding: '14px 20px', textAlign: 'center', maxWidth: '80%',
                    }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#2d1b00' }}>{t('bg.clickBgColor')}</div>
                      <div style={{ fontSize: '0.72rem', color: '#7a5c30', marginTop: 4 }}>{t('bg.selectBgColor')}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 右栏：预览 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{t('bg.previewTitle')}</span>
                <div className="segmented-control" style={{ height: 35 }}>
                  {[
                    { key: 'result', label: t('bg.modeResult') },
                    { key: 'alpha', label: t('bg.modeAlpha') },
                    { key: 'solid', label: t('bg.modeSolid') },
                  ].map(m => (
                    <button key={m.key}
                      className={`segmented-btn ${previewMode === m.key ? 'active' : ''}`}
                      onClick={() => setPreviewMode(m.key)}
                      style={{ fontSize: '0.75rem', padding: '0 12px' }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{
                borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                border: '1px solid var(--border)',
                background: previewMode === 'result'
                  ? 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 12px 12px'
                  : '#000',
              }}>
                <canvas ref={setPreviewCanvas} style={{ width: '100%', display: 'block' }} />
              </div>
              {previewMode === 'solid' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{t('ref.checkColor')}</span>
                  <label style={{ position: 'relative', display: 'inline-block', width: 18, height: 18, cursor: 'pointer' }}>
                    <div style={{ width: 18, height: 18, background: solidBgColor, border: '1px solid var(--border)' }} />
                    <input type="color" value={solidBgColor} onChange={e => setSolidBgColor(e.target.value)}
                      style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                    />
                  </label>
                  <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text)' }}>{solidBgColor.toUpperCase()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {chromaColor && (
          <ChromaParams
            tolerance={tolerance} smooth={smooth} despill={despill} edgeSmooth={edgeSmooth}
            title={t('chroma.advancedTitle')} hint={t('chroma.advancedHint')}
            onChange={p => {
              if ('tolerance' in p) setTolerance(p.tolerance)
              if ('smooth' in p) setSmooth(p.smooth)
              if ('despill' in p) setDespill(p.despill)
              if ('edgeSmooth' in p) setEdgeSmooth(p.edgeSmooth)
            }}
          />
        )}
      </Panel>

      {/* ── Step 3: 导出 ── */}
      <Panel stepNum={3} title={t('bg.stepExport')} done={false} locked={!step2Done} defaultOpen={false}
        metaText={step2Done ? `${imgW}×${imgH}` : ''}
      >
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          {t('bg.exportHint')}
        </p>
        <button className="btn btn-primary" onClick={downloadPng}>
          <i className="ri-download-line" /> {t('bg.dlPng')}
        </button>
      </Panel>
    </div>
  )
}
