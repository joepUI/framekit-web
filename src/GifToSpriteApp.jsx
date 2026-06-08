import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Panel from './components/Panel.jsx'
import NumStepper from './components/NumStepper.jsx'
import ChromaParams from './components/ChromaParams.jsx'
import { decodeGif } from './utils/gifDecoder.js'
import { buildSheet } from './utils/frameExtract.js'
import { applyChroma } from './utils/chroma.js'
import { baseName, rgbToHex, hexToRgb } from './utils/format.js'
import JSZip from 'jszip'
import { useToast } from './components/Toast.jsx'
import { useI18n } from './i18n/index.jsx'

const INITIAL = {
  sourceFile: null,
  rawFrames: [],    // 原始解码帧 Array<{ imageData }>，解码后不变
  frameW: 0,
  frameH: 0,
  fps: 12,
  // 抽帧参数
  frameStart: 1,    // 1-based 起始帧
  frameEnd: 1,      // 1-based 结束帧（解码后设为总帧数）
  frameStep: 1,     // 抽帧间隔，1 = 全部保留
  // 去背景参数（可选）
  chromaColor: null,
  tolerance: 28,
  smooth: 14,
  despill: true,
  edgeSmooth: true,
  // 导出参数
  exportCols: 4,
  exportGap: 0,
  exportSizePreset: 'original',
}

export default function GifToSpriteApp({ onBack }) {
  const { t } = useI18n()
  const toast = useToast()
  const [state, setState] = useState(INITIAL)
  const update = useCallback(patch => setState(s => ({ ...s, ...patch })), [])

  const {
    rawFrames, frameW, frameH, frameStart, frameEnd, frameStep,
    chromaColor, tolerance, smooth, despill, edgeSmooth,
    exportCols, exportGap, exportSizePreset, sourceFile,
  } = state

  // ── Step 1: 上传 & 解码 ──────────────────────────────────────────────────
  const [decoding, setDecoding] = useState(false)
  const [drag, setDrag] = useState(false)

  async function handleFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.gif')) {
      toast.error(t('g2s.invalidGif'))
      return
    }
    setDecoding(true)
    try {
      const buffer = await file.arrayBuffer()
      const { width, height, frames: decoded } = decodeGif(buffer)
      if (!decoded.length) throw new Error('no frames')
      // 计算平均 FPS
      const avgDelay = decoded.reduce((s, f) => s + (f.delay || 100), 0) / decoded.length
      const fps = Math.round(1000 / Math.max(avgDelay, 10))
      update({
        sourceFile: file,
        rawFrames: decoded.map(f => ({ imageData: f.imageData })),
        frameW: width,
        frameH: height,
        fps: Math.min(Math.max(fps, 1), 60),
        frameStart: 1,
        frameEnd: decoded.length,
        frameStep: 1,
        chromaColor: null, // 新文件清除旧取色
      })
      setRefFrameIdx(0)
      toast.success(t('g2s.decodeOk').replace('{count}', decoded.length))
    } catch (e) {
      toast.error(t('g2s.decodeFailed') + (e.message || ''))
    } finally {
      setDecoding(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDrag(false)
    if (decoding) return
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  function handleSelect(e) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  // ── Step 2: 抽帧 ──────────────────────────────────────────────────────────
  // 从原始帧里按「保留范围 + 抽帧间隔」取子集，纯数组操作，实时生效
  const frames = useMemo(() => {
    if (!rawFrames.length) return []
    const start = Math.max(0, frameStart - 1)
    const end = Math.min(rawFrames.length, frameEnd)
    const sel = []
    for (let i = start; i < end; i += frameStep) sel.push(rawFrames[i])
    return sel
  }, [rawFrames, frameStart, frameEnd, frameStep])

  // ── Step 3: 去背景（可选）─────────────────────────────────────────────────
  const [previewMode, setPreviewMode] = useState('result') // result | alpha | solid
  const [solidBgColor, setSolidBgColor] = useState('#2e70ff')
  const [refFrameIdx, setRefFrameIdx] = useState(0)
  const [origCanvas, setOrigCanvas] = useState(null)
  const [previewCanvas, setPreviewCanvas] = useState(null)

  // 参考帧索引随抽帧结果收敛，防越界
  const safeRefIdx = frames.length ? Math.min(refFrameIdx, frames.length - 1) : 0

  // 去背景后的帧（取色才处理，否则原样）— 预览/导出统一用它
  const processedFrames = useMemo(() => {
    if (!chromaColor) return frames
    return frames.map(f => {
      const copy = new ImageData(new Uint8ClampedArray(f.imageData.data), f.imageData.width, f.imageData.height)
      applyChroma(copy, chromaColor, tolerance, smooth, despill, edgeSmooth)
      return { imageData: copy }
    })
  }, [frames, chromaColor, tolerance, smooth, despill, edgeSmooth])

  // 参考帧原图：callback ref 挂载或参考帧变化时重绘
  useEffect(() => {
    if (!origCanvas || !frames.length) return
    const f = frames[safeRefIdx]
    if (!f) return
    origCanvas.width = f.imageData.width
    origCanvas.height = f.imageData.height
    origCanvas.getContext('2d').putImageData(f.imageData, 0, 0)
  }, [origCanvas, frames, safeRefIdx])

  // 去背景预览：参数变化时重绘参考帧
  useEffect(() => {
    if (!previewCanvas || !frames.length) return
    const f = frames[safeRefIdx]
    if (!f) return
    const w = f.imageData.width, h = f.imageData.height
    previewCanvas.width = w; previewCanvas.height = h
    const ctx = previewCanvas.getContext('2d')
    if (!chromaColor) {
      ctx.putImageData(f.imageData, 0, 0)
      return
    }
    const copy = new ImageData(new Uint8ClampedArray(f.imageData.data), w, h)
    applyChroma(copy, chromaColor, tolerance, smooth, despill, edgeSmooth)
    if (previewMode === 'alpha') {
      const alphaData = new ImageData(w, h)
      for (let i = 0; i < copy.data.length; i += 4) {
        const a = copy.data[i + 3]
        alphaData.data[i] = a; alphaData.data[i + 1] = a; alphaData.data[i + 2] = a; alphaData.data[i + 3] = 255
      }
      ctx.putImageData(alphaData, 0, 0)
    } else if (previewMode === 'solid') {
      ctx.fillStyle = solidBgColor
      ctx.fillRect(0, 0, w, h)
      const tmp = document.createElement('canvas')
      tmp.width = w; tmp.height = h
      tmp.getContext('2d').putImageData(copy, 0, 0)
      ctx.drawImage(tmp, 0, 0)
    } else {
      ctx.clearRect(0, 0, w, h)
      ctx.putImageData(copy, 0, 0)
    }
  }, [previewCanvas, frames, safeRefIdx, chromaColor, tolerance, smooth, despill, edgeSmooth, previewMode, solidBgColor])

  // 点击参考帧取色
  function pickColor(e) {
    if (!origCanvas || !frames.length) return
    const rect = origCanvas.getBoundingClientRect()
    const sx = Math.round((e.clientX - rect.left) / rect.width * origCanvas.width)
    const sy = Math.round((e.clientY - rect.top) / rect.height * origCanvas.height)
    const px = origCanvas.getContext('2d').getImageData(sx, sy, 1, 1).data
    update({ chromaColor: rgbToHex(px[0], px[1], px[2]) })
  }

  // ── Step 4: 预览与导出 ────────────────────────────────────────────────────

  // 计算导出尺寸
  const { outW, outH } = useMemo(() => {
    if (!frameW) return { outW: 0, outH: 0 }
    if (exportSizePreset === 'original') return { outW: frameW, outH: frameH }
    const target = parseInt(exportSizePreset)
    const ratio = frameW / frameH
    return ratio >= 1
      ? { outW: target, outH: Math.round(target / ratio) }
      : { outW: Math.round(target * ratio), outH: target }
  }, [frameW, frameH, exportSizePreset])

  const exportRows = frames.length > 0 ? Math.ceil(frames.length / exportCols) : 0
  const sheetW = exportCols * outW + (exportCols - 1) * exportGap
  const sheetH = exportRows * outH + Math.max(0, exportRows - 1) * exportGap

  // 序列图 canvas（用去背景后的帧）
  const sheetCanvas = useMemo(() => {
    if (!processedFrames.length) return null
    return buildSheet(processedFrames, exportRows, exportCols, outW, outH, true, exportGap)
  }, [processedFrames, exportRows, exportCols, outW, outH, exportGap])

  // 序列图预览 DataUrl
  const sheetDataUrl = useMemo(() => {
    if (!sheetCanvas) return null
    try { return sheetCanvas.toDataURL('image/png') } catch { return null }
  }, [sheetCanvas])

  // ── 动画预览 ──
  const [playing, setPlaying] = useState(false)
  const [animIdx, setAnimIdx] = useState(0)
  const [previewEl, setPreviewEl] = useState(null)
  const animRef = useRef(null)
  const [tab, setTab] = useState('sheet')

  useEffect(() => {
    if (!previewEl || !processedFrames.length || tab !== 'animation') return
    const f = processedFrames[animIdx % processedFrames.length]
    if (!f) return
    const w = f.imageData.width
    const h = f.imageData.height
    previewEl.width = w
    previewEl.height = h
    previewEl.getContext('2d').putImageData(f.imageData, 0, 0)
  }, [previewEl, processedFrames, animIdx, tab])

  useEffect(() => {
    if (!playing || !frames.length || tab !== 'animation') return
    const interval = 1000 / Math.max(state.fps, 1)
    let last = 0
    function tick(ts) {
      if (ts - last >= interval) {
        setAnimIdx(i => (i + 1) % frames.length)
        last = ts
      }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [playing, state.fps, frames.length, tab])

  useEffect(() => { if (tab === 'sheet') { setPlaying(false); setAnimIdx(0) } }, [tab])

  // ── 导出：精灵图 PNG ──
  const [exporting, setExporting] = useState(false)
  async function handleExportPng() {
    if (!sheetCanvas) return
    setExporting(true)
    try {
      await new Promise((res, rej) => {
        sheetCanvas.toBlob(blob => {
          if (!blob) return rej(new Error('toBlob failed'))
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = `${baseName(sourceFile?.name || 'gif')}-spritesheet.png`
          a.click()
          setTimeout(() => URL.revokeObjectURL(a.href), 60000)
          res()
        }, 'image/png')
      })
      toast.success(t('g2s.pngDl'))
    } catch (e) {
      toast.error(t('g2s.exportFailed') + e.message)
    } finally {
      setExporting(false)
    }
  }

  // ── 导出：PNG 序列 ZIP（用去背景后的帧）──
  const [exportZip, setExportZip] = useState(false)
  async function handleExportZip() {
    if (!processedFrames.length) return
    setExportZip(true)
    try {
      const zip = new JSZip()
      const name = baseName(sourceFile?.name || 'gif')
      for (let i = 0; i < processedFrames.length; i++) {
        const f = processedFrames[i]
        const c = document.createElement('canvas')
        c.width = outW; c.height = outH
        const src = document.createElement('canvas')
        src.width = f.imageData.width; src.height = f.imageData.height
        src.getContext('2d').putImageData(f.imageData, 0, 0)
        c.getContext('2d').drawImage(src, 0, 0, outW, outH)
        const blob = await new Promise(res => c.toBlob(res, 'image/png'))
        if (!blob) throw new Error(`frame ${i + 1} toBlob failed`)
        zip.file(`${name}-frame-${String(i + 1).padStart(3, '0')}.png`, blob)
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(zipBlob)
      a.download = `${name}-frames.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 60000)
      toast.success(t('g2s.zipDl'))
    } catch (e) {
      toast.error(t('g2s.zipFailed') + e.message)
    } finally {
      setExportZip(false)
    }
  }

  // ── 重新选择 ──
  function handleReset() {
    setState(INITIAL)
    setTab('sheet')
    setPlaying(false)
    setAnimIdx(0)
    setPreviewMode('result')
    setRefFrameIdx(0)
  }

  // 第一帧缩略图（上传卡片预览，与其他工具一致）
  const thumbUrl = useMemo(() => {
    if (!rawFrames.length) return null
    const f = rawFrames[0]
    const c = document.createElement('canvas')
    c.width = f.imageData.width; c.height = f.imageData.height
    c.getContext('2d').putImageData(f.imageData, 0, 0)
    try { return c.toDataURL('image/png') } catch { return null }
  }, [rawFrames])

  const step1Done = rawFrames.length > 0
  const metaText = frames.length ? `${frames.length} ${t('common.frames')} · ${sheetW} × ${sheetH} px` : ''

  return (
    <>
      <nav className="tut-nav">
        <button className="tut-back-btn" onClick={onBack}>
          <i className="ri-arrow-left-line" /> {t('common.home')}
        </button>
        <span className="tut-nav-title">{t('tool06.title')}</span>
      </nav>
      <div className="app">

        {/* ── 步骤 1：上传 GIF ── */}
        <Panel stepNum={1} title={t('g2s.stepUpload')} done={step1Done} locked={false} defaultOpen={true}>
          {!step1Done ? (
            <>
              <div
                className={`dropzone ${drag ? 'drag' : ''}`}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
                onClick={() => !decoding && document.getElementById('g2s-file-input').click()}
                role="button"
                aria-label={t('g2s.dropHint')}
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && !decoding && document.getElementById('g2s-file-input').click()}
              >
                <input
                  id="g2s-file-input"
                  type="file"
                  accept=".gif"
                  onChange={handleSelect}
                  style={{ display: 'none' }}
                />
                <div className="dropzone-icon"><i className="ri-file-gif-line" /></div>
                <div className="dropzone-text">
                  <strong>{t('g2s.dropHint')}</strong>
                </div>
              </div>
              <p className="upload-hint">{t('g2s.formatHint')}</p>
              {decoding && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  <i className="ri-loader-4-line" style={{ animation: 'spin 1s linear infinite' }} />
                  {t('g2s.decoding')}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 80, height: 80, borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 12px 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
              }}>
                {thumbUrl && <img src={thumbUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
              </div>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{sourceFile?.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 4 }}>
                  {rawFrames.length} {t('common.frames')} · {frameW} × {frameH} px · {state.fps} FPS
                </div>
                <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={handleReset}>
                  {t('common.reselect')}
                </button>
              </div>
            </div>
          )}
        </Panel>

        {/* ── 步骤 2：抽帧 ── */}
        <Panel stepNum={2} title={t('g2s.stepSample')} done={step1Done} locked={!step1Done} defaultOpen={false}
          metaText={rawFrames.length ? `${rawFrames.length} → ${frames.length} ${t('common.frames')}` : ''}>
          <p className="step-hint" style={{ marginBottom: 14 }}>{t('g2s.sampleHint')}</p>

          {/* 三个输入等宽一行：起始帧 / 结束帧 / 抽帧间隔（窄屏自动换行）*/}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('g2s.startFrame')}</label>
              <NumStepper value={frameStart} min={1} max={frameEnd} onChange={v => update({ frameStart: v })} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('g2s.endFrame')}</label>
              <NumStepper value={frameEnd} min={frameStart} max={rawFrames.length} onChange={v => update({ frameEnd: v })} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('g2s.frameStep')}</label>
              <NumStepper value={frameStep} min={1} max={rawFrames.length || 1} onChange={v => update({ frameStep: v })} />
            </div>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 8 }}>{t('g2s.stepHint')}</div>

          {/* 抽取结果：整行横条 */}
          <div className="option-card" style={{ padding: '10px 16px', minHeight: 'auto', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('g2s.resultFrames')}</span>
            <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent)' }}>
              {rawFrames.length} → {frames.length} {t('common.frames')}
            </span>
          </div>
        </Panel>

        {/* ── 步骤 3：去背景（可选）── */}
        <Panel stepNum={3} title={t('g2s.stepChroma')} done={!!chromaColor} locked={!step1Done} defaultOpen={false}
          metaText={chromaColor ? chromaColor : ''}>
          <p className="step-hint">{t('g2s.chromaHint')}</p>

          {frames.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 12 }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {t('g2s.refFrame')} {safeRefIdx + 1} / {frames.length}
              </span>
              <input type="range" min={1} max={frames.length} value={safeRefIdx + 1}
                style={{ flex: 1 }}
                onChange={e => setRefFrameIdx(Number(e.target.value) - 1)}
              />
            </div>
          )}

          <div className="grid-2col" style={{ display: 'grid', gap: 14 }}>
            {/* 左栏：参考帧原图（取色） */}
            <div>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{t('ref.original')}</span>
                  <div className="sub-accent">{chromaColor ? t('ref.colorPicked') : t('ref.clickSample')}</div>
                </div>
                {chromaColor && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 35,
                      background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    }}>
                      <div className="color-dot" style={{ background: chromaColor }} />
                      <span className="chroma-rgb-text" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>
                        {(() => { const rgb = hexToRgb(chromaColor); return `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})` })()}
                      </span>
                    </div>
                    <button className="btn btn-ghost" onClick={() => update({ chromaColor: null })}>
                      {t('common.clear')}
                    </button>
                  </div>
                )}
              </div>
              <div style={{
                position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                border: '1px solid var(--border)',
                background: 'repeating-conic-gradient(#808080 0% 25%, #a0a0a0 0% 50%) 0 0 / 16px 16px',
              }}>
                <canvas ref={setOrigCanvas} onClick={pickColor} className="canvas-crosshair"
                  style={{ width: '100%', display: 'block', imageRendering: 'pixelated' }} />
                {!chromaColor && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.35)', pointerEvents: 'none',
                  }}>
                    <div style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 'var(--radius-sm)', padding: '12px 18px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2d1b00' }}>{t('ref.clickBgColor')}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 右栏：去背景预览 */}
            <div>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{t('ref.mattePreview')}</span>
                <div className="segmented-control" style={{ height: 35 }}>
                  {[
                    { key: 'result', label: t('ref.modeResult') },
                    { key: 'alpha', label: t('ref.modeAlpha') },
                    { key: 'solid', label: t('ref.modeSolid') },
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
                borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)',
                background: previewMode === 'result'
                  ? 'repeating-conic-gradient(#808080 0% 25%, #a0a0a0 0% 50%) 0 0 / 16px 16px'
                  : '#000',
              }}>
                <canvas ref={setPreviewCanvas} style={{ width: '100%', display: 'block', imageRendering: 'pixelated' }} />
              </div>
              {previewMode === 'solid' && (
                <div className="solid-color-row">
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{t('ref.checkColor')}</span>
                  <label className="color-picker-wrap">
                    <div style={{ width: 18, height: 18, background: solidBgColor, border: '1px solid var(--border)' }} />
                    <input type="color" value={solidBgColor} onChange={e => setSolidBgColor(e.target.value)} />
                  </label>
                  <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text)' }}>{solidBgColor.toUpperCase()}</span>
                </div>
              )}
            </div>
          </div>

          {chromaColor && (
            <ChromaParams
              tolerance={tolerance} smooth={smooth} despill={despill} edgeSmooth={edgeSmooth}
              title={t('chroma.advancedTitle')} hint={t('chroma.advancedHint')}
              onChange={p => {
                if ('tolerance' in p) update({ tolerance: p.tolerance })
                if ('smooth' in p) update({ smooth: p.smooth })
                if ('despill' in p) update({ despill: p.despill })
                if ('edgeSmooth' in p) update({ edgeSmooth: p.edgeSmooth })
              }}
            />
          )}
        </Panel>

        {/* ── 步骤 4：预览与导出 ── */}
        <Panel stepNum={4} title={t('g2s.stepExport')} done={false} locked={!step1Done} defaultOpen={false} metaText={metaText}>
          <div className="grid-2col" style={{ display: 'grid', gap: 16, alignItems: 'start' }}>

            {/* ── 左栏：预览 ── */}
            <div>
              <div className="segmented-control" style={{ marginBottom: 10 }}>
                <button className={`segmented-btn ${tab === 'sheet' ? 'active' : ''}`}
                  onClick={() => setTab('sheet')}>{t('export.tabSheet')}</button>
                <button className={`segmented-btn ${tab === 'animation' ? 'active' : ''}`}
                  onClick={() => { setTab('animation'); setPlaying(true) }}
                  disabled={!frames.length}>{t('export.tabAnimation')}</button>
              </div>

              {/* 序列图预览 */}
              {tab === 'sheet' && (
                sheetDataUrl ? (
                  <div style={{
                    maxHeight: 405, overflow: 'auto',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    background: 'repeating-conic-gradient(#808080 0% 25%, #a0a0a0 0% 50%) 0 0 / 16px 16px',
                  }}>
                    <img src={sheetDataUrl} alt="sprite sheet preview"
                      style={{ width: '100%', display: 'block' }} />
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem', padding: '60px 0', textAlign: 'center',
                    border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    {t('export.noPreview')}
                  </div>
                )
              )}

              {/* 动画预览 */}
              {tab === 'animation' && (
                <>
                  <div style={{
                    maxHeight: 405, overflow: 'auto',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    background: 'repeating-conic-gradient(#808080 0% 25%, #a0a0a0 0% 50%) 0 0 / 16px 16px',
                  }}>
                    <canvas ref={setPreviewEl} style={{ width: '100%', display: 'block' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
                      {t('export.frame').replace('{current}', (animIdx % frames.length) + 1).replace('{total}', frames.length)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flex: 1, minWidth: 120 }}>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        FPS {state.fps}
                      </span>
                      <input
                        type="range"
                        min={1} max={60} value={state.fps}
                        style={{ flex: 1 }}
                        onChange={e => update({ fps: Number(e.target.value) })}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost" onClick={() => setPlaying(p => !p)}>
                        {playing ? t('common.pause') : t('common.play')}
                      </button>
                      <button className="btn btn-ghost" onClick={() => { setPlaying(false); setAnimIdx(0) }}>
                        {t('common.replay')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── 右栏：参数与导出 ── */}
            <div className="export-right-col">
              {/* 导出列数 + 间距 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('export.cols')}</label>
                  <NumStepper value={exportCols} min={1} max={8} onChange={v => update({ exportCols: v })} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('export.gap')}</label>
                  <NumStepper value={exportGap} min={0} max={48} onChange={v => update({ exportGap: v })} />
                </div>
              </div>

              {/* 单帧尺寸预设 */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('export.sizePreset')}</label>
                <div style={{ position: 'relative' }}>
                  <select value={exportSizePreset}
                    onChange={e => update({ exportSizePreset: e.target.value })}
                    style={{
                      WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
                      padding: '0 32px 0 10px', width: '100%', height: 35,
                      boxSizing: 'border-box', cursor: 'pointer',
                    }}
                  >
                    <option value="original">{t('common.original')}</option>
                    <option value="32">32 × 32</option>
                    <option value="64">64 × 64</option>
                    <option value="128">128 × 128</option>
                    <option value="256">256 × 256</option>
                    <option value="512">512 × 512</option>
                    <option value="1024">1024 × 1024</option>
                  </select>
                  <i className="ri-arrow-down-s-line" style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    pointerEvents: 'none', color: 'var(--text-muted)', fontSize: '1rem',
                  }} />
                </div>
              </div>

              {/* 预估导出尺寸 */}
              <div className="option-card" style={{ padding: '10px 14px', minHeight: 'auto', marginBottom: 14 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{t('export.estimatedSize')}</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent)', margin: '2px 0' }}>
                  {sheetW > 0 ? `${sheetW} × ${sheetH}` : '—'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  {t('sprite.sheetInfo').replace('{cols}', exportCols).replace('{rows}', exportRows).replace('{w}', outW).replace('{h}', outH)}
                </div>
                {(sheetW > 8192 || sheetH > 8192) && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: 4 }}>{t('export.sizeTooLarge')}</div>
                )}
              </div>

              {/* 导出按钮 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleExportPng}
                  disabled={exporting || !sheetCanvas}
                >
                  {exporting ? t('common.exporting') : t('g2s.dlPng')}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleExportZip}
                  disabled={exportZip || !frames.length}
                >
                  {exportZip ? t('common.exporting') : t('g2s.dlZip')}
                </button>
              </div>
            </div>
          </div>
        </Panel>

      </div>
    </>
  )
}
