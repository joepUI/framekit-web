import { useRef, useState, useEffect } from 'react'
import Panel from './Panel.jsx'
import NumStepper from './NumStepper.jsx'
import { useI18n } from '../i18n/index.jsx'

const PREVIEW_W = 420
const PREVIEW_MAX_H = 320

export default function StepCrop({ stepNum, done, locked, state, update }) {
  const { t } = useI18n()
  const [canvasEl, setCanvasEl] = useState(null)
  const [previewEl, setPreviewEl] = useState(null)
  const frameRef = useRef(null) // 离屏首帧（原始分辨率）
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState(null)
  const [scale, setScale] = useState(1)
  const [ready, setReady] = useState(false)
  // 4 个百分比输入的草稿值（focus 期间用）
  const [draft, setDraft] = useState({ left: null, top: null, width: null, height: null })

  const vw = state.videoWidth || 1
  const vh = state.videoHeight || 1

  // 视频切换时清除缓存的离屏帧，确保重新加载
  useEffect(() => {
    frameRef.current = null
    setReady(false)
  }, [state.videoUrl])

  // 加载视频首帧 → 离屏帧 + 左侧画布
  useEffect(() => {
    if (!state.videoUrl || locked || !canvasEl) return
    setReady(false)

    // 已有离屏帧（之前展开过），直接重绘左侧画布
    if (frameRef.current) {
      const off = frameRef.current
      const s = Math.min(PREVIEW_W / off.width, PREVIEW_MAX_H / off.height, 1)
      const cw = Math.round(off.width * s), ch = Math.round(off.height * s)
      canvasEl.width = cw
      canvasEl.height = ch
      canvasEl.getContext('2d').drawImage(off, 0, 0, cw, ch)
      setScale(s)
      setReady(true)
      return
    }

    const video = document.createElement('video')
    video.src = state.videoUrl
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    let alive = true

    function draw() {
      if (!alive) return
      const videoW = video.videoWidth, videoH = video.videoHeight
      if (!videoW || !videoH) return

      // 缓存原始分辨率的首帧到离屏 canvas
      const off = document.createElement('canvas')
      off.width = videoW
      off.height = videoH
      off.getContext('2d').drawImage(video, 0, 0)
      frameRef.current = off

      // 左侧画布按预览尺寸缩放显示
      const s = Math.min(PREVIEW_W / videoW, PREVIEW_MAX_H / videoH, 1)
      const cw = Math.round(videoW * s), ch = Math.round(videoH * s)
      canvasEl.width = cw
      canvasEl.height = ch
      canvasEl.getContext('2d').drawImage(off, 0, 0, cw, ch)
      setScale(s)
      setReady(true)

      // 默认初始化为整画面裁剪
      if (!state.cropRect) {
        update({ cropRect: { x: 0, y: 0, w: videoW, h: videoH } })
      }
    }

    video.addEventListener('loadeddata', () => {
      video.currentTime = Math.min(0.05, (video.duration || 1) - 0.01)
    })
    video.addEventListener('seeked', draw)

    return () => {
      alive = false
      video.removeEventListener('seeked', draw)
    }
  }, [state.videoUrl, locked, canvasEl])

  // 左：重绘原画面 + 外部浅色蒙版 + 橙色裁剪框 + 九宫格
  useEffect(() => {
    if (!ready || !canvasEl || !state.cropRect || !frameRef.current) return
    const c = canvasEl
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(frameRef.current, 0, 0, c.width, c.height)

    const cr = state.cropRect
    const sx = cr.x * scale, sy = cr.y * scale
    const sw = cr.w * scale, sh = cr.h * scale

    // 裁剪框外的区域加一层浅色蒙版（保留可见但视觉降权）
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    // 上
    ctx.fillRect(0, 0, c.width, sy)
    // 下
    ctx.fillRect(0, sy + sh, c.width, c.height - (sy + sh))
    // 左
    ctx.fillRect(0, sy, sx, sh)
    // 右
    ctx.fillRect(sx + sw, sy, c.width - (sx + sw), sh)

    // 边框
    ctx.strokeStyle = '#e8911a'
    ctx.lineWidth = 2
    ctx.strokeRect(sx, sy, sw, sh)

    // 九宫格虚线
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(232,145,26,0.85)'
    ctx.lineWidth = 1
    for (let i = 1; i <= 2; i++) {
      const ly = sy + (sh / 3) * i
      ctx.beginPath()
      ctx.moveTo(sx, ly)
      ctx.lineTo(sx + sw, ly)
      ctx.stroke()
      const lx = sx + (sw / 3) * i
      ctx.beginPath()
      ctx.moveTo(lx, sy)
      ctx.lineTo(lx, sy + sh)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }, [ready, state.cropRect, scale, canvasEl])

  // 右：在与左侧等大的画板上居中显示裁剪结果（letterbox / pillarbox）
  useEffect(() => {
    if (!ready || !previewEl || !state.cropRect || !frameRef.current) return
    const cr = state.cropRect
    if (cr.w < 2 || cr.h < 2) return
    const c = previewEl
    const off = frameRef.current
    // 右侧画布跟左侧一样大
    const s = Math.min(PREVIEW_W / off.width, PREVIEW_MAX_H / off.height, 1)
    const cw = Math.round(off.width * s)
    const ch = Math.round(off.height * s)
    c.width = cw
    c.height = ch
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, cw, ch)

    // contain 适配：把裁剪区域缩放到画布内居中
    const ratio = Math.min(cw / cr.w, ch / cr.h)
    const dw = Math.round(cr.w * ratio)
    const dh = Math.round(cr.h * ratio)
    const dx = Math.round((cw - dw) / 2)
    const dy = Math.round((ch - dh) / 2)
    ctx.drawImage(off, cr.x, cr.y, cr.w, cr.h, dx, dy, dw, dh)
  }, [ready, state.cropRect, previewEl])

  // 鼠标框选
  function getPos(e) {
    const c = canvasEl
    if (!c) return { x: 0, y: 0 }
    const rect = c.getBoundingClientRect()
    const sx = c.width / rect.width
    const sy = c.height / rect.height
    return {
      x: Math.max(0, Math.min((e.clientX - rect.left) * sx, c.width)),
      y: Math.max(0, Math.min((e.clientY - rect.top) * sy, c.height)),
    }
  }
  function onMouseDown(e) {
    e.preventDefault()
    const pos = getPos(e)
    setSel({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y })
    setSelecting(true)
  }
  function onMouseMove(e) {
    if (!selecting) return
    const pos = getPos(e)
    if (e.shiftKey) {
      // Shift 按住时强制 1:1 正方形裁剪
      const dx = pos.x - sel.x0
      const dy = pos.y - sel.y0
      const size = Math.max(Math.abs(dx), Math.abs(dy))
      setSel(s => ({
        ...s,
        x1: s.x0 + size * Math.sign(dx || 1),
        y1: s.y0 + size * Math.sign(dy || 1),
      }))
    } else {
      setSel(s => ({ ...s, x1: pos.x, y1: pos.y }))
    }
  }
  function onMouseUp() {
    if (!selecting) return
    setSelecting(false)
    if (!sel) return
    const x0 = Math.min(sel.x0, sel.x1), x1 = Math.max(sel.x0, sel.x1)
    const y0 = Math.min(sel.y0, sel.y1), y1 = Math.max(sel.y0, sel.y1)
    const w = x1 - x0, h = y1 - y0
    if (w < 10 || h < 10) {
      setSel(null)
      return
    }
    const cropRect = {
      x: Math.round(x0 / scale),
      y: Math.round(y0 / scale),
      w: Math.round(w / scale),
      h: Math.round(h / scale),
    }
    update({ cropRect })
    setSel(null)
  }

  // 拖拽中的临时选区可视化
  const selRect = sel && canvasEl ? (() => {
    const rect = canvasEl.getBoundingClientRect()
    const sx = rect.width / canvasEl.width
    const sy = rect.height / canvasEl.height
    return {
      left: Math.min(sel.x0, sel.x1) * sx,
      top: Math.min(sel.y0, sel.y1) * sy,
      width: Math.abs(sel.x1 - sel.x0) * sx,
      height: Math.abs(sel.y1 - sel.y0) * sy,
    }
  })() : null

  // 百分比微调 → cropRect
  function pctChange(field, pctVal) {
    const pct = Math.max(0, Math.min(100, parseFloat(pctVal) || 0))
    const cr = state.cropRect || { x: 0, y: 0, w: vw, h: vh }
    let { x, y, w, h } = cr
    switch (field) {
      case 'left':
        x = Math.round((pct / 100) * vw)
        w = Math.min(w, vw - x)
        break
      case 'top':
        y = Math.round((pct / 100) * vh)
        h = Math.min(h, vh - y)
        break
      case 'width':
        w = Math.round((pct / 100) * vw)
        w = Math.min(w, vw - x)
        break
      case 'height':
        h = Math.round((pct / 100) * vh)
        h = Math.min(h, vh - y)
        break
    }
    if (w < 2) w = 2
    if (h < 2) h = 2
    update({ cropRect: { x, y, w, h } })
  }

  // 输入框：受控草稿 + 即时提交（避免每次提交时 React 重置光标）
  function inputProps(field, currentText) {
    const value = draft[field] ?? currentText
    return {
      value,
      onChange: e => {
        const v = e.target.value
        setDraft(d => ({ ...d, [field]: v }))
        // 输入合法数字时立即同步到 cropRect，画面实时更新
        if (v !== '' && v !== '-' && !isNaN(parseFloat(v))) {
          pctChange(field, v)
        }
      },
      onBlur: () => {
        // 失焦时用规范化的当前文本替换草稿，避免遗留 "1." / "" 等中间态
        setDraft(d => ({ ...d, [field]: null }))
      },
      onKeyDown: e => {
        if (e.key === 'Enter') {
          e.target.blur()
        }
      },
    }
  }

  const cr = state.cropRect
  const pctLeft = cr ? ((cr.x / vw) * 100).toFixed(1) : '0.0'
  const pctTop = cr ? ((cr.y / vh) * 100).toFixed(1) : '0.0'
  const pctW = cr ? ((cr.w / vw) * 100).toFixed(1) : '100.0'
  const pctH = cr ? ((cr.h / vh) * 100).toFixed(1) : '100.0'
  const outW = cr?.w || vw
  const outH = cr?.h || vh
  const metaText = done ? `${outW}×${outH} px` : ''

  const subTitleStyle = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 10 }
  const captionStyle = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 10 }

  return (
    <Panel stepNum={stepNum} title={t('step.crop')} done={done} locked={locked} metaText={metaText} defaultOpen={!locked && !done}>
      {/* 左右双栏：左=框选源，右=裁剪预览 */}
      <div className="crop-dual" style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 24, alignItems: 'start',
      }}>
        {/* 左 */}
        <div>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            {t('crop.mouseSelect')} <span style={{ fontWeight: 400, fontSize: 'var(--text-sm)', color: 'var(--text-dim)' }}>{t('crop.shiftLock')}</span>
          </div>
          <div style={subTitleStyle}>{t('crop.dragHint')}</div>

          <div
            className="crop-canvas-wrap"
            style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair', userSelect: 'none', maxWidth: '100%' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            <canvas ref={setCanvasEl} style={{ display: 'block', borderRadius: 0, maxWidth: '100%', background: 'var(--surface2)' }} />
            {!ready && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-dim)', fontSize: 'var(--text-base)',
              }}>
                {t('crop.loading')}
              </div>
            )}
            {/* 拖拽中的临时选区 + 九宫格 */}
            {selRect && selRect.width > 0 && selRect.height > 0 && (
              <div style={{
                position: 'absolute',
                left: selRect.left, top: selRect.top,
                width: selRect.width, height: selRect.height,
                border: '2px solid var(--accent)',
                background: 'rgba(232,145,26,0.15)',
                pointerEvents: 'none',
                borderRadius: 0,
                overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, borderTop: '1px dashed rgba(232,145,26,0.85)' }} />
                <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, borderTop: '1px dashed rgba(232,145,26,0.85)' }} />
                <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, borderLeft: '1px dashed rgba(232,145,26,0.85)' }} />
                <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, borderLeft: '1px dashed rgba(232,145,26,0.85)' }} />
              </div>
            )}
          </div>

          <div style={captionStyle}>{t('crop.finetuneHint')}</div>
        </div>

        {/* 右 */}
        <div>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            {t('crop.preview')}
          </div>
          <div style={subTitleStyle}>{t('crop.previewHint')}</div>

          <div style={{
            display: 'inline-block',
            background: 'var(--surface2)',
            borderRadius: 0,
            maxWidth: '100%',
          }}>
            <canvas ref={setPreviewEl} style={{ display: 'block', borderRadius: 0, maxWidth: '100%' }} />
          </div>

          <div style={captionStyle}>
            {t('crop.outputSize')}<strong style={{ color: 'var(--text)' }}>{outW} × {outH}</strong>
          </div>
        </div>
      </div>

      {/* 下方：百分比微调 + 重置按钮 */}
      <div className="crop-fine-tune" style={{
        display: 'grid', gap: 8, marginTop: 20,
      }}>
        <div className="option-card" style={{ padding: '8px 10px', minHeight: 'auto' }}>
          <label style={{ fontSize: 'var(--text-sm)', marginBottom: 4 }}>{t('crop.leftOffset')}</label>
          <NumStepper value={parseFloat(pctLeft)} min={0} max={100} step={0.1} onChange={v => pctChange('left', v)} />
        </div>
        <div className="option-card" style={{ padding: '8px 10px', minHeight: 'auto' }}>
          <label style={{ fontSize: 'var(--text-sm)', marginBottom: 4 }}>{t('crop.topOffset')}</label>
          <NumStepper value={parseFloat(pctTop)} min={0} max={100} step={0.1} onChange={v => pctChange('top', v)} />
        </div>
        <div className="option-card" style={{ padding: '8px 10px', minHeight: 'auto' }}>
          <label style={{ fontSize: 'var(--text-sm)', marginBottom: 4 }}>{t('crop.cropWidth')}</label>
          <NumStepper value={parseFloat(pctW)} min={0} max={100} step={0.1} onChange={v => pctChange('width', v)} />
        </div>
        <div className="option-card" style={{ padding: '8px 10px', minHeight: 'auto' }}>
          <label style={{ fontSize: 'var(--text-sm)', marginBottom: 4 }}>{t('crop.cropHeight')}</label>
          <NumStepper value={parseFloat(pctH)} min={0} max={100} step={0.1} onChange={v => pctChange('height', v)} />
        </div>
      </div>

      <div className="crop-actions" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn btn-ghost"
          onClick={() => {
            update({
              cropRect: { x: 0, y: 0, w: vw, h: vh },
            })
          }}
        >
          {t('crop.resetCrop')}
        </button>
      </div>
    </Panel>
  )
}
