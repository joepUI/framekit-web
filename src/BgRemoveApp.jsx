import { useState, useCallback, useEffect } from 'react'
import Panel from './components/Panel.jsx'
import { fmtSize, baseName, rgbToHex } from './utils/format.js'
import { applyChromaKey, hasChromaKey, CHROMA_MODE_CONNECTED } from './utils/chroma.js'
import { useToast } from './components/Toast.jsx'
import ChromaParams from './components/ChromaParams.jsx'
import ChromaKeyControl from './components/ChromaKeyControl.jsx'
import { useI18n } from './i18n/index.jsx'
import { canvasToPngBlob, getPngCompressEnabled, setPngCompressEnabled } from './utils/pngOptimize.js'
import PngCompressToggle from './components/PngCompressToggle.jsx'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export default function BgRemoveApp({ onBack }) {
  const { t } = useI18n()
  const [file, setFile] = useState(null)
  const [imgUrl, setImgUrl] = useState(null)
  const [imgW, setImgW] = useState(0)
  const [imgH, setImgH] = useState(0)
  const [imageData, setImageData] = useState(null)

  const [chromaColor, setChromaColor] = useState(null)
  const [chromaMode, setChromaMode] = useState(CHROMA_MODE_CONNECTED)
  const [chromaSamples, setChromaSamples] = useState([])
  const [tolerance, setTolerance] = useState(28)
  const [smooth, setSmooth] = useState(14)
  const [despill, setDespill] = useState(true)
  const [edgeSmooth, setEdgeSmooth] = useState(true)
  const [edgeTrim, setEdgeTrim] = useState(1)
  const [edgeClean, setEdgeClean] = useState('light')
  const [previewMode, setPreviewMode] = useState('result')
  const [solidBgColor, setSolidBgColor] = useState('#2e70ff')
  const [clickPos, setClickPos] = useState(null)

  const [origCanvas, setOrigCanvas] = useState(null)
  const [previewCanvas, setPreviewCanvas] = useState(null)
  const [drag, setDrag] = useState(false)
  const toast = useToast()
  const chromaSettings = { chromaMode, chromaColor, chromaSamples, tolerance, smooth, despill, edgeSmooth, edgeTrim, edgeClean }
  const hasColor = hasChromaKey(chromaSettings)

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
    setChromaSamples([])
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

    if (!hasColor) {
      ctx.putImageData(imageData, 0, 0)
    } else {
      const copy = new ImageData(new Uint8ClampedArray(imageData.data), w, h)
      applyChromaKey(copy, chromaSettings)

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
  }, [previewCanvas, imageData, hasColor, chromaMode, chromaColor, chromaSamples, tolerance, smooth, despill, edgeSmooth, edgeTrim, edgeClean, previewMode, solidBgColor])

  // ── Pick color ──
  function pickColor(e) {
    if (!imageData || !origCanvas) return
    const rect = origCanvas.getBoundingClientRect()
    const sx = Math.round((e.clientX - rect.left) / rect.width * origCanvas.width)
    const sy = Math.round((e.clientY - rect.top) / rect.height * origCanvas.height)
    const px = origCanvas.getContext('2d').getImageData(sx, sy, 1, 1).data
    const hex = rgbToHex(px[0], px[1], px[2])
    if (chromaMode === CHROMA_MODE_CONNECTED) {
      const nextSamples = [...chromaSamples, { x: sx, y: sy, color: hex }].slice(-5)
      setChromaSamples(nextSamples)
      setChromaColor(nextSamples[0]?.color || hex)
    } else {
      setChromaSamples([{ x: sx, y: sy, color: hex }])
      setChromaColor(hex)
    }
    setClickPos({ x: sx, y: sy })
  }

  // ── Export ──
  const [pngCompress, _setPngCompress] = useState(getPngCompressEnabled)
  const [pngExporting, setPngExporting] = useState(false)
  function togglePngCompress(v) { _setPngCompress(v); setPngCompressEnabled(v) }

  async function downloadPng() {
    if (!imageData || !hasColor) return
    setPngExporting(true)
    try {
      const w = imageData.width, h = imageData.height
      const copy = new ImageData(new Uint8ClampedArray(imageData.data), w, h)
      applyChromaKey(copy, chromaSettings)
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      c.getContext('2d').putImageData(copy, 0, 0)
      const blob = await canvasToPngBlob(c, pngCompress)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${baseName(file.name)}-nobg.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      toast.success(t('bg.pngDl'))
    } catch (e) {
      toast.error(t('bg.pngDl') + ': ' + e.message)
    } finally {
      setPngExporting(false)
    }
  }

  const step1Done = !!file && !!imageData
  const step2Done = hasColor

  return (
    <>
      <nav className="tut-nav">
        <button className="tut-back-btn" onClick={onBack}>
          <i className="ri-arrow-left-line" /> {t('common.home')}
        </button>
        <span className="tut-nav-title">{t('tool02.title')}</span>
      </nav>
      <div className="app">
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
                  setChromaColor(null); setChromaSamples([]); setClickPos(null)
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
        metaText={step2Done ? `${chromaColor || ''}` : ''}
      >
        <p className="step-hint">
          {t('bg.chromaHint')}
        </p>

        {imageData && (
          <div className="grid-2col" style={{ display: 'grid', gap: 14 }}>
            {/* 左栏：原图 */}
            <div>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text)' }}>{t('bg.original')}</span>
                  <div className="sub-accent">
                    {hasColor
                      ? (chromaMode === CHROMA_MODE_CONNECTED ? t('chroma.connectedPicked') : t('bg.colorPicked'))
                      : t('bg.clickSample')}
                  </div>
                </div>
                <ChromaKeyControl
                  mode={chromaMode}
                  color={chromaColor}
                  samples={chromaSamples}
                  onModeChange={mode => { setChromaMode(mode); setChromaColor(null); setChromaSamples([]); setClickPos(null) }}
                  onClear={() => { setChromaColor(null); setChromaSamples([]); setClickPos(null) }}
                />
              </div>
              <div style={{
                position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                border: '1px solid var(--border)', background: '#000',
              }}>
                <canvas ref={setOrigCanvas} onClick={pickColor} className="canvas-crosshair" />
                {!hasColor && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.35)', pointerEvents: 'none',
                  }}>
                    <div style={{
                      background: 'rgba(255,255,255,0.92)', borderRadius: 'var(--radius-sm)',
                      padding: '14px 20px', textAlign: 'center', maxWidth: '80%',
                    }}>
                      <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: '#2d1b00' }}>{t('bg.clickBgColor')}</div>
                      <div style={{ fontSize: 'var(--text-sm)', color: '#7a5c30', marginTop: 4 }}>{t('bg.selectBgColor')}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 右栏：预览 */}
            <div>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text)' }}>{t('bg.previewTitle')}</span>
                <div className="segmented-control" style={{ height: 35 }}>
                  {[
                    { key: 'result', label: t('bg.modeResult') },
                    { key: 'alpha', label: t('bg.modeAlpha') },
                    { key: 'solid', label: t('bg.modeSolid') },
                  ].map(m => (
                    <button key={m.key}
                      className={`segmented-btn ${previewMode === m.key ? 'active' : ''}`}
                      onClick={() => setPreviewMode(m.key)}
                      style={{ fontSize: 'var(--text-sm)', padding: '0 12px' }}
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
                <div className="solid-color-row">
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-dim)' }}>{t('ref.checkColor')}</span>
                  <label className="color-picker-wrap">
                    <div style={{ width: 18, height: 18, background: solidBgColor, border: '1px solid var(--border)' }} />
                    <input type="color" value={solidBgColor} onChange={e => setSolidBgColor(e.target.value)} />
                  </label>
                  <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'monospace', color: 'var(--text)' }}>{solidBgColor.toUpperCase()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {hasColor && (
          <ChromaParams
            tolerance={tolerance} smooth={smooth} despill={despill} edgeSmooth={edgeSmooth}
            edgeTrim={edgeTrim} edgeClean={edgeClean}
            title={t('chroma.advancedTitle')} hint={t('chroma.advancedHint')}
            onChange={p => {
              if ('tolerance' in p) setTolerance(p.tolerance)
              if ('smooth' in p) setSmooth(p.smooth)
              if ('despill' in p) setDespill(p.despill)
              if ('edgeSmooth' in p) setEdgeSmooth(p.edgeSmooth)
              if ('edgeTrim' in p) setEdgeTrim(p.edgeTrim)
              if ('edgeClean' in p) setEdgeClean(p.edgeClean)
            }}
          />
        )}
      </Panel>

      {/* ── Step 3: 导出 ── */}
      <Panel stepNum={3} title={t('bg.stepExport')} done={false} locked={!step2Done} defaultOpen={false}
        metaText={step2Done ? `${imgW}×${imgH}` : ''}
      >
        <p className="step-hint">
          {t('bg.exportHint')}
        </p>
        <PngCompressToggle checked={pngCompress} onChange={togglePngCompress} style={{ marginTop: 14, marginBottom: 14 }} />
        <button className="btn btn-primary" onClick={downloadPng} disabled={pngExporting}>
          <i className={pngExporting ? 'ri-loader-4-line spin' : 'ri-download-line'} /> {pngExporting ? (pngCompress ? t('png.loadingEngine') : t('common.exporting')) : t('bg.dlPng')}
        </button>
      </Panel>
    </div>
    </>
  )
}
