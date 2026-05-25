import { useState, useEffect, useRef, useCallback } from 'react'

const ANGLE_KEYS = [
  { angle: -90,  frame: 8  },
  { angle: -68,  frame: 13 },
  { angle: -45,  frame: 18 },
  { angle: -22,  frame: 25 },
  { angle: 0,    frame: 32 },
  { angle: 22,   frame: 36 },
  { angle: 45,   frame: 40 },
  { angle: 68,   frame: 44 },
  { angle: 90,   frame: 47 },
  { angle: 112,  frame: 50 },
  { angle: 135,  frame: 53 },
  { angle: 158,  frame: 56 },
  { angle: 180,  frame: 58 },
  { angle: -158, frame: 62 },
  { angle: -135, frame: 65 },
  { angle: -112, frame: 70 },
  { angle: -90,  frame: 75 },
]

const COLS = 8
const FRAME_W = 320
const FRAME_H = 320
const FRONT_FRAME = 0

function getFrameForAngle(angleDeg) {
  while (angleDeg > 180) angleDeg -= 360
  while (angleDeg < -180) angleDeg += 360
  for (let i = 0; i < ANGLE_KEYS.length - 1; i++) {
    let a1 = ANGLE_KEYS[i].angle
    let a2 = ANGLE_KEYS[i + 1].angle
    let f1 = ANGLE_KEYS[i].frame
    let f2 = ANGLE_KEYS[i + 1].frame
    let span = a2 - a1
    if (span < 0) span += 360
    let offset = angleDeg - a1
    if (offset < 0) offset += 360
    if (offset <= span + 0.01) {
      const t = offset / span
      return Math.max(0, Math.min(87, Math.round(f1 + t * (f2 - f1))))
    }
  }
  return FRONT_FRAME
}

export default function HamsterIP({ size = 280 }) {
  const containerRef = useRef(null)
  const [frame, setFrame] = useState(FRONT_FRAME)

  const scale = size / FRAME_W
  const col = frame % COLS
  const row = Math.floor(frame / COLS)

  const handleMove = useCallback((clientX, clientY) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    if (Math.sqrt(dx * dx + dy * dy) < 20) {
      setFrame(FRONT_FRAME)
      return
    }
    setFrame(getFrameForAngle(Math.atan2(dy, dx) * 180 / Math.PI))
  }, [])

  useEffect(() => {
    const onMouse = (e) => handleMove(e.clientX, e.clientY)
    document.addEventListener('mousemove', onMouse)
    const el = containerRef.current
    const onTouch = (e) => {
      handleMove(e.touches[0].clientX, e.touches[0].clientY)
    }
    if (el) el.addEventListener('touchmove', onTouch, { passive: true })
    return () => {
      document.removeEventListener('mousemove', onMouse)
      if (el) el.removeEventListener('touchmove', onTouch)
    }
  }, [handleMove])

  return (
    <div
      ref={containerRef}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        backgroundImage: 'url(sprite.webp)',
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${FRAME_W * COLS * scale}px ${FRAME_H * 11 * scale}px`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
        imageRendering: 'crisp-edges',
      }}
    />
  )
}
