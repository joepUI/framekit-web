import { useState, useEffect, useRef } from 'react'
import Panel from './Panel.jsx'
import NumStepper from './NumStepper.jsx'
import { loadImageFile, splitSpriteSheet } from '../utils/spriteUtils.js'
import { fmtSize } from '../utils/format.js'
import { useToast } from './Toast.jsx'
import { useI18n } from '../i18n/index.jsx'

export default function SpriteUploadStep({ stepNum, done, state, update }) {
  const { t } = useI18n()
  const [drag, setDrag] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const toast = useToast()
  const inputRef = useRef(null)

  // callback ref：Panel 折叠/展开后 canvas 重挂时自动重绘（见 LESSONS.md）
  const [previewEl, setPreviewEl] = useState(null)

  // 绘制原图 + 橙色网格线 + 帧序号
  useEffect(() => {
    if (!previewEl || !state.sourceImageData) return
    const { sourceW, sourceH, splitCols, heightRatio } = state
    const frameW = Math.floor(sourceW / splitCols)
    const frameH = frameW > 0 ? Math.round(frameW * heightRatio) : 0
    // ceil：包含末尾不满一行的帧（与 splitSpriteSheet 保持一致）
    const rows = frameH > 0 ? Math.ceil(sourceH / frameH) : 0

    // canvas 尺寸：等比缩放到容器宽度，高度保留完整原图
    const containerW = previewEl.parentElement?.clientWidth || 300
    const scale = Math.min(1, containerW / sourceW)
    previewEl.width = Math.round(sourceW * scale)
    previewEl.height = Math.round(sourceH * scale)

    const ctx = previewEl.getContext('2d')
    ctx.clearRect(0, 0, previewEl.width, previewEl.height)

    // 源图（完整绘制）
    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = sourceW
    srcCanvas.height = sourceH
    srcCanvas.getContext('2d').putImageData(state.sourceImageData, 0, 0)
    ctx.drawImage(srcCanvas, 0, 0, previewEl.width, previewEl.height)

    // 橙色网格线（含最后一行底边线，row <= rows 且不超出画布）
    ctx.strokeStyle = 'rgba(232, 145, 26, 0.85)'
    ctx.lineWidth = 1
    for (let col = 1; col < splitCols; col++) {
      const x = Math.round(col * frameW * scale)
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, previewEl.height); ctx.stroke()
    }
    for (let row = 1; row <= rows; row++) {
      const y = Math.round(row * frameH * scale)
      if (y >= previewEl.height) break
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(previewEl.width, y); ctx.stroke()
    }

    // 帧序号
    const fontSize = Math.max(8, Math.min(14, frameW * scale * 0.2))
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.fillStyle = 'rgba(232, 145, 26, 0.95)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    let idx = 1
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < splitCols; col++) {
        ctx.fillText(idx, col * frameW * scale + 3, row * frameH * scale + 3)
        idx++
      }
    }
  }, [previewEl, state.sourceImageData, state.splitCols, state.heightRatio, state.sourceW, state.sourceH])

  async function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      toast.error(t('sprite.invalidImage'))
      return
    }
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl)
    try {
      const { imageData, width, height, url } = await loadImageFile(file)
      update({
        sourceFile: file,
        sourceUrl: url,
        sourceImageData: imageData,
        sourceW: width,
        sourceH: height,
        splitCols: 8,
        heightRatio: 1,
        frames: [],
        frameW: 0,
        frameH: 0,
        selectedIndex: 0,
        history: [],
      })
    } catch {
      toast.error(t('sprite.loadFailed'))
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDrag(false)
    handleFile(e.dataTransfer.files[0])
  }

  function doSplit() {
    if (!state.sourceImageData) return
    setSplitting(true)
    // 先清空帧，让下游步骤的 locked 重置，重新分割后触发自动展开
    update({ frames: [], selectedIndex: 0, history: [] })
    requestAnimationFrame(() => {
      try {
        const { frames, frameW, frameH } = splitSpriteSheet(state.sourceImageData, state.splitCols, state.heightRatio)
        update({ frames, frameW, frameH, selectedIndex: 0, history: [], exportCols: state.splitCols })
      } catch (e) {
        toast.error(t('sprite.splitFailed') + e.message)
      }
      setSplitting(false)
    })
  }

  const frameW = state.sourceW ? Math.floor(state.sourceW / state.splitCols) : 0
  const frameH = frameW > 0 ? Math.round(frameW * state.heightRatio) : 0
  const rows = frameH > 0 && state.sourceH ? Math.ceil(state.sourceH / frameH) : 0
  const totalFrames = rows * state.splitCols

  const metaText = done
    ? `${state.frames.length} ${t('common.frames')} · ${state.frameW} × ${state.frameH} px`
    : ''

  return (
    <Panel stepNum={stepNum} title={t('sprite.stepUpload')} done={done} locked={false} defaultOpen metaText={metaText}>
      {/* ── 未上传：拖放区 ── */}
      {!state.sourceImageData ? (
        <>
          <div
            className={`dropzone${drag ? ' drag' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
            <i className="ri-image-add-line" style={{ fontSize: '2rem', color: 'var(--text-dim)', marginBottom: 8 }} />
            <div style={{ fontWeight: 'var(--fw-medium)', color: 'var(--text-muted)' }}>{t('sprite.dropHint')}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-dim)', marginTop: 4 }}>{t('sprite.formatHint')}</div>
          </div>
        </>
      ) : (
        <>
          {/* ── 已上传：文件信息 ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 'var(--fw-semi)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {state.sourceFile?.name}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>
                {state.sourceW} × {state.sourceH} px · {fmtSize(state.sourceFile?.size || 0)}
              </div>
            </div>
            <button className="btn btn-ghost" onClick={() => inputRef.current?.click()} style={{ flexShrink: 0 }}>
              {t('common.reselect')}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
          </div>

          {/* ── 提示 ── */}
          <div className="status-msg info" style={{ marginBottom: 'var(--sp-4)' }}>
            {t('sprite.splitHint')}
          </div>

          {/* ── 列数 + 行高比 + 单帧尺寸 + 预计总帧数 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
            <div className="option-card">
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>{t('sprite.cols')}</div>
              <NumStepper value={state.splitCols} min={1} max={64} onChange={v => update({ splitCols: v })} />
            </div>
            <div className="option-card">
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>{t('sprite.heightRatio')}</div>
              <NumStepper value={state.heightRatio} min={0.1} max={99} step={0.01} onChange={v => update({ heightRatio: v })} />
            </div>
            <div className="option-card">
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('sprite.frameSize')}</div>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--fw-bold)', color: 'var(--accent)', marginTop: 6 }}>
                {frameW > 0 ? `${frameW} × ${frameH} px` : '—'}
              </div>
            </div>
            <div className="option-card">
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('sprite.totalFrames')}</div>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--fw-bold)', color: 'var(--accent)', marginTop: 6 }}>
                {totalFrames > 0 ? `${totalFrames} ${t('common.frames')}（${state.splitCols}×${rows}）` : '—'}
              </div>
            </div>
          </div>

          {/* ── 网格预览 + 分割按钮 ── */}
          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 6 }}>{t('sprite.splitPreview')}</div>
            <canvas
              ref={setPreviewEl}
              style={{ width: '100%', display: 'block', border: '1px solid var(--border-soft)' }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={doSplit}
            disabled={splitting}
            style={{ width: '100%' }}
          >
            {splitting ? t('sprite.splitting') : done ? t('sprite.btnResplit') : t('sprite.btnSplit')}
          </button>

        </>
      )}
    </Panel>
  )
}
