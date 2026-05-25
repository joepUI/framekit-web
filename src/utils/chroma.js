import { hexToRgb } from './format.js'

/**
 * 对 ImageData 做色键去背景
 * @param {ImageData} imageData
 * @param {string} colorHex  背景色 hex
 * @param {number} tolerance  容差 0-255
 * @param {number} smooth     羽化 0-10
 * @param {boolean} despill   去溢色
 * @returns {ImageData} 处理后的 ImageData（in-place）
 */
export function applyChroma(imageData, colorHex, tolerance, smooth, despill, edgeSmooth = false) {
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
