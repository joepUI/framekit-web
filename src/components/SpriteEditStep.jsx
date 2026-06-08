import { useState, useRef, useMemo } from 'react'
import Panel from './Panel.jsx'
import NumStepper from './NumStepper.jsx'
import { mirrorFrameH, copyImageData, imageDataToUrl, pushHistory } from '../utils/spriteUtils.js'
import { useI18n } from '../i18n/index.jsx'

export default function SpriteEditStep({ stepNum, locked, state, update }) {
  const { t } = useI18n()
  const { frames, selectedIndex, history } = state

  // 显示列数（控制网格每行多少帧）
  const [displayCols, setDisplayCols] = useState(state.splitCols || 8)

  // 拖拽排序
  const dragIdx = useRef(null)
  const [dropTarget, setDropTarget] = useState(null) // 拖拽插入指示线位置

  // 缩略图 dataURL — 增量缓存，只对新帧/变化帧生成，其余复用
  const urlCacheRef = useRef(new Map()) // Map<ImageData, string>
  const thumbUrls = useMemo(() => {
    const cache = urlCacheRef.current
    // 清理不再使用的帧缓存，避免内存泄漏
    const activeSet = new Set(frames.map(f => f.imageData))
    for (const key of cache.keys()) {
      if (!activeSet.has(key)) cache.delete(key)
    }
    return frames.map(f => {
      if (!cache.has(f.imageData)) {
        cache.set(f.imageData, imageDataToUrl(f.imageData))
      }
      return cache.get(f.imageData)
    })
  }, [frames])

  // ── 编辑前推 undo 历史 ──
  function applyEdit(newFrames, newSelectedIndex) {
    const newHistory = pushHistory(frames, history)
    update({
      frames: newFrames,
      history: newHistory,
      selectedIndex: newSelectedIndex ?? Math.min(selectedIndex, newFrames.length - 1),
    })
  }

  function handleUndo() {
    if (!history.length) return
    const prev = history[history.length - 1]
    update({
      frames: prev,
      history: history.slice(0, -1),
      selectedIndex: Math.min(selectedIndex, prev.length - 1),
    })
  }

  function handleMirror() {
    if (!frames.length) return
    const newFrames = frames.map((f, i) =>
      i === selectedIndex ? { imageData: mirrorFrameH(f.imageData) } : f
    )
    applyEdit(newFrames, selectedIndex)
  }

  function handleCopy() {
    if (!frames.length) return
    const copy = { imageData: copyImageData(frames[selectedIndex].imageData) }
    const newFrames = [
      ...frames.slice(0, selectedIndex + 1),
      copy,
      ...frames.slice(selectedIndex + 1),
    ]
    applyEdit(newFrames, selectedIndex + 1)
  }

  function handleReverse() {
    if (frames.length < 2) return
    const newFrames = [...frames].reverse()
    applyEdit(newFrames, frames.length - 1 - selectedIndex)
  }

  function handleDelete() {
    if (frames.length <= 1) return
    const newFrames = frames.filter((_, i) => i !== selectedIndex)
    applyEdit(newFrames, Math.min(selectedIndex, newFrames.length - 1))
  }

  // ── 拖拽排序 ──
  function onDragStart(idx) { dragIdx.current = idx }
  function onDragOver(e, idx) {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) {
      setDropTarget(null)
      return
    }
    // 根据鼠标在目标帧上的水平位置，判断插入左侧还是右侧
    const rect = e.currentTarget.getBoundingClientRect()
    const midX = rect.left + rect.width / 2
    const side = e.clientX < midX ? 'left' : 'right'
    setDropTarget({ idx, side })
  }
  function onDragLeave() { setDropTarget(null) }
  function onDragEnd() { dragIdx.current = null; setDropTarget(null) }
  function onDrop(targetIdx) {
    const src = dragIdx.current
    setDropTarget(null)
    if (src === null || src === targetIdx) { dragIdx.current = null; return }
    const newFrames = [...frames]
    const [moved] = newFrames.splice(src, 1)
    // 如果源在目标前面，splice后目标索引要减1
    const insertIdx = src < targetIdx ? targetIdx - 1 : targetIdx
    // 根据插入方向微调
    const finalIdx = dropTarget?.side === 'right' ? insertIdx + 1 : insertIdx
    newFrames.splice(Math.min(finalIdx, newFrames.length), 0, moved)
    applyEdit(newFrames, Math.min(finalIdx, newFrames.length - 1))
    dragIdx.current = null
  }

  const metaText = frames.length ? `${frames.length} ${t('common.frames')}` : ''

  const toolbarBtns = [
    { label: t('sprite.deleteFrame'), icon: 'ri-delete-bin-line', onClick: handleDelete, disabled: frames.length <= 1, danger: false },
    { label: t('sprite.mirror'), icon: 'ri-flip-horizontal-line', onClick: handleMirror, disabled: !frames.length, danger: false },
    { label: t('sprite.copyFrame'), icon: 'ri-file-copy-line', onClick: handleCopy, disabled: !frames.length, danger: false },
    { label: t('sprite.reverse'), icon: 'ri-repeat-line', onClick: handleReverse, disabled: frames.length < 2, danger: false },
    { label: t('sprite.undo'), icon: 'ri-arrow-go-back-line', onClick: handleUndo, disabled: !history.length, danger: false },
  ]

  return (
    <Panel stepNum={stepNum} title={t('sprite.stepEdit')} done={false} locked={locked} defaultOpen={false} metaText={metaText}>

      {/* ── 工具栏 + 列数调节 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        {toolbarBtns.map(btn => (
          <button
            key={btn.label}
            className={`btn ${btn.danger ? 'btn-danger' : 'btn-secondary'}`}
            onClick={btn.onClick}
            disabled={btn.disabled}
            title={btn.label}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <i className={btn.icon} />
            {btn.label}
          </button>
        ))}
        {history.length > 0 && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>
            {t('sprite.undoSteps').replace('{count}', history.length)}
          </span>
        )}

        {/* 列数控制 推到右侧 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('sprite.displayCols')}</span>
          <NumStepper value={displayCols} min={1} max={16} onChange={v => { setDisplayCols(v); update({ exportCols: v }) }} />
        </div>
      </div>

      {/* ── 帧缩略图网格 ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${displayCols}, 1fr)`,
          gap: 'var(--sp-2)',
          overflow: 'visible',
        }}
      >
        {thumbUrls.map((url, idx) => {
          const showLeft = dropTarget?.idx === idx && dropTarget?.side === 'left'
          const showRight = dropTarget?.idx === idx && dropTarget?.side === 'right'
          return (
            <div
              key={idx}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={e => onDragOver(e, idx)}
              onDragLeave={onDragLeave}
              onDragEnd={onDragEnd}
              onDrop={() => onDrop(idx)}
              onClick={() => update({ selectedIndex: idx })}
              style={{
                position: 'relative',
                aspectRatio: '1',
                border: `2px solid ${idx === selectedIndex ? 'var(--accent)' : 'var(--border-soft)'}`,
                cursor: 'pointer',
                background: 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 12px 12px',
                transition: 'border-color 0.15s',
                boxSizing: 'border-box',
                overflow: 'visible',
              }}
            >
              {/* 左侧插入指示线（gap 间隙居中） */}
              {showLeft && <div style={{
                position: 'absolute', left: -5.5, top: 0, bottom: 0, width: 3,
                background: 'var(--accent)', borderRadius: 1.5, zIndex: 2, pointerEvents: 'none',
              }} />}
              {/* 右侧插入指示线（gap 间隙居中） */}
              {showRight && <div style={{
                position: 'absolute', right: -5.5, top: 0, bottom: 0, width: 3,
                background: 'var(--accent)', borderRadius: 1.5, zIndex: 2, pointerEvents: 'none',
              }} />}
              <img
                src={url}
                alt={t('common.frameAlt').replace('{n}', idx + 1)}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                draggable={false}
              />
              <span style={{
                position: 'absolute',
                top: 3,
                left: 3,
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                fontSize: 10,
                lineHeight: '16px',
                padding: '0 4px',
                fontWeight: 'var(--fw-semi)',
                pointerEvents: 'none',
              }}>
                {idx + 1}
              </span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
