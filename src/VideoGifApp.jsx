import { useState, useCallback, useRef, useEffect } from 'react'
import Panel from './components/Panel.jsx'
import NumStepper from './components/NumStepper.jsx'
import StepCropComponent from './components/StepCrop.jsx'
import { fmtTime, fmtSize, baseName, rgbToHex, hexToRgb } from './utils/format.js'
import { extractFrame } from './utils/frameExtract.js'
import { applyChroma } from './utils/chroma.js'
import { encodeGif } from './utils/gifEncoder.js'
import { useToast } from './components/Toast.jsx'
import ChromaParams from './components/ChromaParams.jsx'
import { useI18n } from './i18n/index.jsx'

// 尺寸预设列表
function getSizePresets(origW, origH) {
  if (!origW || !origH) return []
  const maxDim = Math.max(origW, origH)
  const result = [{ value: 'original', label: `${origW} × ${origH} (Original)`, w: origW, h: origH }]
  const fixedSizes = [640, 500, 480, 320, 256, 200, 160, 128, 80, 64]
  for (const s of fixedSizes) {
    if (s >= maxDim) continue
    const scale = s / maxDim
    const w = Math.round(origW * scale)
    const h = Math.round(origH * scale)
    result.push({ value: `${s}`, label: `${w} × ${h} (~${Math.round(scale * 100)}%)`, w, h })
  }
  const pcts = [{ label: '50%', pct: 0.5 }, { label: '33%', pct: 0.333 }, { label: '25%', pct: 0.25 }, { label: '20%', pct: 0.2 }]
  for (const p of pcts) {
    const w = Math.round(origW * p.pct)
    const h = Math.round(origH * p.pct)
    if (w < 16 || h < 16) continue
    result.push({ value: p.label, label: `${p.label} (${w} × ${h})`, w, h })
  }
  return result
}

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5×' },
  { value: 0.75, label: '0.75×' },
  { value: 1, label: '1×' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5×' },
  { value: 2, label: '2×' },
  { value: 3, label: '3×' },
]

const INITIAL = {
  videoFile: null, videoUrl: null,
  videoDuration: 0, videoWidth: 0, videoHeight: 0,
  cropRect: null,
  segStart: 0, segEnd: 0,
  fps: 12, speed: 1, sizePreset: 'original',
  chromaColor: null, tolerance: 28, smooth: 14, despill: true, edgeSmooth: true,
}

export default function VideoGifApp({ onBack }) {
  const { t } = useI18n()
  const [state, setState] = useState(INITIAL)
  const update = useCallback(patch => setState(s => ({ ...s, ...patch })), [])

  const step1Done = !!state.videoFile
  const step2Done = !!state.cropRect
  const step3Done = step2Done
  const step4Done = step2Done

  // 卸载时释放视频 ObjectURL（切回首页时触发）
  useEffect(() => () => { if (state.videoUrl) URL.revokeObjectURL(state.videoUrl) }, [state.videoUrl])

  // 裁剪变化时重置时间轴
  const [thumbsKey, setThumbsKey] = useState(0)
  const prevCropRef = useRef(state.cropRect)
  useEffect(() => {
    if (prevCropRef.current && prevCropRef.current !== state.cropRect) {
      setThumbsKey(k => k + 1)
    }
    prevCropRef.current = state.cropRect
  }, [state.cropRect])

  const sizePresets = getSizePresets(
    state.cropRect?.w || state.videoWidth,
    state.cropRect?.h || state.videoHeight
  )
  const selectedSize = sizePresets.find(p => p.value === state.sizePreset) || sizePresets[0]
  const outW = selectedSize?.w || state.cropRect?.w || state.videoWidth || 1
  const outH = selectedSize?.h || state.cropRect?.h || state.videoHeight || 1

  return (
    <div className="app">
      <header className="app-toolbar">
        {onBack && (
          <button className="btn btn-ghost" onClick={onBack}>
            <i className="ri-arrow-left-s-line" /> {t('common.home')}
          </button>
        )}
        <h1 className="toolbar-title">{t('tool03.title')}</h1>
        <span className="toolbar-badge">{t('common.free')}</span>
      </header>

      {/* Step 1: 上传视频 */}
      <StepUploadVideo state={state} update={update} step1Done={step1Done} />

      {/* Step 2: 裁剪画面 */}
      <StepCropVideo state={state} update={update} step1Done={step1Done} step2Done={step2Done} />

      {/* Step 3: 去背景（可选） */}
      <StepChroma state={state} update={update} step2Done={step2Done} />

      {/* Step 4: 参数设置 + 时间轴预览 */}
      <StepParamsPreview key={thumbsKey} state={state} update={update} step2Done={step2Done}
        outW={outW} outH={outH} sizePresets={sizePresets} />

      {/* Step 5: 生成 & 下载 */}
      <StepGenerate state={state} update={update} step2Done={step2Done} outW={outW} outH={outH} />
    </div>
  )
}

// ── Step 1: 上传视频 ──────────────────────────────────────────────────────────
function StepUploadVideo({ state, update, step1Done }) {
  const { t } = useI18n()
  const [drag, setDrag] = useState(false)

  function handleFile(f) {
    if (!f || !f.type.startsWith('video/')) { alert(t('upload.invalidVideoShort')); return }
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl)
    const url = URL.createObjectURL(f)
    setState_reset(update, f, url)
  }

  function onMetadata(e) {
    const v = e.target
    update({ videoDuration: v.duration, videoWidth: v.videoWidth, videoHeight: v.videoHeight, segStart: 0, segEnd: v.duration })
  }

  return (
    <Panel stepNum={1} title={t('gif.stepUpload')} done={step1Done} defaultOpen={true}
      metaText={step1Done ? state.videoFile.name : ''}>
      {!step1Done ? (
        <>
          <div className={`dropzone ${drag ? 'drag' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => document.getElementById('gif3-input').click()}
            role="button" tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && document.getElementById('gif3-input').click()}
          >
            <input id="gif3-input" type="file" accept="video/*"
              onChange={e => handleFile(e.target.files[0])} style={{ display: 'none' }} />
            <div className="dropzone-icon"><i className="ri-film-line" /></div>
            <div className="dropzone-text"><strong>{t('gif.dropVideo')}</strong>{t('upload.orClick')}</div>
          </div>
          <p className="upload-hint">{t('gif.hint')}</p>
        </>
      ) : (
        <div className="video-preview-card">
          <video src={state.videoUrl} controls muted onLoadedMetadata={onMetadata}
            style={{ width: 200, flexShrink: 0 }} />
          <div className="video-info">
            <h3>{state.videoFile.name}</h3>
            <div className="video-info-row">
              <div className="video-info-item">{t('common.duration')} <span>{fmtTime(state.videoDuration)}</span></div>
              <div className="video-info-item">{t('common.resolution')} <span>{state.videoWidth}×{state.videoHeight}</span></div>
              <div className="video-info-item">{t('common.size')} <span>{fmtSize(state.videoFile.size)}</span></div>
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 10 }}
              onClick={() => { URL.revokeObjectURL(state.videoUrl); setState_reset(update, null, null) }}>
              {t('common.reselect')}
            </button>
          </div>
        </div>
      )}
    </Panel>
  )
}

function setState_reset(update, file, url) {
  update({
    videoFile: file, videoUrl: url,
    videoDuration: 0, videoWidth: 0, videoHeight: 0,
    cropRect: null, segStart: 0, segEnd: 0,
    chromaColor: null,
  })
}

// ── Step 2: 裁剪画面（复用 StepCrop 组件）──────────────────────────────────────
function StepCropVideo({ state, update, step1Done, step2Done }) {
  return (
    <StepCropComponent
      stepNum={2}
      done={step2Done}
      locked={!step1Done}
      state={state}
      update={update}
    />
  )
}

// ── Step 3: 去背景（可选，复用工具1的取色+预览逻辑）──────────────────────────
function StepChroma({ state, update, step2Done }) {
  const { t } = useI18n()
  const [origCanvas, setOrigCanvas] = useState(null)
  const [previewCanvas, setPreviewCanvas] = useState(null)
  const [previewMode, setPreviewMode] = useState('result')
  const [solidBgColor, setSolidBgColor] = useState('#2e70ff')

  const crop = state.cropRect
  const outW = crop?.w || state.videoWidth || 1
  const outH = crop?.h || state.videoHeight || 1

  // 从视频截取参考帧
  useEffect(() => {
    if (!state.videoUrl || !step2Done) return
    let alive = true
    const video = document.createElement('video')
    video.src = state.videoUrl; video.muted = true
    video.addEventListener('loadeddata', () => {
      if (!alive) return
      video.currentTime = Math.max(0.001, state.segStart || 0)
    })
    video.addEventListener('seeked', () => {
      if (!alive) return
      const c = document.createElement('canvas')
      c.width = outW; c.height = outH
      const ctx = c.getContext('2d')
      if (crop) ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH)
      else ctx.drawImage(video, 0, 0, outW, outH)
      update({ refFrame: ctx.getImageData(0, 0, outW, outH) })
    }, { once: true })
    return () => { alive = false; video.src = ''; video.load() }
  }, [state.videoUrl, state.cropRect, step2Done])

  // 绘制原图
  if (origCanvas && state.refFrame) {
    origCanvas.width = state.refFrame.width
    origCanvas.height = state.refFrame.height
    origCanvas.getContext('2d').putImageData(state.refFrame, 0, 0)
  }

  // 绘制预览
  if (previewCanvas && state.refFrame) {
    const { width: w, height: h, data } = state.refFrame
    previewCanvas.width = w; previewCanvas.height = h
    const ctx = previewCanvas.getContext('2d')
    if (!state.chromaColor) {
      ctx.putImageData(state.refFrame, 0, 0)
    } else {
      const copy = new ImageData(new Uint8ClampedArray(data), w, h)
      applyChroma(copy, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth)
      if (previewMode === 'alpha') {
        const a = new ImageData(w, h)
        for (let i = 0; i < copy.data.length; i += 4) {
          const v = copy.data[i + 3]; a.data[i] = a.data[i+1] = a.data[i+2] = v; a.data[i+3] = 255
        }
        ctx.putImageData(a, 0, 0)
      } else if (previewMode === 'solid') {
        ctx.fillStyle = solidBgColor; ctx.fillRect(0, 0, w, h)
        const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h
        tmp.getContext('2d').putImageData(copy, 0, 0); ctx.drawImage(tmp, 0, 0)
      } else {
        ctx.clearRect(0, 0, w, h); ctx.putImageData(copy, 0, 0)
      }
    }
  }

  function pickColor(e) {
    if (!state.refFrame || !origCanvas) return
    const rect = origCanvas.getBoundingClientRect()
    const sx = Math.round((e.clientX - rect.left) / rect.width * origCanvas.width)
    const sy = Math.round((e.clientY - rect.top) / rect.height * origCanvas.height)
    const px = origCanvas.getContext('2d').getImageData(sx, sy, 1, 1).data
    update({ chromaColor: rgbToHex(px[0], px[1], px[2]) })
  }

  const hasColor = !!state.chromaColor

  return (
    <Panel stepNum={3} title={t('gif.stepChroma')} done={hasColor} locked={!step2Done} defaultOpen={false}
      metaText={hasColor ? state.chromaColor : t('gif.skipable')}>

      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        {t('gif.chromaHint')}
      </p>

      {state.refFrame && (
        <div className="grid-2col" style={{ display: 'grid', gap: 14 }}>
          {/* 左：原图取色 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{t('gif.refFrame')}</span>
                <div style={{ fontSize: '0.72rem', color: 'var(--accent)', marginTop: 2 }}>
                  {hasColor ? t('gif.colorPicked') : t('gif.clickOptional')}
                </div>
              </div>
              {hasColor && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 35, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div style={{ width: 14, height: 14, background: state.chromaColor, border: '1px solid var(--border)' }} />
                    <span className="chroma-rgb-text" style={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace' }}>
                      {(() => { const rgb = hexToRgb(state.chromaColor); return `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})` })()}
                    </span>
                  </div>
                  <button className="btn btn-ghost" onClick={() => update({ chromaColor: null })}>{t('common.clear')}</button>
                </div>
              )}
            </div>
            <div style={{ position: 'relative', border: '1px solid var(--border)', background: '#000' }}>
              <canvas ref={setOrigCanvas} onClick={pickColor} style={{ width: '100%', display: 'block', cursor: 'crosshair' }} />
              {!hasColor && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', pointerEvents: 'none' }}>
                  <div style={{ background: 'rgba(255,255,255,0.92)', padding: '14px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#2d1b00' }}>{t('gif.clickBgColor')}</div>
                    <div style={{ fontSize: '0.72rem', color: '#7a5c30', marginTop: 4 }}>{t('gif.skipExportNormal')}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右：预览 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{t('gif.effectPreview')}</span>
              <div className="segmented-control" style={{ height: 35 }}>
                {[{ key: 'result', label: t('gif.modeResult') }, { key: 'alpha', label: t('gif.modeAlpha') }, { key: 'solid', label: t('gif.modeSolid') }].map(m => (
                  <button key={m.key} className={`segmented-btn ${previewMode === m.key ? 'active' : ''}`}
                    onClick={() => setPreviewMode(m.key)} style={{ fontSize: '0.75rem', padding: '0 12px' }}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{
              border: '1px solid var(--border)',
              background: previewMode === 'result' ? 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 12px 12px' : '#000'
            }}>
              <canvas ref={setPreviewCanvas} style={{ width: '100%', display: 'block' }} />
            </div>
            {previewMode === 'solid' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{t('gif.checkColor')}</span>
                <label style={{ position: 'relative', width: 18, height: 18, display: 'inline-block', cursor: 'pointer' }}>
                  <div style={{ width: 18, height: 18, background: solidBgColor, border: '1px solid var(--border)' }} />
                  <input type="color" value={solidBgColor} onChange={e => setSolidBgColor(e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 参数（有色键时显示） */}
      {hasColor && (
        <ChromaParams
          tolerance={state.tolerance} smooth={state.smooth} despill={state.despill} edgeSmooth={state.edgeSmooth}
          title={t('chroma.advancedTitle')} hint={t('chroma.advancedHint')}
          onChange={update}
        />
      )}
    </Panel>
  )
}

// ── Step 4: 参数设置 + 时间轴预览（重写）────────────────────────────────────────
function StepParamsPreview({ state, update, step2Done, outW, outH, sizePresets }) {
  const { t } = useI18n()
  const [previewCanvas, setPreviewCanvas] = useState(null)
  const [scrubTime, setScrubTime] = useState(null)
  const [playing, setPlaying] = useState(false)
  const playRef = useRef(null)

  const dur = state.videoDuration || 1
  const start = state.segStart || 0
  const end = state.segEnd || dur
  const segLen = end - start
  const fps = state.fps || 12
  const estimatedFrames = Math.max(1, Math.round(segLen * fps))
  const currentTime = scrubTime ?? start

  // 片段范围变化时重置 scrubTime
  useEffect(() => {
    setScrubTime(start)
    setPlaying(false)
  }, [state.segStart, state.segEnd, state.cropRect])

  // 播放：按 fps × speed 推进 scrubTime
  useEffect(() => {
    if (!playing) return
    const interval = 1000 / Math.max(1, fps * (state.speed || 1))
    playRef.current = setInterval(() => {
      setScrubTime(t => {
        const next = (t ?? start) + segLen / Math.max(estimatedFrames - 1, 1)
        if (next > end) { setPlaying(false); return start }
        return next
      })
    }, interval)
    return () => clearInterval(playRef.current)
  }, [playing, fps, state.speed, start, end, segLen, estimatedFrames])

  // scrubTime 变化 → 更新大图预览
  useEffect(() => {
    if (!previewCanvas || !state.videoUrl || !step2Done) return
    let alive = true
    const video = document.createElement('video')
    video.src = state.videoUrl; video.muted = true
    video.addEventListener('loadeddata', () => { if (alive) video.currentTime = Math.max(0.001, currentTime) })
    video.addEventListener('seeked', () => {
      if (!alive) return
      const crop = state.cropRect
      // 直接用输出尺寸渲染，CSS maxWidth/maxHeight 会自动 contain
      const c = document.createElement('canvas'); c.width = outW; c.height = outH
      const ctx = c.getContext('2d')
      if (crop) ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH)
      else ctx.drawImage(video, 0, 0, outW, outH)
      const id = ctx.getImageData(0, 0, outW, outH)
      if (state.chromaColor) applyChroma(id, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth)
      previewCanvas.width = outW; previewCanvas.height = outH
      previewCanvas.getContext('2d').putImageData(id, 0, 0)
    }, { once: true })
    return () => { alive = false; video.src = ''; video.load() }
  }, [previewCanvas, currentTime, state.chromaColor, state.tolerance, state.smooth, state.despill, step2Done])

  return (
    <Panel stepNum={4} title={t('gif.stepParams')} done={false} locked={!step2Done} defaultOpen={true}
      metaText={step2Done ? `${estimatedFrames} ${t('common.frames')} · ${outW}×${outH}` : ''}>

      <div className="grid-2col" style={{ display: 'grid', gap: 16, alignItems: 'start' }}>

        {/* ── 左栏：预览 ── */}
        <div>
          {/* 预览区：固定方形背景，图片按比例居中（contain 效果） */}
          <div style={{
            background: state.chromaColor
              ? 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 12px 12px'
              : 'var(--surface2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            aspectRatio: '1 / 1', overflow: 'hidden', position: 'relative',
          }}>
            <canvas ref={setPreviewCanvas} style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }} />
            {/* 时间戳 */}
            <div style={{
              position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(30,20,5,0.75)', color: '#fff',
              padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontFamily: 'monospace',
              pointerEvents: 'none',
            }}>
              {String(Math.floor(currentTime / 60)).padStart(2,'0')}:{(currentTime % 60).toFixed(2).padStart(5,'0')}
            </div>
          </div>

          {/* 播放控制 + 滑块 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <button
              onClick={() => setPlaying(p => !p)}
              className="btn btn-ghost"
              style={{ flexShrink: 0, width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={playing ? 'ri-pause-fill' : 'ri-play-fill'} style={{ fontSize: '1rem' }} />
            </button>
            <input
              type="range"
              min={start} max={end} step={0.05}
              value={currentTime}
              onChange={e => { setScrubTime(parseFloat(e.target.value)); setPlaying(false) }}
              style={{ flex: 1 }}
            />
          </div>
        </div>

        {/* ── 右栏：参数 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 片段范围 */}
          <div className="option-card">
            <label>{t('gif.segRange')}</label>
            <div style={{ padding: '0 8px', marginTop: 6 }}>
              <div className="range-dual" style={{ position: 'relative', height: 28 }}>
                <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 0, right: 0, height: 4, background: 'var(--border)' }} />
                <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: `${(start / dur) * 100}%`, width: `${(segLen / dur) * 100}%`, height: 4, background: 'var(--accent)' }} />
                <input type="range" min={0} max={dur} step={0.1} value={start}
                  onChange={e => update({ segStart: Math.min(parseFloat(e.target.value), end - 0.1) })} />
                <input type="range" min={0} max={dur} step={0.1} value={end}
                  onChange={e => update({ segEnd: Math.max(parseFloat(e.target.value), start + 0.1) })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                <span>{t('gif.segStart')} <strong>{fmtTime(start)}</strong></span>
                <span>{t('gif.segDuration')} <strong>{fmtTime(segLen)}</strong></span>
                <span>{t('gif.segEnd')} <strong>{fmtTime(end)}</strong></span>
              </div>
            </div>
          </div>

          {/* FPS + 预估（一行两列） */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="option-card">
              <label>{t('gif.fps')}</label>
              <NumStepper value={fps} min={1} max={30} onChange={v => update({ fps: v })} />
            </div>
            <div className="option-card option-card--metric">
              <label>{t('gif.estimated')}</label>
              <div className="metric-value">{estimatedFrames} {t('common.frames')}</div>
              <div className="metric-sub">{outW} × {outH} px</div>
            </div>
          </div>

          {/* 速度 */}
          <div className="option-card">
            <label>{t('gif.speed')}</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {SPEED_OPTIONS.map(s => (
                <button key={s.value}
                  className={`btn ${state.speed === s.value ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ height: 28, padding: '0 10px', fontSize: '0.8rem' }}
                  onClick={() => update({ speed: s.value })}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 尺寸 */}
          <div className="option-card">
            <label>{t('gif.outputSize')}</label>
            <div style={{ position: 'relative', marginTop: 6 }}>
              <select value={state.sizePreset} onChange={e => update({ sizePreset: e.target.value })}
                style={{
                  WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
                  width: '100%', height: 36, padding: '0 32px 0 10px',
                  boxSizing: 'border-box', cursor: 'pointer',
                }}>
                {sizePresets.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <i className="ri-arrow-down-s-line" style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                pointerEvents: 'none', color: 'var(--text-muted)', fontSize: '1rem',
              }} />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

// ── Step 5: 生成 GIF & 下载 ───────────────────────────────────────────────────
function StepGenerate({ state, update, step2Done, outW, outH }) {
  const { t } = useI18n()
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [gifUrl, setGifUrl] = useState(null)
  const [gifSize, setGifSize] = useState(0)
  const cancelRef = useRef(false)
  const toast = useToast()

  const start = state.segStart || 0
  const end = state.segEnd || state.videoDuration || 0
  const segLen = end - start
  const fps = state.fps || 12
  const estimatedFrames = Math.max(1, Math.round(segLen * fps))

  // gifUrl 变化或组件卸载时释放旧的 ObjectURL
  useEffect(() => {
    return () => { if (gifUrl) URL.revokeObjectURL(gifUrl) }
  }, [gifUrl])

  // 参数变化时清除已生成的 GIF
  useEffect(() => { setGifUrl(null) },
    [state.segStart, state.segEnd, state.fps, state.speed, state.sizePreset,
     state.chromaColor, state.tolerance, state.smooth, state.despill, state.cropRect])

  async function generate() {
    if (!state.videoUrl) return
    setGenerating(true); setProgress(0); setProgressMsg(t('common.preparing')); setGifUrl(null)
    cancelRef.current = false

    let video = null
    try {
      video = document.createElement('video')
      video.src = state.videoUrl; video.muted = true; video.preload = 'auto'
      await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = rej; video.load() })

      const total = estimatedFrames
      const times = Array.from({ length: total }, (_, i) =>
        start + (i / Math.max(total - 1, 1)) * segLen
      )
      if (total === 1) times[0] = start

      const frames = []
      for (let i = 0; i < total; i++) {
        if (cancelRef.current) break
        setProgress(Math.round((i / total) * 75))
        setProgressMsg(t('gif.extractFrame').replace('{current}', i + 1).replace('{total}', total))
        try {
          const { imageData } = await extractFrame(video, times[i], state.cropRect, outW, outH)
          if (state.chromaColor) applyChroma(imageData, state.chromaColor, state.tolerance, state.smooth, state.despill, state.edgeSmooth)
          frames.push(imageData)
        } catch (e) { console.error('帧提取失败', i, e) }
      }

      if (cancelRef.current) { setProgressMsg(t('common.cancelled')); setGenerating(false); return }

      setProgress(80); setProgressMsg(t('gif.encoding'))
      const effectiveFps = fps * (state.speed || 1)
      const gifBytes = encodeGif(frames, outW, outH, effectiveFps)

      setProgress(100); setProgressMsg(t('common.done'))
      const blob = new Blob([gifBytes], { type: 'image/gif' })
      setGifUrl(URL.createObjectURL(blob))
      setGifSize(blob.size)
    } catch (e) {
      toast.error(t('gif.genFailed') + e.message)
    } finally {
      if (video) { video.src = ''; video.load() }
      setGenerating(false)
    }
  }

  function download() {
    if (!gifUrl) return
    const a = document.createElement('a')
    a.href = gifUrl
    a.download = `${baseName(state.videoFile?.name || 'animation')}.gif`
    a.click()
    toast.success(t('gif.gifDl'))
  }

  return (
    <Panel stepNum={5} title={t('gif.stepGenerate')} done={!!gifUrl} locked={!step2Done} defaultOpen={false}
      metaText={gifUrl ? fmtSize(gifSize) : ''}>

      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        {t('gif.genHint')}
      </p>

      {/* 生成按钮 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={generate} disabled={generating || !step2Done}>
          {generating ? t('gif.generatingPct').replace('{pct}', progress) : (gifUrl ? t('gif.btnRegenerate') : t('gif.btnGenerate'))}
        </button>
        {generating && (
          <button className="btn btn-ghost" onClick={() => { cancelRef.current = true }}>{t('common.cancel')}</button>
        )}
      </div>

      {/* 进度条 */}
      {generating && (
        <div className="progress-wrap" style={{ marginTop: 10 }}>
          <div className="progress-label">
            <span>{progressMsg}</span><span>{progress}%</span>
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: progress + '%' }} />
          </div>
        </div>
      )}

      {/* GIF 预览 + 下载 */}
      {gifUrl && !generating && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            display: 'inline-block', marginBottom: 12,
            border: '1px solid var(--border)',
            background: state.chromaColor
              ? 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 12px 12px'
              : '#f5ead0',
          }}>
            <img src={gifUrl} alt="GIF preview" style={{ display: 'block', maxWidth: '100%', maxHeight: 360 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-primary" onClick={download}>
              <i className="ri-download-line" /> {t('gif.dlGif')}
            </button>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{fmtSize(gifSize)}</span>
          </div>
        </div>
      )}

    </Panel>
  )
}
