let optimiseFn = null
let loadPromise = null

async function ensureLoaded() {
  if (optimiseFn) return
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    try {
      const { default: optimise } = await import('@jsquash/oxipng/optimise')
      optimiseFn = optimise
    } catch (e) {
      loadPromise = null
      throw e
    }
  })()
  return loadPromise
}

// 压缩单张 PNG（接受 Blob 或 ArrayBuffer，返回 Blob）
// 压缩失败时返回原始数据，保证导出不中断
export async function optimizePng(blobOrBuffer, options = {}) {
  try {
    await ensureLoaded()
    const buffer = blobOrBuffer instanceof Blob
      ? await blobOrBuffer.arrayBuffer()
      : blobOrBuffer
    const optimized = await optimiseFn(buffer, { level: options.level ?? 2 })
    return new Blob([optimized], { type: 'image/png' })
  } catch {
    return blobOrBuffer instanceof Blob
      ? blobOrBuffer
      : new Blob([blobOrBuffer], { type: 'image/png' })
  }
}

// canvas → PNG Blob，根据 compress 决定是否走 oxipng
export async function canvasToPngBlob(canvas, compress = true) {
  const raw = await new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png')
  )
  if (!compress) return raw
  return optimizePng(raw)
}

// 读取压缩开关（localStorage 持久化，默认关闭）
const STORAGE_KEY = 'fk-png-compress'
export function getPngCompressEnabled() {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === '1'
}
export function setPngCompressEnabled(on) {
  localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
}
