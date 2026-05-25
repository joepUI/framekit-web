import { useRef, useState, useEffect } from 'react'
import Panel from './Panel.jsx'
import { fmtTime, rgbToHex, hexToRgb } from '../utils/format.js'
import { buildSheet, extractFrame } from '../utils/frameExtract.js'
import { applyChroma } from '../utils/chroma.js'
import { useToast } from './Toast.jsx'
import ChromaParams from './ChromaParams.jsx'
import { useI18n } from '../i18n/index.jsx'

export default function StepRefPreview({ stepNum, done, locked, state, update }) {
  const [origCanvas, setOrigCanvas] = useState(null)
  const [previewCanvas, setPreviewCanvas] = useState(null)
  const [previewMode, setPreviewMode] = useState('result')
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState(0)
  const [genMsg, setGenMsg] = useState('')
  const [clickPos, setClickPos] = useState(null)
  const [solidBgColor, setSolidBgColor] = useState('#2e70ff')
  const cancelRef = useRef(false)
  const toast = useToast()
  const { t } = useI18n()

  const segStart = state.segStart ?? 0
  const segEnd = state.segEnd ?? state.videoDuration
  const refTime = state.refFrameTime ?? segStart

  // 实时从视频截取参考帧
  useEffect(() => {
    if (!state.videoUrl || locked) return
    const crop = state.cropRect
    const outW = crop?.w || state.videoWidth || 1
    const outH = crop?.h || state.videoHeight || 1

    let alive = true
    const video = document.createElement('video')
    video.src = state.videoUrl
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    function onSeeked() {
      if (!alive) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = outW
        canvas.height = outH
        const ctx = canvas.getContext('2d')
        if (crop) {
          ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH)
        } else {
          ctx.drawImage(video, 0, 0, outW, outH)
        }
        const imageData = ctx.getImageData(0, 0, outW, outH)
        if (alive) update({ refFrame: imageData })
      } catch (e) { /* ignore */ }
    }

    video.addEventListener('seeked', onSeeked)
    video.addEventListener('loadeddata', () => {
      if (alive) video.currentTime = Math.max(0.001, refTime)
    })

    return () => { alive = false; video.removeEventListener('seeked', onSeeked) }
  }, [state.videoUrl, state.cropRect, refTime, locked])

  // 绘制原图（左侧）
  useEffect(() => {
    if (!state.refFrame || !origCanvas) return
    const c = origCanvas
    c.width = state.refFrame.width
    c.height = state.refFrame.height
    c.getContext('2d').putImageData(state.refFrame, 0, 0)
  }, [state.refFrame, origCanvas])

  // 绘制抠像预览（右侧）
  useEffect(() => {
    if (!state.refFrame || !previewCanvas) return
    const c = previewCanvas
    const w = state.refFrame.width
    const h = state.refFrame.height
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')

    if (!state.chromaColor) {
      ctx.putImageData(state.refFrame, 0, 0)
      return
    }

    const copy = new ImageData(new Uint8ClampedArray(state.refFrame.data), w, h)
    applyChroma(copy, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth)

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
  }, [state.refFrame, state.chromaColor, state.tolerance, state.smooth, state.despill, previewMode, previewCanvas, solidBgColor])

  // 点击取色
  function pickColor(e) {
    if (!state.refFrame || !origCanvas) return
    const canvas = origCanvas
    const rect = canvas.getBoundingClientRect()
    const sx = Math.round((e.clientX - rect.left) / rect.width * canvas.width)
    const sy = Math.round((e.clientY - rect.top) / rect.height * canvas.height)
    const px = canvas.getContext('2d').getImageData(sx, sy, 1, 1).data
    const hex = rgbToHex(px[0], px[1], px[2])
    update({ chromaColor: hex, chromaEnabled: true })
    setClickPos({ x: sx, y: sy })
  }

  // 生成序列图：用当前裁剪 + 步骤3参数，从视频重新抽帧再拼图
  async function generate() {
    if (!state.videoUrl) return
    setGenerating(true)
    setGenProgress(0)
    setGenMsg(t('ref.extractingFrames'))
    cancelRef.current = false

    try {
      const video = document.createElement('video')
      video.src = state.videoUrl
      video.muted = true
      video.preload = 'auto'
      await new Promise((res, rej) => {
        video.onloadeddata = res
        video.onerror = rej
        video.load()
      })

      const crop = state.cropRect
      const frameW = crop?.w || state.videoWidth
      const frameH = crop?.h || state.videoHeight
      const fps = state.fps || 8
      const start = state.segStart ?? 0
      const end = state.segEnd ?? state.videoDuration
      const segLen = end - start
      const total = Math.max(1, Math.round(segLen * fps))
      const times = Array.from({ length: total }, (_, i) =>
        start + (i / Math.max(total - 1, 1)) * segLen
      )
      if (total === 1) times[0] = start

      const cols = state.exportCols || 4
      const gap = state.exportGap || 0
      const rows = Math.ceil(total / cols)

      // 逐帧抽取
      const frames = []
      for (let i = 0; i < total; i++) {
        if (cancelRef.current) break
        setGenProgress(Math.round(((i + 1) / total) * 70))
        setGenMsg(t('ref.extractingFrame').replace('{current}', i + 1).replace('{total}', total))
        try {
          const { imageData } = await extractFrame(video, times[i], crop, frameW, frameH)
          frames.push({ imageData, time: times[i] })
        } catch (e) {
          console.error('帧提取失败:', i, e)
        }
      }

      if (cancelRef.current) { setGenerating(false); setGenMsg(''); return }

      // 更新 frames 到 state
      update({ frames, refFrame: frames[0]?.imageData || null })

      setGenMsg(t('ref.stitching'))
      setGenProgress(80)
      const processedFrames = frames.map(f => ({
        imageData: new ImageData(new Uint8ClampedArray(f.imageData.data), f.imageData.width, f.imageData.height)
      }))
      const sheetCanvas = buildSheet(processedFrames, rows, cols, frameW, frameH, false, gap)

      let sheetAlphaCanvas = null
      if (state.chromaColor) {
        setGenMsg(t('ref.processingAlpha'))
        setGenProgress(90)
        const alphaFrames = frames.map(f => {
          const copy = new ImageData(new Uint8ClampedArray(f.imageData.data), f.imageData.width, f.imageData.height)
          applyChroma(copy, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth)
          return { imageData: copy }
        })
        sheetAlphaCanvas = buildSheet(alphaFrames, rows, cols, frameW, frameH, true, gap)
      }

      setGenProgress(100)
      setGenMsg(t('ref.genDone'))
      update({ sheetCanvas, sheetAlphaCanvas })
    } catch (e) {
      toast.error(t('ref.genFailed') + e.message)
      setGenMsg('')
    } finally {
      setGenerating(false)
    }
  }

  const hasColor = !!state.chromaColor

  return (
    <Panel
      stepNum={stepNum}
      title={t('step.refPreview')}
      done={done}
      locked={locked}
      defaultOpen={!locked}
      metaText={done ? t('ref.generated') : (hasColor ? `${t('ref.samplePoint')} ${state.chromaColor}` : '')}
    >
      {/* 步骤说明 */}
      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        {t('ref.hint')}
      </p>

      {/* 参考帧时间 */}
      <div className="option-card" style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('ref.timeLabel')}</label>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>{fmtTime(refTime)}</span>
          </div>
          <input
            type="range" min={segStart} max={segEnd} step={0.01}
            value={refTime}
            onChange={e => update({ refFrameTime: parseFloat(e.target.value) })}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4, textAlign: 'right' }}>
            {fmtTime(segStart)} - {fmtTime(segEnd)} {t('ref.rangeHint')}
          </div>
        </div>
      </div>

      {/* 预览区域 */}
      {state.refFrame && (
        <div>
          {/* 左右双栏 */}
          <div className="grid-2col" style={{ display: 'grid', gap: 14 }}>
            {/* 左栏：原图 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{t('ref.original')}</span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--accent)', marginTop: 2 }}>
                    {hasColor ? t('ref.colorPicked') : t('ref.clickSample')}
                  </div>
                </div>
                {hasColor && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '0 10px', height: 35,
                      background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: 0, flexShrink: 0,
                        background: state.chromaColor, border: '1px solid var(--border)',
                      }} />
                      <span className="chroma-rgb-text" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>
                        {(() => { const rgb = hexToRgb(state.chromaColor); return `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})` })()}
                      </span>
                    </div>
                    <button className="btn btn-ghost"
                      onClick={() => { update({ chromaColor: null, chromaEnabled: false, sheetAlphaCanvas: null }); setClickPos(null) }}
                    >
                      {t('common.clear')}
                    </button>
                  </div>
                )}
              </div>
              <div style={{
                position: 'relative',
                borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                border: '1px solid var(--border)', background: '#000',
              }}>
                <canvas
                  ref={setOrigCanvas}
                  onClick={pickColor}
                  style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
                />
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
                      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#2d1b00' }}>{t('ref.clickBgColor')}</div>
                      <div style={{ fontSize: '0.72rem', color: '#7a5c30', marginTop: 4 }}>
                        {t('ref.skipHint')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {clickPos && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 6 }}>
                  {t('ref.samplePoint')}: ({clickPos.x}, {clickPos.y})
                </div>
              )}
            </div>

            {/* 右栏：抠图预览 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{t('ref.mattePreview')}</span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--accent)', marginTop: 2 }}>{t('ref.matteHint')}</div>
                </div>
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
                borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                border: '1px solid var(--border)',
                background: previewMode === 'result'
                  ? 'repeating-conic-gradient(#333 0% 25%, #444 0% 50%) 0 0 / 12px 12px'
                  : '#000',
              }}>
                <canvas ref={setPreviewCanvas} style={{ width: '100%', display: 'block' }} />
              </div>
              {previewMode === 'solid' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{t('ref.checkColor')}</span>
                  <label style={{ position: 'relative', display: 'inline-block', width: 18, height: 18, cursor: 'pointer' }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 0,
                      background: solidBgColor, border: '1px solid var(--border)',
                    }} />
                    <input type="color" value={solidBgColor}
                      onChange={e => setSolidBgColor(e.target.value)}
                      style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                    />
                  </label>
                  <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text)' }}>
                    {solidBgColor.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {hasColor && (
        <ChromaParams
          tolerance={state.tolerance} smooth={state.smooth}
          despill={state.despill} edgeSmooth={state.edgeSmooth}
          onChange={update}
          title={t('chroma.advancedTitle')} hint={t('chroma.advancedHint')}
        />
      )}

      {/* 生成进度 */}
      {generating && (
        <div className="progress-wrap" style={{ marginTop: 14 }}>
          <div className="progress-label">
            <span>{genMsg}</span>
            <span>{genProgress}%</span>
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: genProgress + '%' }} />
          </div>
        </div>
      )}

      {/* 生成按钮 */}
      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={generate}
          disabled={generating || !state.videoUrl}
        >
          {generating ? t('common.generating') : t('ref.genSheet')}
        </button>
        {generating && (
          <button className="btn btn-ghost" onClick={() => { cancelRef.current = true }}>
            {t('common.cancel')}
          </button>
        )}
      </div>

      {done && !generating && (
        <div className="status-msg success" style={{ marginTop: 10 }}>
          {hasColor ? t('ref.alphaGenerated') : t('ref.normalGenerated')}{t('ref.continueHint')}
        </div>
      )}
    </Panel>
  )
}
