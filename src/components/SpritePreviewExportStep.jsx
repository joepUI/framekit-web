import { useState, useEffect, useRef, useMemo } from 'react'
import JSZip from 'jszip'
import Panel from './Panel.jsx'
import { buildSheet } from '../utils/frameExtract.js'
import { encodeGif } from '../utils/gifEncoder.js'
import UPNG from 'upng-js'
import { baseName } from '../utils/format.js'
import { useToast } from './Toast.jsx'
import { useI18n } from '../i18n/index.jsx'
import { canvasToPngBlob, optimizePng, getPngCompressEnabled, setPngCompressEnabled } from '../utils/pngOptimize.js'
import PngCompressToggle from './PngCompressToggle.jsx'

export default function SpritePreviewExportStep({ stepNum, locked, state, update }) {
  const { t } = useI18n()
  const { frames, frameW, frameH, previewFps, exportCols, exportGap, exportSizePreset, sourceFile } = state

  const [playing, setPlaying] = useState(false)
  const [animIdx, setAnimIdx] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportGif, setExportGif] = useState(false)
  const [exportZip, setExportZip] = useState(false)
  const [exportApng, setExportApng] = useState(false)
  const animRef = useRef(null)
  const toast = useToast()

  // callback ref for preview canvas
  const [previewEl, setPreviewEl] = useState(null)

  // ── 计算导出尺寸 ──
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

  // ── 导出用序列图 canvas ──
  const sheetCanvas = useMemo(() => {
    if (!frames.length || locked) return null
    return buildSheet(frames, exportRows, exportCols, outW, outH, true, exportGap)
  }, [frames, exportRows, exportCols, outW, outH, exportGap, locked])

  // 绘制动画预览帧到 canvas（始终用原始帧尺寸，不受导出尺寸影响）
  useEffect(() => {
    if (!previewEl || locked || !frames.length) return
    const f = frames[animIdx]
    if (!f) return
    const w = f.imageData.width
    const h = f.imageData.height
    previewEl.width = w
    previewEl.height = h
    previewEl.getContext('2d').putImageData(f.imageData, 0, 0)
  }, [previewEl, frames, animIdx, locked])

  // ── 动画预览循环 ──
  useEffect(() => {
    if (!playing || !frames.length) return
    const interval = 1000 / Math.max(previewFps, 1)
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
  }, [playing, previewFps, frames.length])

  // ── PNG 压缩开关 ──
  const [pngCompress, _setPngCompress] = useState(getPngCompressEnabled)
  function togglePngCompress(v) { _setPngCompress(v); setPngCompressEnabled(v) }

  // ── 导出精灵图 PNG ──
  async function handleExportPng() {
    if (!sheetCanvas) return
    setExporting(true)
    try {
      const blob = await canvasToPngBlob(sheetCanvas, pngCompress)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${baseName(sourceFile?.name || 'sprite')}-edited.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 60000)
      toast.success(t('sprite.pngDl'))
    } catch (e) {
      toast.error(t('sprite.exportFailed') + e.message)
    } finally {
      setExporting(false)
    }
  }

  // ── 导出动画 GIF ──
  async function handleExportGif() {
    if (!frames.length) return
    setExportGif(true)
    try {
      // 构建帧数组（统一缩放到 outW × outH）
      const gifFrames = frames.map(f => {
        const c = document.createElement('canvas')
        c.width = outW; c.height = outH
        const src = document.createElement('canvas')
        src.width = f.imageData.width; src.height = f.imageData.height
        src.getContext('2d').putImageData(f.imageData, 0, 0)
        c.getContext('2d').drawImage(src, 0, 0, outW, outH)
        return { imageData: c.getContext('2d').getImageData(0, 0, outW, outH) }
      })
      const bytes = encodeGif(gifFrames.map(f => f.imageData), outW, outH, previewFps)
      const blob = new Blob([bytes], { type: 'image/gif' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${baseName(sourceFile?.name || 'sprite')}.gif`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 60000)
      toast.success(t('sprite.gifDl'))
    } catch (e) {
      toast.error(t('sprite.gifFailed') + e.message)
    } finally {
      setExportGif(false)
    }
  }

  // ── 导出单帧 ZIP ──
  const [zipProgress, setZipProgress] = useState('')
  async function handleExportZip() {
    if (!frames.length) return
    setExportZip(true)
    setZipProgress('')
    try {
      const zip = new JSZip()
      const name = baseName(sourceFile?.name || 'sprite')
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]
        const c = document.createElement('canvas')
        c.width = outW; c.height = outH
        const src = document.createElement('canvas')
        src.width = f.imageData.width; src.height = f.imageData.height
        src.getContext('2d').putImageData(f.imageData, 0, 0)
        c.getContext('2d').drawImage(src, 0, 0, outW, outH)
        let blob = await new Promise(res => c.toBlob(res, 'image/png'))
        if (!blob) throw new Error(`frame ${i + 1} toBlob failed`)
        if (pngCompress) {
          setZipProgress(t('png.compressing').replace('{current}', i + 1).replace('{total}', frames.length))
          blob = await optimizePng(blob)
        }
        zip.file(`${name}-frame-${String(i + 1).padStart(3, '0')}.png`, blob)
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(zipBlob)
      a.download = `${baseName(sourceFile?.name || 'sprite')}-frames.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 60000)
      toast.success(t('sprite.zipDl'))
    } catch (e) {
      toast.error(t('sprite.zipFailed') + e.message)
    } finally {
      setExportZip(false)
      setZipProgress('')
    }
  }

  // ── 导出 APNG ──
  async function handleExportApng() {
    if (!frames.length) return
    setExportApng(true)
    try {
      const rgbaList = frames.map(f => {
        const c = document.createElement('canvas')
        c.width = outW; c.height = outH
        const src = document.createElement('canvas')
        src.width = f.imageData.width; src.height = f.imageData.height
        src.getContext('2d').putImageData(f.imageData, 0, 0)
        c.getContext('2d').drawImage(src, 0, 0, outW, outH)
        return c.getContext('2d').getImageData(0, 0, outW, outH).data.buffer
      })
      const delay = Math.round(1000 / Math.max(previewFps, 1))
      const delays = frames.map(() => delay)
      const buf = UPNG.encode(rgbaList, outW, outH, 0, delays)
      const blob = new Blob([buf], { type: 'image/png' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${baseName(sourceFile?.name || 'sprite')}.apng`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 60000)
      toast.success(t('sprite.apngDl'))
    } catch (e) {
      toast.error(t('sprite.apngFailed') + e.message)
    } finally {
      setExportApng(false)
    }
  }

  const metaText = frames.length ? `${frames.length} ${t('common.frames')} · ${sheetW} × ${sheetH} px` : ''

  return (
    <Panel stepNum={stepNum} title={t('sprite.stepPreview')} done={false} locked={locked} defaultOpen={false} metaText={metaText}>
      <div className="grid-2col" style={{ display: 'grid', gap: 16, alignItems: 'start' }}>

        {/* ── 左栏：动画预览 ── */}
        <div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 6 }}>{t('sprite.animPreview')}</div>

          {/* 预览 canvas（固定方形区域，不随导出尺寸变化） */}
          <div style={{
            background: 'repeating-conic-gradient(#808080 0% 25%, #a0a0a0 0% 50%) 0 0 / 16px 16px',
            border: '1px solid var(--border-soft)',
            aspectRatio: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <canvas
              ref={setPreviewEl}
              style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>

          {/* 动画控制 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setPlaying(p => !p)}
              style={{ minWidth: 72 }}
            >
              <i className={playing ? 'ri-pause-line' : 'ri-play-line'} /> {playing ? t('common.pause') : t('common.play')}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flex: 1, minWidth: 120 }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                FPS {previewFps}
              </span>
              <input
                type="range"
                min={1} max={60} value={previewFps}
                style={{ flex: 1 }}
                onChange={e => update({ previewFps: Number(e.target.value) })}
              />
            </div>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-dim)' }}>
              {animIdx + 1} / {frames.length}
            </span>
          </div>
        </div>

        {/* ── 右栏：导出设置 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>

          {/* 单帧尺寸预设 */}
          <div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 6 }}>{t('sprite.sizePreset')}</div>
            <div style={{ position: 'relative' }}>
              <select
                value={exportSizePreset}
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
          <div className="option-card">
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('sprite.estimatedSize')}</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-bold)', color: 'var(--accent)', marginTop: 4 }}>
              {sheetW > 0 ? `${sheetW} × ${sheetH}` : '—'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', marginTop: 2 }}>
              {t('sprite.sheetInfo').replace('{cols}', exportCols).replace('{rows}', exportRows).replace('{w}', outW).replace('{h}', outH)}
            </div>
          </div>

          {/* PNG 压缩开关（父级 flex gap 控制间距，不传 margin） */}
          <PngCompressToggle checked={pngCompress} onChange={togglePngCompress} />

          {/* 导出按钮 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleExportPng}
              disabled={exporting || !sheetCanvas}
            >
              {exporting ? (pngCompress ? t('png.loadingEngine') : t('common.exporting')) : t('sprite.dlPng')}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleExportGif}
              disabled={exportGif || !frames.length}
            >
              {exportGif ? t('common.exporting') : t('sprite.dlGif')}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleExportZip}
              disabled={exportZip || !frames.length}
            >
              {exportZip ? (zipProgress || t('common.exporting')) : t('sprite.dlZip')}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleExportApng}
              disabled={exportApng || !frames.length}
            >
              {exportApng ? t('common.exporting') : t('sprite.dlApng')}
            </button>
          </div>

        </div>
      </div>
    </Panel>
  )
}
