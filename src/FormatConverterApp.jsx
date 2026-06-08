import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Panel from './components/Panel.jsx'
import { useToast } from './components/Toast.jsx'
import { useI18n } from './i18n/index.jsx'
import { fmtSize, baseName } from './utils/format.js'
import { decodeGif } from './utils/gifDecoder.js'
import { encodeGif } from './utils/gifEncoder.js'
import UPNG from 'upng-js'
import JSZip from 'jszip'
import { encodeAnimation as webpEncodeAnimation, decodeAnimation as webpDecodeAnimation } from 'wasm-webp'

// ── 格式常量 ──
const FMT = { PNG_SEQ: 'png-seq', APNG: 'apng', GIF: 'gif', AWEBP: 'awebp' }
const FMT_LABELS = {
  [FMT.PNG_SEQ]: 'PNG 序列',
  [FMT.APNG]: 'APNG',
  [FMT.GIF]: 'GIF',
  [FMT.AWEBP]: 'Animated WebP',
}

// ── 尺寸预设（复用工具03的逻辑）──
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

// ── 检测文件格式 ──
function detectFormat(buffer) {
  const u8 = new Uint8Array(buffer)
  if (u8.length < 12) return null
  // GIF
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return FMT.GIF
  // PNG/APNG：检查是否有 acTL chunk（APNG 标志）
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) {
    let pos = 8
    while (pos + 12 <= u8.length) {
      const len = ((u8[pos] << 24) | (u8[pos + 1] << 16) | (u8[pos + 2] << 8) | u8[pos + 3]) >>> 0
      if (len > u8.length) break // 防止畸形 chunk 导致死循环
      const type = String.fromCharCode(u8[pos + 4], u8[pos + 5], u8[pos + 6], u8[pos + 7])
      if (type === 'acTL') return FMT.APNG
      if (type === 'IEND') break
      pos += 12 + len
    }
    return null
  }
  // WebP：RIFF...WEBP
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
      u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) {
    let pos = 12
    while (pos + 8 <= u8.length) {
      const type = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3])
      const len = ((u8[pos + 4]) | (u8[pos + 5] << 8) | (u8[pos + 6] << 16) | (u8[pos + 7] << 24)) >>> 0
      if (len > u8.length) break
      if (type === 'ANIM') return FMT.AWEBP
      pos += 8 + len + (len & 1)
    }
    return null
  }
  return null
}

// ── APNG 解码为帧 ──
function decodeApng(buffer) {
  const img = UPNG.decode(buffer)
  const rgbaFrames = UPNG.toRGBA8(img)
  const frames = rgbaFrames.map((rgba, i) => ({
    imageData: new ImageData(new Uint8ClampedArray(rgba), img.width, img.height),
    delay: img.frames[i]?.delay || 100,
  }))
  return { width: img.width, height: img.height, frames }
}

// ── Animated WebP 解码为帧 ──
async function decodeAwebp(buffer) {
  const u8 = new Uint8Array(buffer)
  const decoded = await webpDecodeAnimation(u8, true)
  if (!decoded || decoded.length === 0) return null
  const width = decoded[0].width
  const height = decoded[0].height
  const frames = decoded.map(f => ({
    imageData: new ImageData(new Uint8ClampedArray(f.data.buffer || f.data), f.width, f.height),
    delay: f.duration || 100,
  }))
  return { width, height, frames }
}

// ── Animated WebP 编码 ──
async function encodeAwebpData(frames, outW, outH, quality, fps) {
  const webpFrames = frames.map(f => {
    const resized = resizeFrame(f.imageData, outW, outH)
    return {
      data: new Uint8Array(resized.data.buffer),
      duration: Math.round(1000 / fps),
      config: { lossless: 0, quality },
    }
  })
  const result = await webpEncodeAnimation(outW, outH, true, webpFrames)
  if (!result) throw new Error('WebP 编码失败')
  return new Blob([result], { type: 'image/webp' })
}

// ── 帧缩放：将 ImageData 缩放到目标尺寸 ──
function resizeFrame(imageData, targetW, targetH) {
  if (imageData.width === targetW && imageData.height === targetH) return imageData
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = imageData.width
  srcCanvas.height = imageData.height
  srcCanvas.getContext('2d').putImageData(imageData, 0, 0)
  const dstCanvas = document.createElement('canvas')
  dstCanvas.width = targetW
  dstCanvas.height = targetH
  dstCanvas.getContext('2d').drawImage(srcCanvas, 0, 0, targetW, targetH)
  return dstCanvas.getContext('2d').getImageData(0, 0, targetW, targetH)
}

// ── APNG 编码 ──
function encodeApngData(frames, outW, outH, quality, fps) {
  const resized = frames.map(f => resizeFrame(f.imageData, outW, outH))
  const rgbaList = resized.map(id => id.data.buffer)
  const delays = frames.map(() => Math.round(1000 / fps))
  // quality: 0=最小体积, 100=最高质量(无损)
  const cnum = quality >= 100 ? 0 : Math.max(2, Math.round(256 * (quality / 100)))
  return UPNG.encode(rgbaList, outW, outH, cnum, delays)
}

// ── GIF 编码（quality 控制调色板颜色数）──
function encodeGifData(frames, outW, outH, quality, fps) {
  const resized = frames.map(f => resizeFrame(f.imageData, outW, outH))
  // quality 0-100 → maxColors 2-256，颜色越少文件越小
  const maxColors = Math.max(2, Math.round(quality / 100 * 256))
  return new Blob([encodeGif(resized, outW, outH, fps, maxColors)], { type: 'image/gif' })
}

// ── PNG 序列打包为 ZIP ──
async function encodePngZip(frames, outW, outH) {
  const zip = new JSZip()
  const padLen = String(frames.length).length
  for (let i = 0; i < frames.length; i++) {
    const resized = resizeFrame(frames[i].imageData, outW, outH)
    const c = document.createElement('canvas')
    c.width = outW; c.height = outH
    c.getContext('2d').putImageData(resized, 0, 0)
    const blob = await new Promise(r => c.toBlob(r, 'image/png'))
    if (!blob) throw new Error(`帧 ${i + 1} 编码失败`)
    zip.file(`${String(i + 1).padStart(padLen, '0')}.png`, blob)
  }
  return zip.generateAsync({ type: 'blob' })
}

// ── 将 ImageData 转为 dataURL（用于缩略图，只调用一次缓存结果）──
function imageDataToDataUrl(imageData) {
  const c = document.createElement('canvas')
  c.width = imageData.width
  c.height = imageData.height
  c.getContext('2d').putImageData(imageData, 0, 0)
  return c.toDataURL()
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

export default function FormatConverterApp({ onBack }) {
  const { t } = useI18n()
  const toast = useToast()

  // ── Step 1 状态 ──
  const [drag, setDrag] = useState(false)
  const [sourceFormat, setSourceFormat] = useState(null)
  const [sourceName, setSourceName] = useState('')
  const [frames, setFrames] = useState([])
  const [frameW, setFrameW] = useState(0)
  const [frameH, setFrameH] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')

  // ── Step 2 状态 ──
  const [quality, setQuality] = useState(80)
  const [fps, setFps] = useState(12)
  const [sizePreset, setSizePreset] = useState('original')
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(0)
  const [previewEl, setPreviewEl] = useState(null)
  const animRef = useRef(null)

  // ── Step 3 状态 ──
  const [exporting, setExporting] = useState(null)

  const step1Done = frames.length > 0
  const step2Done = step1Done

  // ── 尺寸预设计算 ──
  const sizePresets = useMemo(() => getSizePresets(frameW, frameH), [frameW, frameH])
  const selectedSize = sizePresets.find(p => p.value === sizePreset) || sizePresets[0]
  const outW = selectedSize?.w || frameW || 1
  const outH = selectedSize?.h || frameH || 1

  // ── 缩略图缓存（只在 frames 变化时生成一次）──
  const thumbUrl = useMemo(() => {
    if (frames.length === 0) return null
    return imageDataToDataUrl(frames[0].imageData)
  }, [frames])

  // ── 清理 ──
  function resetAll() {
    setSourceFormat(null)
    setSourceName('')
    setFrames([])
    setFrameW(0)
    setFrameH(0)
    setQuality(80)
    setFps(12)
    setSizePreset('original')
    setPreviewPlaying(false)
    setPreviewIdx(0)
  }

  // ── 上传处理：单文件（GIF/APNG/Animated WebP）──
  async function handleSingleFile(file) {
    setLoading(true)
    setLoadingMsg(t('conv.decoding'))
    try {
      const buffer = await file.arrayBuffer()
      const fmt = detectFormat(buffer)

      if (!fmt) {
        toast.error(t('conv.unsupported'))
        setLoading(false)
        return
      }

      let decoded
      if (fmt === FMT.GIF) {
        decoded = decodeGif(buffer)
      } else if (fmt === FMT.APNG) {
        decoded = decodeApng(buffer)
      } else if (fmt === FMT.AWEBP) {
        decoded = await decodeAwebp(buffer)
      }

      if (!decoded || decoded.frames.length === 0) {
        toast.error(t('conv.decodeFailed'))
        setLoading(false)
        return
      }

      setSourceFormat(fmt)
      setSourceName(baseName(file.name) || 'animation')
      setFrames(decoded.frames)
      setFrameW(decoded.width)
      setFrameH(decoded.height)
      setSizePreset('original')
      // 根据第一帧 delay 推算 FPS，限制在 1-30 范围内
      const delay = decoded.frames[0]?.delay
      if (delay && delay > 0) {
        setFps(Math.min(30, Math.max(1, Math.round(1000 / delay))))
      }
      toast.success(t('conv.decodeOk').replace('{count}', decoded.frames.length))
    } catch (err) {
      toast.error(t('conv.decodeFailed') + ' ' + err.message)
    }
    setLoading(false)
    setLoadingMsg('')
  }

  // ── 上传处理：PNG 序列 ──
  async function handlePngSequence(files) {
    const sorted = Array.from(files)
      .filter(f => f.type === 'image/png' || f.name.toLowerCase().endsWith('.png'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

    if (sorted.length < 2) {
      toast.error(t('conv.needMultiplePng'))
      return
    }

    setLoading(true)
    setLoadingMsg(t('conv.loadingPngs').replace('{count}', sorted.length))

    try {
      const loadedFrames = []
      let w = 0, h = 0

      for (let i = 0; i < sorted.length; i++) {
        setLoadingMsg(t('conv.loadingPng').replace('{current}', i + 1).replace('{total}', sorted.length))
        const url = URL.createObjectURL(sorted[i])
        const img = await loadImage(url)
        URL.revokeObjectURL(url)

        if (i === 0) { w = img.naturalWidth; h = img.naturalHeight }

        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        loadedFrames.push({
          imageData: c.getContext('2d').getImageData(0, 0, w, h),
          delay: 100,
        })
      }

      // 从文件名提取前缀，纯数字文件名时使用 'frames' 兜底
      const namePrefix = sorted[0].name.replace(/\d+\.png$/i, '').replace(/[-_]$/, '')
      setSourceFormat(FMT.PNG_SEQ)
      setSourceName(namePrefix || 'frames')
      setFrames(loadedFrames)
      setFrameW(w)
      setFrameH(h)
      setSizePreset('original')
      toast.success(t('conv.decodeOk').replace('{count}', loadedFrames.length))
    } catch (err) {
      toast.error(t('conv.decodeFailed') + ' ' + err.message)
    }
    setLoading(false)
    setLoadingMsg('')
  }

  // ── Drop 处理 ──
  async function handleDrop(e) {
    e.preventDefault()
    setDrag(false)

    const items = e.dataTransfer.items
    if (!items || items.length === 0) return

    // 检查是否有文件夹
    const entries = []
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.()
      if (entry) entries.push(entry)
    }

    const dirEntry = entries.find(e => e.isDirectory)
    if (dirEntry) {
      const files = await readDirEntry(dirEntry)
      await handlePngSequence(files)
      return
    }

    // 多文件
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 1) {
      await handlePngSequence(files)
      return
    }

    if (files.length === 1) {
      await handleSingleFile(files[0])
    }
  }

  function readDirEntry(dirEntry) {
    return new Promise((resolve) => {
      const reader = dirEntry.createReader()
      const results = []
      function readBatch() {
        reader.readEntries((entries) => {
          if (entries.length === 0) {
            Promise.all(results.map(e => new Promise(r => e.file(f => r(f))))).then(resolve)
            return
          }
          for (const entry of entries) {
            if (entry.isFile) results.push(entry)
          }
          readBatch()
        })
      }
      readBatch()
    })
  }

  function handleFileInput(e) {
    const files = Array.from(e.target.files)
    if (files.length > 1) {
      handlePngSequence(files)
    } else if (files.length === 1) {
      handleSingleFile(files[0])
    }
    e.target.value = ''
  }

  // ── 动画预览 ──
  useEffect(() => {
    if (!previewEl || frames.length === 0) return
    previewEl.width = frameW
    previewEl.height = frameH
    const ctx = previewEl.getContext('2d')
    ctx.clearRect(0, 0, frameW, frameH)
    if (frames[previewIdx]) {
      ctx.putImageData(frames[previewIdx].imageData, 0, 0)
    }
  }, [previewEl, frames, previewIdx, frameW, frameH])

  useEffect(() => {
    if (!previewPlaying || frames.length === 0) {
      if (animRef.current) clearInterval(animRef.current)
      return
    }
    const interval = Math.max(16, Math.round(1000 / fps)) // 最小 16ms，防止 fps 异常导致卡死
    animRef.current = setInterval(() => {
      setPreviewIdx(i => (i + 1) % frames.length)
    }, interval)
    return () => clearInterval(animRef.current)
  }, [previewPlaying, fps, frames.length])

  // ── 导出函数 ──
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  async function exportApng() {
    setExporting('apng')
    try {
      const buf = encodeApngData(frames, outW, outH, quality, fps)
      downloadBlob(new Blob([buf], { type: 'image/png' }), `apng-${sourceName}.png`)
      toast.success(t('conv.exportOk').replace('{format}', 'APNG'))
    } catch (err) {
      toast.error(t('conv.exportFailed') + ' ' + err.message)
    } finally {
      setExporting(null)
    }
  }

  async function exportGif() {
    setExporting('gif')
    try {
      const blob = encodeGifData(frames, outW, outH, quality, fps)
      downloadBlob(blob, `gif-${sourceName}.gif`)
      toast.success(t('conv.exportOk').replace('{format}', 'GIF'))
    } catch (err) {
      toast.error(t('conv.exportFailed') + ' ' + err.message)
    } finally {
      setExporting(null)
    }
  }

  async function exportPngZip() {
    setExporting('png')
    try {
      const blob = await encodePngZip(frames, outW, outH)
      downloadBlob(blob, `png-${sourceName}.zip`)
      toast.success(t('conv.exportOk').replace('{format}', 'PNG ZIP'))
    } catch (err) {
      toast.error(t('conv.exportFailed') + ' ' + err.message)
    } finally {
      setExporting(null)
    }
  }

  async function exportAwebp() {
    setExporting('awebp')
    try {
      const blob = await encodeAwebpData(frames, outW, outH, quality, fps)
      downloadBlob(blob, `webp-${sourceName}.webp`)
      toast.success(t('conv.exportOk').replace('{format}', 'Animated WebP'))
    } catch (err) {
      toast.error(t('conv.exportFailed') + ' ' + err.message)
    } finally {
      setExporting(null)
    }
  }

  // 导出按钮列表（排除自身格式）
  const exportButtons = [
    { fmt: FMT.APNG, label: t('conv.dlApng'), icon: 'ri-image-line', fn: exportApng, key: 'apng' },
    { fmt: FMT.GIF, label: t('conv.dlGif'), icon: 'ri-file-gif-line', fn: exportGif, key: 'gif' },
    { fmt: FMT.PNG_SEQ, label: t('conv.dlPngZip'), icon: 'ri-folder-zip-line', fn: exportPngZip, key: 'png' },
    { fmt: FMT.AWEBP, label: t('conv.dlAwebp'), icon: 'ri-film-line', fn: exportAwebp, key: 'awebp' },
  ].filter(b => b.fmt !== sourceFormat)

  return (
    <>
      <nav className="tut-nav">
        <button className="tut-back-btn" onClick={onBack}>
          <i className="ri-arrow-left-line" /> {t('common.home')}
        </button>
        <span className="tut-nav-title">{t('tool05.title')}</span>
      </nav>
      <div className="app">
        {/* ── Step 1: 上传动图 ── */}
        <Panel stepNum={1} title={t('conv.stepUpload')} done={step1Done} defaultOpen={true}
          metaText={step1Done ? `${sourceName} · ${FMT_LABELS[sourceFormat]} · ${frames.length} ${t('common.frames')} · ${frameW}×${frameH}` : ''}
        >
          {!step1Done ? (
            <>
              <div
                className={`dropzone ${drag ? 'drag' : ''}`}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('conv-file-input').click()}
                role="button"
                aria-label={t('conv.dropHint')}
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && document.getElementById('conv-file-input').click()}
              >
                <input
                  id="conv-file-input"
                  type="file"
                  accept=".png,.gif,.webp,.apng"
                  multiple
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                />
                <div className="dropzone-icon"><i className="ri-loop-right-line" /></div>
                <div className="dropzone-text">
                  <strong>{t('conv.dropHint')}</strong>{t('upload.orClick')}
                </div>
              </div>
              <p className="upload-hint">{t('conv.uploadHint')}</p>
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  <i className="ri-loader-4-line" style={{ animation: 'spin 1s linear infinite' }} />
                  {loadingMsg}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 80, height: 80, borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 12px 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
              }}>
                {thumbUrl && <img src={thumbUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
              </div>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{sourceName}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 4 }}>
                  {FMT_LABELS[sourceFormat]} · {frames.length} {t('common.frames')} · {frameW}×{frameH}
                </div>
                <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={resetAll}>
                  {t('common.reselect')}
                </button>
              </div>
            </div>
          )}
        </Panel>

        {/* ── Step 2: 预览与参数 ── */}
        <Panel stepNum={2} title={t('conv.stepParams')} done={step2Done} locked={!step1Done} defaultOpen={false}
          metaText={step1Done ? `${outW}×${outH} · FPS ${fps} · ${t('conv.quality')} ${quality}` : ''}
        >
          <div className="grid-2col" style={{ display: 'grid', gap: 16 }}>
            {/* 左栏：动画预览 */}
            <div>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{t('conv.preview')}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  {t('export.frame').replace('{current}', previewIdx + 1).replace('{total}', frames.length)}
                </span>
              </div>
              <div style={{
                borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                border: '1px solid var(--border)',
                background: 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 12px 12px',
              }}>
                <canvas ref={setPreviewEl} style={{ width: '100%', display: 'block' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={() => setPreviewPlaying(p => !p)}>
                  <i className={previewPlaying ? 'ri-pause-line' : 'ri-play-line'} />
                  {previewPlaying ? t('common.pause') : t('common.play')}
                </button>
              </div>
            </div>

            {/* 右栏：参数 */}
            <div>
              {/* 输出尺寸 */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                  {t('conv.outputSize')}
                </label>
                <select
                  value={sizePreset}
                  onChange={e => setSizePreset(e.target.value)}
                  style={{
                    width: '100%', height: 36, fontSize: '0.82rem',
                    background: 'var(--surface2)', color: 'var(--text)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                    padding: '0 10px', cursor: 'pointer',
                  }}
                >
                  {sizePresets.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              {/* FPS */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                  FPS
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="range" min={1} max={30} value={fps} onChange={e => setFps(Number(e.target.value))}
                    style={{ flex: 1 }} />
                  <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--text)', minWidth: 28, textAlign: 'right' }}>{fps}</span>
                </div>
              </div>

              {/* 压缩质量 */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                  {t('conv.quality')} <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(0-100)</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="range" min={0} max={100} value={quality} onChange={e => setQuality(Number(e.target.value))}
                    style={{ flex: 1 }} />
                  <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--text)', minWidth: 28, textAlign: 'right' }}>{quality}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>
                  {t('conv.qualityHint')}
                </div>
              </div>

              {/* 源文件信息 */}
              <div style={{
                padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                background: 'var(--surface2)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 4 }}>{t('conv.sourceInfo')}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600 }}>
                  {FMT_LABELS[sourceFormat]} · {frames.length} {t('common.frames')} · {frameW}×{frameH}
                </div>
                {sizePreset !== 'original' && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--accent)', marginTop: 4 }}>
                    → {t('conv.outputTo')} {outW}×{outH}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Panel>

        {/* ── Step 3: 导出 ── */}
        <Panel stepNum={3} title={t('conv.stepExport')} done={false} locked={!step2Done} defaultOpen={false}
          metaText={step1Done ? t('conv.exportHint2').replace('{count}', exportButtons.length) : ''}
        >
          <p className="step-hint">{t('conv.exportHint')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {exportButtons.map(btn => (
              <button
                key={btn.key}
                className="btn btn-primary"
                disabled={!!exporting}
                onClick={btn.fn}
              >
                {exporting === btn.key ? (
                  <><i className="ri-loader-4-line" style={{ animation: 'spin 1s linear infinite' }} /> {t('common.exporting')}</>
                ) : (
                  <><i className={btn.icon} /> {btn.label}</>
                )}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}
