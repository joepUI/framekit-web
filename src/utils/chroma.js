import { hexToRgb } from './format.js'

export const CHROMA_MODE_CONNECTED = 'connected'
export const CHROMA_MODE_GLOBAL = 'global'

/**
 * 对 ImageData 做色键去背景
 * @param {ImageData} imageData
 * @param {string} colorHex  背景色 hex
 * @param {number} tolerance  容差 0-255
 * @param {number} smooth     羽化 0-10
 * @param {boolean} despill   去溢色
 * @param {{mode?: string, samples?: Array<{x:number,y:number,color:string}>}} options
 * @returns {ImageData} 处理后的 ImageData（in-place）
 */
export function applyChroma(imageData, colorHex, tolerance, smooth, despill, edgeSmooth = false, options = {}) {
  if (options.mode === 'connected') {
    return applyConnectedChroma(imageData, options.samples || [], tolerance, smooth, despill, edgeSmooth, colorHex)
  }

  const { r: kr, g: kg, b: kb } = hexToRgb(colorHex)
  const data = imageData.data
  const len = data.length

  // 平滑区域 = tolerance * (1 + smooth * 0.1)
  const tHard = tolerance
  const tSoft = tolerance * (1 + smooth * 0.15)

  for (let i = 0; i < len; i += 4) {
    const pr = data[i], pg = data[i + 1], pb = data[i + 2]

    // 色相距离（简单欧氏距离）
    const dist = Math.sqrt(
      (pr - kr) ** 2 +
      (pg - kg) ** 2 +
      (pb - kb) ** 2
    )

    let alpha
    if (dist <= tHard) {
      alpha = 0
    } else if (dist <= tSoft) {
      const p = (dist - tHard) / (tSoft - tHard)
      // edgeSmooth: smoothstep 曲线（S形）；否则线性
      alpha = Math.round((edgeSmooth ? p * p * (3 - 2 * p) : p) * 255)
    } else {
      alpha = 255
    }

    if (alpha < 255) {
      data[i + 3] = Math.min(data[i + 3], alpha)

      // 去溢色：降低主色调偏向
      if (despill && alpha > 0) {
        const maxKC = Math.max(kr, kg, kb)
        const dominant = kr === maxKC ? 0 : kg === maxKC ? 1 : 2
        if (dominant === 0) data[i] = Math.min(data[i], Math.max(data[i + 1], data[i + 2]))
        else if (dominant === 1) data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]))
        else data[i + 2] = Math.min(data[i + 2], Math.max(data[i], data[i + 1]))
      }
    }
  }

  return imageData
}

export function hasChromaKey(settings) {
  if (getChromaMode(settings) === CHROMA_MODE_CONNECTED) {
    return (settings.chromaSamples || []).length > 0
  }
  return !!settings.chromaColor
}

export function applyChromaKey(imageData, settings) {
  if (!hasChromaKey(settings)) return imageData
  const mode = getChromaMode(settings)
  const samples = settings.chromaSamples || []
  const color = mode === CHROMA_MODE_CONNECTED
    ? samples[0]?.color
    : settings.chromaColor
  applyChroma(
    imageData,
    color,
    settings.tolerance,
    settings.smooth,
    settings.despill,
    settings.edgeSmooth,
    mode === CHROMA_MODE_CONNECTED ? { mode, samples } : undefined
  )
  return applyEdgeCleanup(imageData, settings, getSampleColors(settings, color))
}

function getChromaMode(settings) {
  if (settings.chromaMode) return settings.chromaMode
  return (settings.chromaSamples || []).length > 0 ? CHROMA_MODE_CONNECTED : CHROMA_MODE_GLOBAL
}

function applyConnectedChroma(imageData, samples, tolerance, smooth, despill, edgeSmooth, fallbackColor) {
  const { width, height, data } = imageData
  const pixelCount = width * height
  if (!width || !height || !samples.length) return imageData

  const tHard = tolerance
  const tSoft = tolerance * (1 + smooth * 0.15)
  const alphaMask = new Uint8ClampedArray(pixelCount)
  alphaMask.fill(255)
  const dominantMask = new Int8Array(pixelCount)
  dominantMask.fill(-1)
  const queue = new Int32Array(pixelCount)

  samples.slice(0, 5).forEach(sample => {
    const color = sample.color || fallbackColor
    if (!color) return
    const { r: kr, g: kg, b: kb } = hexToRgb(color)
    const sx = clamp(Math.round(sample.x), 0, width - 1)
    const sy = clamp(Math.round(sample.y), 0, height - 1)
    const seedIdx = sy * width + sx
    const seedOffset = seedIdx * 4
    if (colorDistance(data[seedOffset], data[seedOffset + 1], data[seedOffset + 2], kr, kg, kb) > tSoft) {
      return
    }

    const visited = new Uint8Array(pixelCount)
    let head = 0
    let tail = 0
    queue[tail++] = seedIdx
    visited[seedIdx] = 1

    while (head < tail) {
      const idx = queue[head++]
      const offset = idx * 4
      const dist = colorDistance(data[offset], data[offset + 1], data[offset + 2], kr, kg, kb)
      if (dist > tSoft) continue

      const alpha = chromaAlpha(dist, tHard, tSoft, edgeSmooth)
      if (alpha < alphaMask[idx]) {
        alphaMask[idx] = alpha
        dominantMask[idx] = dominantChannel(kr, kg, kb)
      }

      const x = idx % width
      if (idx >= width) pushNeighbor(idx - width, visited, queue, () => tail++)
      if (idx < pixelCount - width) pushNeighbor(idx + width, visited, queue, () => tail++)
      if (x > 0) pushNeighbor(idx - 1, visited, queue, () => tail++)
      if (x < width - 1) pushNeighbor(idx + 1, visited, queue, () => tail++)
    }
  })

  for (let idx = 0; idx < pixelCount; idx++) {
    const alpha = alphaMask[idx]
    if (alpha >= 255) continue
    const offset = idx * 4
    data[offset + 3] = Math.min(data[offset + 3], alpha)

    if (despill && alpha > 0) {
      const dominant = dominantMask[idx]
      if (dominant === 0) data[offset] = Math.min(data[offset], Math.max(data[offset + 1], data[offset + 2]))
      else if (dominant === 1) data[offset + 1] = Math.min(data[offset + 1], Math.max(data[offset], data[offset + 2]))
      else if (dominant === 2) data[offset + 2] = Math.min(data[offset + 2], Math.max(data[offset], data[offset + 1]))
    }
  }

  return imageData
}

function applyEdgeCleanup(imageData, settings, sampleColors) {
  const edgeTrim = clamp(settings.edgeTrim ?? 0, 0, 5)
  const edgeClean = settings.edgeClean || 'off'
  if (!edgeTrim && edgeClean === 'off') return imageData

  if (edgeTrim > 0) {
    trimFringePixels(imageData, sampleColors, edgeTrim, settings.tolerance, settings.smooth)
  }
  if (edgeClean !== 'off') {
    cleanEdgeColors(imageData, sampleColors, edgeClean)
  }
  return imageData
}

function trimFringePixels(imageData, sampleColors, radius, tolerance, smooth) {
  if (!sampleColors.length) return
  const { width, height, data } = imageData
  const toClear = []
  const threshold = tolerance * (1 + smooth * 0.15) + radius * 64

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const offset = idx * 4
      if (data[offset + 3] === 0) continue
      if (!isNearTransparent(data, width, height, x, y, radius)) continue
      const dist = minSampleDistance(data[offset], data[offset + 1], data[offset + 2], sampleColors)
      if (dist <= threshold) toClear.push(offset)
    }
  }

  toClear.forEach(offset => { data[offset + 3] = 0 })
}

function cleanEdgeColors(imageData, sampleColors, strength) {
  if (!sampleColors.length) return
  const { width, height, data } = imageData
  const blend = strength === 'extra' ? 0.95 : strength === 'strong' ? 0.85 : 0.58
  const neutralLight = isNeutralLightSample(sampleColors)
  const updates = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const offset = idx * 4
      if (data[offset + 3] === 0) continue
      if (!isNearTransparent(data, width, height, x, y, 1)) continue

      if (neutralLight && isLightLowSaturation(data[offset], data[offset + 1], data[offset + 2])) {
        const factor = strength === 'extra' ? 0.55 : strength === 'strong' ? 0.68 : 0.82
        updates.push([offset, data[offset] * factor, data[offset + 1] * factor, data[offset + 2] * factor])
        continue
      }

      const sample = nearestSampleColor(data[offset], data[offset + 1], data[offset + 2], sampleColors)
      const dominant = dominantChannel(sample.r, sample.g, sample.b)
      const next = [data[offset], data[offset + 1], data[offset + 2]]
      const otherMax = dominant === 0
        ? Math.max(next[1], next[2])
        : dominant === 1
          ? Math.max(next[0], next[2])
          : Math.max(next[0], next[1])
      const target = otherMax + (strength === 'extra' ? 0 : strength === 'strong' ? 6 : 18)
      next[dominant] = Math.min(next[dominant], Math.round(next[dominant] * (1 - blend) + target * blend))
      updates.push([offset, next[0], next[1], next[2]])
    }
  }

  updates.forEach(([offset, r, g, b]) => {
    data[offset] = Math.round(r)
    data[offset + 1] = Math.round(g)
    data[offset + 2] = Math.round(b)
  })
}

function isNearTransparent(data, width, height, x, y, radius) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      if (data[(ny * width + nx) * 4 + 3] === 0) return true
    }
  }
  return false
}

function getSampleColors(settings, fallbackColor) {
  const colors = (settings.chromaSamples || []).map(sample => sample.color).filter(Boolean)
  if (!colors.length && fallbackColor) colors.push(fallbackColor)
  return colors.map(hexToRgb)
}

function pushNeighbor(idx, visited, queue, incrementTail) {
  if (visited[idx]) return
  visited[idx] = 1
  const tail = incrementTail()
  queue[tail] = idx
}

function colorDistance(pr, pg, pb, kr, kg, kb) {
  return Math.sqrt((pr - kr) ** 2 + (pg - kg) ** 2 + (pb - kb) ** 2)
}

function minSampleDistance(r, g, b, sampleColors) {
  return sampleColors.reduce((min, sample) => Math.min(min, colorDistance(r, g, b, sample.r, sample.g, sample.b)), Infinity)
}

function nearestSampleColor(r, g, b, sampleColors) {
  return sampleColors.reduce((best, sample) => {
    const dist = colorDistance(r, g, b, sample.r, sample.g, sample.b)
    return dist < best.dist ? { sample, dist } : best
  }, { sample: sampleColors[0], dist: Infinity }).sample
}

function isNeutralLightSample(sampleColors) {
  const avg = sampleColors.reduce((acc, sample) => ({
    r: acc.r + sample.r,
    g: acc.g + sample.g,
    b: acc.b + sample.b,
  }), { r: 0, g: 0, b: 0 })
  avg.r /= sampleColors.length
  avg.g /= sampleColors.length
  avg.b /= sampleColors.length
  const max = Math.max(avg.r, avg.g, avg.b)
  const min = Math.min(avg.r, avg.g, avg.b)
  return max > 210 && max - min < 28
}

function isLightLowSaturation(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max > 180 && max - min < 42
}

function chromaAlpha(dist, tHard, tSoft, edgeSmooth) {
  if (dist <= tHard) return 0
  if (dist > tSoft) return 255
  const span = Math.max(tSoft - tHard, 1)
  const p = (dist - tHard) / span
  return Math.round((edgeSmooth ? p * p * (3 - 2 * p) : p) * 255)
}

function dominantChannel(r, g, b) {
  const max = Math.max(r, g, b)
  if (r === max) return 0
  if (g === max) return 1
  return 2
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
