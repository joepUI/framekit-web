/** 秒 → mm:ss.x */
export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00.0'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/** 字节 → 可读大小 */
export function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

/** 文件名去扩展名 */
export function baseName(name) {
  return name.replace(/\.[^.]+$/, '')
}

/** 十六进制颜色 → {r,g,b} */
export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** {r,g,b} → 十六进制 */
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}
