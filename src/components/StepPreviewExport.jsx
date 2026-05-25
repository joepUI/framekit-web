import { useRef, useState, useEffect, useMemo } from 'react'
import Panel from './Panel.jsx'
import NumStepper from './NumStepper.jsx'
import { baseName } from '../utils/format.js'
import { buildSheet } from '../utils/frameExtract.js'
import { applyChroma } from '../utils/chroma.js'
import { encodeGif } from '../utils/gifEncoder.js'
import { buildSpineZip } from '../utils/spineExport.js'
import JSZip from 'jszip'
import { useToast } from './Toast.jsx'
import { useI18n } from '../i18n/index.jsx'

export default function StepPreviewExport({ stepNum, done, locked, state, update }) {
  const { t } = useI18n()
  const [tab, setTab] = useState('sheet') // 'sheet' | 'animation'
  const [playing, setPlaying] = useState(false)
  const [animFps, setAnimFps] = useState(12)
  const [frameIdx, setFrameIdx] = useState(0)
  const animRef = useRef(null)
  const [animCanvas, setAnimCanvas] = useState(null)

  const [gifLoading, setGifLoading] = useState(false)
  const [zipLoading, setZipLoading] = useState(false)
  const [showSpine, setShowSpine] = useState(false)
  const toast = useToast()
  const [spineCanvas, setSpineCanvas] = useState(null)
  const [spinePlaying, setSpinePlaying] = useState(true)
  const [spineFrameIdx, setSpineFrameIdx] = useState(0)
  const [spineLoop, setSpineLoop] = useState(true)
  const [skeletonName, setSkeletonName] = useState('')
  const [animationName, setAnimationName] = useState('idle')
  const [slotName, setSlotName] = useState('sprite')
  const [spineFps, setSpineFps] = useState(12)
  const [spineExporting, setSpineExporting] = useState(false)
  const [spineProgress, setSpineProgress] = useState(0)
  const spineAnimRef = useRef(null)

  const frames = state.frames || []
  const total = frames.length
  const name = baseName(state.videoFile?.name || 'timesheet')

  const cols = state.exportCols || 4
  const gap = state.exportGap || 0
  const sizePreset = state.exportSizePreset || 'original'

  const crop = state.cropRect
  const baseW = (frames[0]?.imageData?.width) || crop?.w || state.videoWidth || 1
  const baseH = (frames[0]?.imageData?.height) || crop?.h || state.videoHeight || 1

  // 单帧尺寸
  let frameW = baseW, frameH = baseH
  if (sizePreset !== 'original') {
    const target = parseInt(sizePreset)
    const ratio = baseW / baseH
    if (ratio >= 1) { frameW = target; frameH = Math.round(target / ratio) }
    else { frameH = target; frameW = Math.round(target * ratio) }
  }

  const rows = Math.ceil(total / cols)
  const sheetW = cols * frameW + (cols - 1) * gap
  const sheetH = rows * frameH + (rows - 1) * gap

  // 实时构建序列图预览（普通）——locked 时不计算，等步骤4生成按钮触发
  const sheetCanvas = useMemo(() => {
    if (!total || locked) return null
    try { return buildSheet(frames, rows, cols, frameW, frameH, false, gap) }
    catch { return null }
  }, [total, rows, cols, frameW, frameH, gap, locked])

  // 序列图预览 DataUrl：有色键时优先用透明版
  const sheetDataUrl = useMemo(() => {
    const canvas = (state.chromaColor && state.sheetAlphaCanvas) ? state.sheetAlphaCanvas : sheetCanvas
    if (!canvas) return null
    try { return canvas.toDataURL('image/png') } catch { return null }
  }, [sheetCanvas, state.sheetAlphaCanvas, state.chromaColor])

  // 渲染后再同步 sheetCanvas 到父级 state——locked 时不同步，避免覆盖步骤4的生成结果
  useEffect(() => {
    if (locked) return
    update({ sheetCanvas })
  }, [sheetCanvas, locked])

  // 如果有色键，同步构建透明版——locked 时不构建
  useEffect(() => {
    if (locked) return
    if (!total || !state.chromaColor) { update({ sheetAlphaCanvas: null }); return }
    const alphaFrames = frames.map(f => {
      const copy = new ImageData(new Uint8ClampedArray(f.imageData.data), f.imageData.width, f.imageData.height)
      applyChroma(copy, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth)
      return { imageData: copy }
    })
    const canvas = buildSheet(alphaFrames, rows, cols, frameW, frameH, true, gap)
    update({ sheetAlphaCanvas: canvas })
  }, [total, rows, cols, frameW, frameH, gap, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth, locked])

  // 动画帧绘制（有色键时显示去背景后的帧）
  useEffect(() => {
    if (!total || !animCanvas || tab !== 'animation') return
    const f = frames[frameIdx % total]
    if (!f?.imageData) return
    const src = f.imageData
    animCanvas.width = src.width
    animCanvas.height = src.height
    const ctx = animCanvas.getContext('2d')
    ctx.clearRect(0, 0, src.width, src.height)
    if (state.chromaColor) {
      const copy = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
      applyChroma(copy, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth)
      ctx.putImageData(copy, 0, 0)
    } else {
      ctx.putImageData(src, 0, 0)
    }
  }, [frameIdx, frames, total, tab, animCanvas, state.chromaColor, state.tolerance, state.smooth, state.despill])

  // 动画循环
  useEffect(() => {
    if (!playing || total === 0 || tab !== 'animation') return
    const interval = 1000 / Math.max(animFps, 1)
    let last = 0
    function tick(ts) {
      if (ts - last >= interval) { setFrameIdx(i => (i + 1) % total); last = ts }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [playing, animFps, total, tab])

  useEffect(() => { if (tab === 'sheet') { setPlaying(false); setFrameIdx(0) } }, [tab])

  // 下载工具
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  function downloadPng() {
    const c = sheetCanvas || state.sheetCanvas
    if (!c) return
    c.toBlob(b => { downloadBlob(b, `${name}-timesheet.png`); toast.success(t('toast.normalPngDl')) }, 'image/png')
  }

  function downloadAlphaPng() {
    if (!state.sheetAlphaCanvas) { toast.warning(t('toast.needColor')); return }
    state.sheetAlphaCanvas.toBlob(b => { downloadBlob(b, `${name}-timesheet-alpha.png`); toast.success(t('toast.alphaPngDl')) }, 'image/png')
  }

  async function downloadGif() {
    if (!total) return
    setGifLoading(true)
    try {
      // 按单帧尺寸预设缩放每帧（有色键时先去背景）
      const scaledFrames = frames.map(f => {
        let src = f.imageData
        if (state.chromaColor) {
          src = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
          applyChroma(src, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth)
        }
        const srcCanvas = document.createElement('canvas')
        srcCanvas.width = src.width
        srcCanvas.height = src.height
        srcCanvas.getContext('2d').putImageData(src, 0, 0)
        const dstCanvas = document.createElement('canvas')
        dstCanvas.width = frameW
        dstCanvas.height = frameH
        dstCanvas.getContext('2d').drawImage(srcCanvas, 0, 0, src.width, src.height, 0, 0, frameW, frameH)
        return dstCanvas.getContext('2d').getImageData(0, 0, frameW, frameH)
      })
      const gifBytes = encodeGif(scaledFrames, frameW, frameH, state.fps || 12)
      downloadBlob(new Blob([gifBytes], { type: 'image/gif' }), `${name}-animation.gif`)
      toast.success(t('toast.gifDl'))
    } catch (e) { toast.error(t('toast.gifFailed') + e.message) }
    finally { setGifLoading(false) }
  }

  async function downloadAlphaZip() {
    if (!total || !state.chromaColor) { toast.warning(t('toast.needColorBg')); return }
    setZipLoading(true)
    try {
      const zip = new JSZip()
      for (let i = 0; i < total; i++) {
        const f = frames[i]
        const copy = new ImageData(new Uint8ClampedArray(f.imageData.data), f.imageData.width, f.imageData.height)
        applyChroma(copy, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth)
        const c = document.createElement('canvas')
        c.width = copy.width; c.height = copy.height
        c.getContext('2d').putImageData(copy, 0, 0)
        const blob = await new Promise(res => c.toBlob(res, 'image/png'))
        zip.file(`${name}-frame-${String(i + 1).padStart(3, '0')}.png`, blob)
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(zipBlob, `${name}-frames.zip`)
      toast.success(t('toast.alphaZipDl'))
    } catch (e) { toast.error(t('toast.zipFailed') + e.message) }
    finally { setZipLoading(false) }
  }

  const sizeDesc = sizePreset === 'original' ? t('export.keepOriginal') : t('export.scaledTo').replace('{w}', frameW).replace('{h}', frameH)

  // 打开 Spine 弹窗时初始化默认值
  function openSpine() {
    setSkeletonName(name)
    setAnimationName('idle')
    setSlotName('sprite')
    setSpineFps(state.fps || 12)
    setSpineFrameIdx(0)
    setSpinePlaying(true)
    setShowSpine(true)
  }

  // Spine 动画帧绘制
  useEffect(() => {
    if (!showSpine || !total || !spineCanvas) return
    const f = frames[spineFrameIdx % total]
    if (!f?.imageData) return
    const src = f.imageData
    spineCanvas.width = src.width
    spineCanvas.height = src.height
    const ctx = spineCanvas.getContext('2d')
    ctx.clearRect(0, 0, src.width, src.height)
    if (state.chromaColor) {
      const copy = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
      applyChroma(copy, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth)
      ctx.putImageData(copy, 0, 0)
    } else {
      ctx.putImageData(src, 0, 0)
    }
  }, [showSpine, spineFrameIdx, frames, total, spineCanvas, state.chromaColor, state.tolerance, state.smooth, state.despill])

  // Spine 动画循环
  useEffect(() => {
    if (!showSpine || !spinePlaying || total === 0) return
    const interval = 1000 / Math.max(spineFps, 1)
    let last = 0
    function tick(ts) {
      if (ts - last >= interval) {
        setSpineFrameIdx(i => {
          const next = i + 1
          if (next >= total) return spineLoop ? 0 : i
          return next
        })
        last = ts
      }
      spineAnimRef.current = requestAnimationFrame(tick)
    }
    spineAnimRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(spineAnimRef.current)
  }, [showSpine, spinePlaying, spineFps, total, spineLoop])

  // 导出 Spine ZIP
  async function exportSpine() {
    if (!total) return
    setSpineExporting(true)
    setSpineProgress(0)
    try {
      const processedFrames = frames.map(f => {
        if (!state.chromaColor) return f.imageData
        const copy = new ImageData(new Uint8ClampedArray(f.imageData.data), f.imageData.width, f.imageData.height)
        applyChroma(copy, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth)
        return copy
      })
      const w = processedFrames[0].width
      const h = processedFrames[0].height
      const blob = await buildSpineZip({
        baseName: name,
        frames: processedFrames,
        width: w,
        height: h,
        fps: spineFps,
        skeletonName,
        animationName,
        slotName,
        onProgress: (cur, tot) => setSpineProgress(Math.round((cur / tot) * 100)),
      })
      downloadBlob(blob, `${name}-spine.zip`)
      toast.success(t('toast.spineDl'))
    } catch (e) {
      toast.error(t('spine.exportFailed') + e.message)
    } finally {
      setSpineExporting(false)
    }
  }

  // 按钮配置：根据是否去背景动态生成
  const exportButtons = state.chromaColor
    ? [
        { label: t('export.dlGif'), onClick: downloadGif, disabled: gifLoading || !total, loading: gifLoading },
        { label: t('export.dlAlphaPng'), onClick: downloadAlphaPng, disabled: !state.sheetAlphaCanvas },
        { label: t('export.dlAlphaZip'), onClick: downloadAlphaZip, disabled: zipLoading || !total || !state.chromaColor, loading: zipLoading },
        { label: t('export.enterSpine'), onClick: openSpine, disabled: !total, primary: true },
      ]
    : [
        { label: t('export.dlNormalPng'), onClick: downloadPng, disabled: !sheetCanvas && !state.sheetCanvas },
        { label: t('export.dlGif'), onClick: downloadGif, disabled: gifLoading || !total, loading: gifLoading },
        { label: t('export.enterSpine'), onClick: openSpine, disabled: !total, primary: true },
      ]

  return (
    <Panel stepNum={stepNum} title={t('step.previewExport')} done={done} locked={locked} defaultOpen={!locked}
      metaText={total ? `${total} ${t('common.frames')} · ${sheetW} × ${sheetH}` : ''}
    >
      <div className="grid-2col" style={{ display: 'grid', gap: 16, alignItems: 'start' }}>
        {/* ── 左栏：预览 ── */}
        <div>
          {/* 切换 */}
          <div className="segmented-control" style={{ marginBottom: 10 }}>
            <button className={`segmented-btn ${tab === 'sheet' ? 'active' : ''}`}
              onClick={() => setTab('sheet')}>{t('export.tabSheet')}</button>
            <button className={`segmented-btn ${tab === 'animation' ? 'active' : ''}`}
              onClick={() => { setTab('animation'); setPlaying(true) }}
              disabled={!total}>{t('export.tabAnimation')}</button>
          </div>

          {/* 序列图预览 */}
          {tab === 'sheet' && (
            sheetDataUrl ? (
              <div style={{
                maxHeight: 405, overflow: 'auto',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: state.chromaColor
                  ? 'repeating-conic-gradient(#333 0% 25%, #444 0% 50%) 0 0 / 16px 16px'
                  : '#f5ead0',
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
                background: state.chromaColor
                  ? 'repeating-conic-gradient(#333 0% 25%, #444 0% 50%) 0 0 / 16px 16px'
                  : '#f5ead0',
              }}>
                <canvas ref={setAnimCanvas} style={{ width: '100%', display: 'block' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
                  {t('export.frame').replace('{current}', frameIdx + 1).replace('{total}', total)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  {animFps} {t('export.fpsPreview')}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost" onClick={() => setPlaying(p => !p)}>
                    {playing ? t('common.pause') : t('common.play')}
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setPlaying(false); setFrameIdx(0) }}>
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
              <NumStepper value={cols} min={1} max={8} onChange={v => update({ exportCols: v })} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('export.gap')}</label>
              <NumStepper value={gap} min={0} max={48} onChange={v => update({ exportGap: v })} />
            </div>
          </div>

          {/* 单帧尺寸预设 */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('export.sizePreset')}</label>
            <div style={{ position: 'relative' }}>
              <select value={sizePreset}
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
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '2px 0' }}>{sheetW} × {sheetH}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{sizeDesc}</div>
            {(sheetW > 8192 || sheetH > 8192) && (
              <div style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: 4 }}>{t('export.sizeTooLarge')}</div>
            )}
          </div>

          {/* 导出按钮 */}
          <div className="grid-2col" style={{ display: 'grid', gap: 8 }}>
            {exportButtons.map((b, i) => (
              <button key={i} className="btn btn-primary" onClick={b.onClick} disabled={b.disabled}>
                {b.loading ? t('export.processing') : b.label}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Spine 动画工作区弹窗 */}
      {showSpine && (
        <div
          onClick={() => !spineExporting && setShowSpine(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="spine-modal"
            style={{
              background: 'var(--surface)', borderRadius: 0,
              maxWidth: 1080, width: '100%', maxHeight: '90vh', overflow: 'auto',
              padding: 24, position: 'relative',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div className="grid-2col" style={{ display: 'grid', gap: 20 }}>
              {/* 左栏：动画预览 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                    {t('spine.title')}
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    {state.chromaColor ? t('spine.transparentFirst') : t('spine.normalFrame')} · {(frames[0]?.imageData?.width) || 0} × {(frames[0]?.imageData?.height) || 0}
                  </span>
                </div>

                <div className="option-card" style={{ padding: '10px 14px', minHeight: 'auto', marginBottom: 10 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{t('spine.currentAsset')}</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>{total} {t('common.frames')}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    {state.videoFile?.name} · {spineFps} FPS
                  </div>
                </div>

                <div style={{
                  maxHeight: 420, overflow: 'auto',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                  background: state.chromaColor
                    ? 'repeating-conic-gradient(#333 0% 25%, #444 0% 50%) 0 0 / 16px 16px'
                    : '#f5ead0',
                }}>
                  <canvas ref={setSpineCanvas} style={{ width: '100%', display: 'block' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
                    {t('export.frame').replace('{current}', spineFrameIdx + 1).replace('{total}', total)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    {((spineFrameIdx / Math.max(spineFps, 1))).toFixed(3)}s · {spineFps} {t('export.fpsPreview')}
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost" onClick={() => setSpinePlaying(p => !p)}>
                      {spinePlaying ? t('common.pause') : t('common.play')}
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setSpinePlaying(false); setSpineFrameIdx(0) }}>
                      {t('common.replay')}
                    </button>
                  </div>
                </div>
              </div>

              {/* 右栏：Spine 导出参数 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{t('spine.exportParams')}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{t('spine.jsonPngZip')}</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>
                  {t('spine.exportHint')}
                </p>

                <div className="grid-2col" style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('spine.skeletonName')}</label>
                    <input type="text" value={skeletonName}
                      onChange={e => setSkeletonName(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', height: 35 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('spine.animationName')}</label>
                    <input type="text" value={animationName}
                      onChange={e => setAnimationName(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', height: 35 }}
                    />
                  </div>
                </div>

                <div className="grid-2col" style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('spine.slotName')}</label>
                    <input type="text" value={slotName}
                      onChange={e => setSlotName(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', height: 35 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('spine.exportFps')}</label>
                    <NumStepper value={spineFps} min={1} max={60} onChange={setSpineFps} />
                  </div>
                </div>

                {/* 循环预览 */}
                <div className="option-card" style={{ padding: '0 14px', minHeight: 'auto', height: 42, cursor: 'pointer', marginBottom: 14 }}
                  onClick={() => setSpineLoop(l => !l)}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: '100%', cursor: 'pointer', margin: 0 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 0, flexShrink: 0,
                      border: spineLoop ? 'none' : '2px solid var(--border)',
                      background: spineLoop ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 12, lineHeight: 1,
                    }}>
                      {spineLoop && '✓'}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{t('spine.loopPreview')}</span>
                  </label>
                </div>

                {/* 导出按钮 */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn btn-primary"
                    onClick={exportSpine}
                    disabled={spineExporting || !total}
                  >
                    {spineExporting ? t('spine.exportingPct').replace('{pct}', spineProgress) : t('spine.dlSpineZip')}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => !spineExporting && setShowSpine(false)}
                  >
                    {t('common.cancel')}
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}
