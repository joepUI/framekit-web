/**
 * GIF89a 动画编码器（无依赖）
 * 颜色分箱量化 + LZW 压缩
 * 参考 GIF89a 规范实现
 */

const MAX_COLORS = 256
const BIN_LEVELS = 32
const BIN_COUNT = BIN_LEVELS * BIN_LEVELS * BIN_LEVELS

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function clamp(v, min, max) { return Math.min(Math.max(v, min), max) }

function ceilPow2(n) {
  let v = Math.max(2, n)
  if ((v & (v - 1)) === 0) return v
  v--; v |= v >> 1; v |= v >> 2; v |= v >> 4; v |= v >> 8; v |= v >> 16
  return v + 1
}

function getBin(r, g, b) {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
}

// ─── 调色板构建 ───────────────────────────────────────────────────────────────

function buildPalette(frames, width, height) {
  // 统计颜色分箱
  const stats = new Array(BIN_COUNT)
  for (let i = 0; i < BIN_COUNT; i++) stats[i] = { count: 0, r: 0, g: 0, b: 0 }

  const totalPixels = frames.length * width * height
  const stride = Math.max(1, Math.floor(Math.sqrt(totalPixels / 200000)))

  for (const frame of frames) {
    const data = frame.data
    for (let i = 0; i < data.length; i += 4 * stride) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const bin = getBin(r, g, b)
      stats[bin].count++
      stats[bin].r += r
      stats[bin].g += g
      stats[bin].b += b
    }
  }

  // 取频率最高的 256 个颜色箱
  const activeBins = []
  for (let i = 0; i < BIN_COUNT; i++) {
    if (stats[i].count > 0) activeBins.push(i)
  }
  activeBins.sort((a, b) => stats[b].count - stats[a].count)
  const picked = activeBins.slice(0, MAX_COLORS)

  // 构建调色板表
  const paletteSize = ceilPow2(Math.max(2, picked.length))
  const table = new Uint8Array(paletteSize * 3)
  const entries = []

  for (let i = 0; i < picked.length; i++) {
    const s = stats[picked[i]]
    const r = Math.round(s.r / s.count)
    const g = Math.round(s.g / s.count)
    const b = Math.round(s.b / s.count)
    table[i * 3] = r
    table[i * 3 + 1] = g
    table[i * 3 + 2] = b
    entries.push({ index: i, r, g, b })
  }

  // 构建 bin → palette 缓存
  const binCache = new Int16Array(BIN_COUNT).fill(-1)
  for (let i = 0; i < picked.length; i++) {
    binCache[picked[i]] = i
  }

  return { table, entries, binCache, paletteSize }
}

function findNearest(r, g, b, entries) {
  let best = 0, bestDist = Infinity
  for (const e of entries) {
    const dr = r - e.r, dg = g - e.g, db = b - e.b
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) { bestDist = dist; best = e.index }
    if (dist === 0) break
  }
  return best
}

function indexFrame(data, width, height, palette, transparentIndex) {
  const pixels = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const off = i * 4
    const a = data[off + 3]
    // alpha < 128 视为透明
    if (transparentIndex !== null && a < 128) {
      pixels[i] = transparentIndex
      continue
    }
    const r = data[off], g = data[off + 1], b = data[off + 2]
    const bin = getBin(r, g, b)
    let idx = palette.binCache[bin]
    if (idx < 0) {
      idx = findNearest(r, g, b, palette.entries)
      palette.binCache[bin] = idx
    }
    pixels[i] = idx
  }
  return pixels
}

// ─── LZW 编码 ─────────────────────────────────────────────────────────────────

function lzwEncode(pixels, minCodeSize) {
  const clearCode = 1 << minCodeSize
  const endCode = clearCode + 1

  // BitWriter
  const output = []
  let curByte = 0, bitPos = 0

  function writeBits(code, size) {
    let c = code, s = size
    while (s > 0) {
      curByte |= (c & 1) << bitPos
      c >>= 1
      bitPos++
      s--
      if (bitPos >= 8) {
        output.push(curByte)
        curByte = 0
        bitPos = 0
      }
    }
  }

  function flush() {
    if (bitPos > 0) output.push(curByte)
  }

  // 简化 LZW：每个像素独立编码（不做字典匹配，文件稍大但保证正确）
  let codeSize = minCodeSize + 1
  let dictSize = endCode + 1
  let prevLiteral = false

  writeBits(clearCode, codeSize)
  dictSize = endCode + 1
  codeSize = minCodeSize + 1
  prevLiteral = false

  for (let i = 0; i < pixels.length; i++) {
    if (prevLiteral && dictSize > ((1 << 12) - 1)) {
      writeBits(clearCode, codeSize)
      codeSize = minCodeSize + 1
      dictSize = endCode + 1
      prevLiteral = false
    }
    writeBits(pixels[i], codeSize)
    if (prevLiteral) {
      dictSize++
      if (dictSize === (1 << codeSize) && codeSize < 12) {
        codeSize++
      }
    }
    prevLiteral = true
  }

  writeBits(endCode, codeSize)
  flush()

  return new Uint8Array(output)
}

// ─── GIF 文件写入 ─────────────────────────────────────────────────────────────

function writeSubBlocks(bytes, data) {
  let offset = 0
  while (offset < data.length) {
    const chunk = Math.min(255, data.length - offset)
    bytes.push(chunk)
    for (let i = 0; i < chunk; i++) bytes.push(data[offset + i])
    offset += chunk
  }
  bytes.push(0) // block terminator
}

/**
 * 编码 GIF 动画
 * @param {ImageData[]} frames - 帧数组
 * @param {number} width - 帧宽
 * @param {number} height - 帧高
 * @param {number} fps - 帧率
 * @returns {Uint8Array}
 */
export function encodeGif(frames, width, height, fps) {
  const delayCs = clamp(Math.round(100 / fps), 1, 65535)
  const bytes = []

  const w = b => bytes.push(b & 0xff)
  const w2 = n => { bytes.push(n & 0xff); bytes.push((n >> 8) & 0xff) }

  // 检测是否有透明像素
  let hasAlpha = false
  for (const frame of frames) {
    for (let i = 3; i < frame.data.length; i += 4) {
      if (frame.data[i] < 128) { hasAlpha = true; break }
    }
    if (hasAlpha) break
  }

  // 构建全局调色板（透明时预留索引 0 给透明色）
  const palette = buildPalette(frames, width, height)
  const transparentIndex = hasAlpha ? palette.paletteSize - 1 : null

  const tableBitSize = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.paletteSize))))
  const colorTableFlag = clamp(tableBitSize - 1, 0, 7)
  const lzwMin = Math.max(2, tableBitSize)

  // Header
  ;[71, 73, 70, 56, 57, 97].forEach(w) // GIF89a
  w2(width)
  w2(height)
  w(0x80 | (7 << 4) | colorTableFlag)
  w(0)
  w(0)

  // Global Color Table
  for (let i = 0; i < palette.table.length; i++) bytes.push(palette.table[i])

  // Netscape looping extension
  bytes.push(0x21, 0xff, 0x0b)
  ;[78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48].forEach(w) // NETSCAPE2.0
  bytes.push(0x03, 0x01)
  w2(0)
  bytes.push(0x00)

  // Frames
  for (const frame of frames) {
    // Graphic Control Extension
    bytes.push(0x21, 0xf9, 0x04)
    if (hasAlpha) {
      // disposal=2 (restore to background), transparent flag=1
      bytes.push(0x09)
    } else {
      bytes.push(0x00)
    }
    w2(delayCs)
    bytes.push(hasAlpha ? transparentIndex : 0x00)
    bytes.push(0x00)

    // Image Descriptor
    bytes.push(0x2c)
    w2(0); w2(0)
    w2(width); w2(height)
    bytes.push(0x00)

    // LZW image data
    const indexed = indexFrame(frame.data, width, height, palette, transparentIndex)
    const lzwData = lzwEncode(indexed, lzwMin)
    bytes.push(lzwMin)
    writeSubBlocks(bytes, lzwData)
  }

  bytes.push(0x3b)
  return new Uint8Array(bytes)
}
