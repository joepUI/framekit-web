import { useState, useEffect, useRef } from 'react'

export default function Panel({ stepNum, title, done, locked, defaultOpen = false, children, metaText }) {
  const [open, setOpen] = useState(defaultOpen)
  const prevLocked = useRef(locked)
  const prevDone = useRef(done)

  // Auto-open when step becomes unlocked
  useEffect(() => {
    if (prevLocked.current && !locked) {
      setOpen(true)
    }
    prevLocked.current = locked
  }, [locked])

  // Auto-open when step transitions to done, or when done resets back to false (downstream invalidated)
  useEffect(() => {
    if (!prevDone.current && done) {
      setOpen(true)
    }
    if (prevDone.current && !done && !locked) {
      setOpen(true)
    }
    prevDone.current = done
  }, [done, locked])

  const stepClass = locked ? 'locked' : done ? 'done' : ''
  const canOpen = !locked

  function toggle() {
    if (canOpen) setOpen(o => !o)
  }

  return (
    <div className={`panel ${locked ? 'panel--locked' : ''}`}>
      <div
        className={`panel-head ${open && canOpen ? 'open' : ''}`}
        onClick={toggle}
        role="button"
        aria-expanded={open && canOpen}
        tabIndex={canOpen ? 0 : -1}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggle()}
      >
        <span className={`panel-step ${stepClass}`}>
          {done ? <i className="ri-check-line" /> : stepNum}
        </span>
        <span className="panel-title">{title}</span>
        {metaText && <span className="panel-meta">{metaText}</span>}
        {locked && <span className="panel-meta" style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}><i className="ri-lock-line" style={{ marginRight: 3 }} /> 请先完成上一步</span>}
        {canOpen && (
          <span className={`panel-chevron ${open ? 'open' : ''}`}><i className="ri-arrow-down-s-line" /></span>
        )}
      </div>
      {open && canOpen && (
        <div className="panel-body">
          {children}
        </div>
      )}
    </div>
  )
}
