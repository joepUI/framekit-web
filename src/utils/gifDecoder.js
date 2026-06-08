/**
 * GIF 解码器 —— 将 GIF 文件解码为逐帧 ImageData
 * 支持 GIF87a/GIF89a，处理 dispose method、透明色、交错扫描
 * 纯 JS 实现，无外部依赖
 */

/**
 * 解码 GIF 文件为帧序列
 * @param {ArrayBuffer} buffer - GIF 文件的 ArrayBuffer
 * @returns {{ width: number, height: number, frames: { imageData: ImageData, delay: number }[] }}
 */
export function decodeGif(buffer) {
  const bytes = new Uint8Array(buffer)
  let pos = 0

  function readU8() { return bytes[pos++] }
  function readU16() { const v = bytes[pos] | (bytes[pos + 1] << 8); pos += 2; return v }
  function readBytes(n) { const s = bytes.slice(pos, pos + n); pos += n; return s }

  // ── Header ──
  const sig = String.fromCharCode(...readBytes(6))
  if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('不是有效的 GIF 文件')

  // ── Logical Screen Descriptor ──
  const width = readU16()
  const height = readU16()
  const packed = readU8()
  const bgIndex = readU8()
  readU8() // pixel aspect ratio

  const gctFlag = (packed >> 7) & 1
  const gctSize = gctFlag ? 3 * (1 << ((packed & 7) + 1)) : 0

  // ── Global Color Table ──
  let gct = null
  if (gctFlag) {
    gct = readBytes(gctSize)
  }

  // ── 帧合成画布（保持上一帧状态用于 dispose） ──
  const canvas = new Uint8ClampedArray(width * height * 4)
  // 初始化为透明
  canvas.fill(0)

  const frames = []
  let gce = null // Graphics Control Extension

  while (pos < bytes.length) {
    const block = readU8()

    if (block === 0x3B) break // Trailer

    if (block === 0x21) {
      // Extension
      const label = readU8()
      if (label === 0xF9) {
        // Graphics Control Extension
        const size = readU8() // always 4
        const gcPacked = readU8()
        const delay = readU16()
        const transIndex = readU8()
        readU8() // block terminator
        gce = {
          disposalMethod: (gcPacked >> 2) & 7,
          transFlag: gcPacked & 1,
          transIndex,
          delay: delay * 10, // 转换为毫秒
        }
      } else {
        // 跳过其他扩展块
        skipSubBlocks()
      }
      continue
    }

    if (block === 0x2C) {
      // Image Descriptor
      const left = readU16()
      const top = readU16()
      const fw = readU16()
      const fh = readU16()
      const imgPacked = readU8()
      const lctFlag = (imgPacked >> 7) & 1
      const interlace = (imgPacked >> 6) & 1
      const lctSize = lctFlag ? 3 * (1 << ((imgPacked & 7) + 1)) : 0

      let lct = null
      if (lctFlag) {
        lct = readBytes(lctSize)
      }

      const ct = lct || gct
      const transFlag = gce ? gce.transFlag : 0
      const transIndex = gce ? gce.transIndex : -1
      const disposalMethod = gce ? gce.disposalMethod : 0
      const delay = gce ? gce.delay : 100

      // 备份画布用于 dispose to previous
      let prevCanvas = null
      if (disposalMethod === 3) {
        prevCanvas = new Uint8ClampedArray(canvas)
      }

      // ── LZW 解码 ──
      const minCodeSize = readU8()
      const compressedData = readSubBlocks()
      const pixels = lzwDecode(minCodeSize, compressedData, fw * fh)

      // ── 将像素写入合成画布 ──
      const rows = deinterlace(pixels, fw, fh, interlace)
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const idx = rows[y * fw + x]
          if (transFlag && idx === transIndex) continue // 透明像素不写
          const cx = left + x
          const cy = top + y
          if (cx >= width || cy >= height) continue
          const offset = (cy * width + cx) * 4
          canvas[offset] = ct[idx * 3]
          canvas[offset + 1] = ct[idx * 3 + 1]
          canvas[offset + 2] = ct[idx * 3 + 2]
          canvas[offset + 3] = 255
        }
      }

      // 输出当前帧
      frames.push({
        imageData: new ImageData(new Uint8ClampedArray(canvas), width, height),
        delay,
      })

      // ── Dispose 处理 ──
      if (disposalMethod === 2) {
        // 恢复为背景（透明）
        for (let y = 0; y < fh; y++) {
          for (let x = 0; x < fw; x++) {
            const cx = left + x
            const cy = top + y
            if (cx >= width || cy >= height) continue
            const offset = (cy * width + cx) * 4
            canvas[offset] = 0
            canvas[offset + 1] = 0
            canvas[offset + 2] = 0
            canvas[offset + 3] = 0
          }
        }
      } else if (disposalMethod === 3 && prevCanvas) {
        // 恢复为上一帧
        canvas.set(prevCanvas)
      }

      gce = null
      continue
    }

    // 未知块类型，跳过（防止解析错位）
    // 注：正常 GIF 不应走到这里，但畸形文件可能包含未知块
  }

  return { width, height, frames }

  // ── 辅助函数 ──

  function skipSubBlocks() {
    while (true) {
      const size = readU8()
      if (size === 0) break
      pos += size
    }
  }

  function readSubBlocks() {
    const chunks = []
    while (true) {
      const size = readU8()
      if (size === 0) break
      chunks.push(readBytes(size))
    }
    // 合并
    let total = 0
    for (const c of chunks) total += c.length
    const result = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) { result.set(c, offset); offset += c.length }
    return result
  }

  function deinterlace(pixels, w, h, interlace) {
    if (!interlace) return pixels
    const result = new Uint8Array(w * h)
    // GIF interlace: 4 pass
    const starts = [0, 4, 2, 1]
    const steps = [8, 8, 4, 2]
    let srcRow = 0
    for (let pass = 0; pass < 4; pass++) {
      for (let y = starts[pass]; y < h; y += steps[pass]) {
        const srcOff = srcRow * w
        const dstOff = y * w
        for (let x = 0; x < w; x++) {
          result[dstOff + x] = pixels[srcOff + x]
        }
        srcRow++
      }
    }
    return result
  }
}

/**
 * LZW 解码
 */
function lzwDecode(minCodeSize, compressed, pixelCount) {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  const output = new Uint8Array(pixelCount)
  let outPos = 0

  // 比特流读取
  let bitPos = 0
  let bytePos = 0

  function readBits(n) {
    let val = 0
    for (let i = 0; i < n; i++) {
      if (bytePos >= compressed.length) return val
      val |= ((compressed[bytePos] >> bitPos) & 1) << i
      bitPos++
      if (bitPos === 8) { bitPos = 0; bytePos++ }
    }
    return val
  }

  // 初始化字典
  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1
  let maxCode = 1 << codeSize

  // 字典：每项存储字节序列
  const dict = new Array(4096)
  function resetDict() {
    for (let i = 0; i < clearCode; i++) dict[i] = [i]
    dict[clearCode] = null // clear
    dict[eoiCode] = null   // eoi
    nextCode = eoiCode + 1
    codeSize = minCodeSize + 1
    maxCode = 1 << codeSize
  }

  resetDict()

  let prev = null
  let code

  // 第一个 code 必须是 clear
  code = readBits(codeSize)
  if (code === clearCode) {
    resetDict()
  }

  // 读第一个真实 code
  code = readBits(codeSize)
  if (code === eoiCode || outPos >= pixelCount) return output

  if (dict[code]) {
    for (const b of dict[code]) { if (outPos < pixelCount) output[outPos++] = b }
    prev = dict[code]
  }

  while (outPos < pixelCount) {
    code = readBits(codeSize)
    if (code === eoiCode) break
    if (code === clearCode) {
      resetDict()
      code = readBits(codeSize)
      if (code === eoiCode) break
      if (dict[code]) {
        for (const b of dict[code]) { if (outPos < pixelCount) output[outPos++] = b }
        prev = dict[code]
      }
      continue
    }

    let entry
    if (code < nextCode && dict[code]) {
      entry = dict[code]
    } else if (code === nextCode && prev) {
      entry = [...prev, prev[0]]
    } else {
      // 异常情况，跳过
      break
    }

    for (const b of entry) { if (outPos < pixelCount) output[outPos++] = b }

    // 添加新字典项
    if (prev && nextCode < 4096) {
      dict[nextCode] = [...prev, entry[0]]
      nextCode++
      if (nextCode >= maxCode && codeSize < 12) {
        codeSize++
        maxCode = 1 << codeSize
      }
    }

    prev = entry
  }

  return output
}
