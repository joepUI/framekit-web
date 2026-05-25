/**
 * 精灵图编辑器工具函数
 */

/**
 * 深拷贝 ImageData
 */
export function copyImageData(imageData) {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  )
}

/**
 * 从 File 加载图片，返回 { imageData, width, height, url }
 */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      const imageData = canvas.getContext('2d').getImageData(0, 0, img.naturalWidth, img.naturalHeight)
      resolve({ imageData, width: img.naturalWidth, height: img.naturalHeight, url })
    }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

/**
 * 检测 ImageData 是否有非透明像素
 */
function hasVisiblePixels(imageData) {
  const data = imageData.data
  // 每4字节一个像素，第4字节是 alpha
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) return true
  }
  return false
}

/**
 * 按列数切割精灵图，支持非方形帧（通过 heightRatio 控制）
 * 自动过滤完全空白（无任何像素）的帧
 * @param heightRatio - 行高比例，默认1（方形），如1.5表示帧高=帧宽×1.5
 * @returns { frames: {imageData}[], frameW, frameH, rows }
 */
export function splitSpriteSheet(sourceImageData, cols, heightRatio = 1) {
  const { width, height } = sourceImageData
  const frameW = Math.floor(width / cols)
  const frameH = Math.round(frameW * heightRatio)
  // 用 ceil 处理末尾不足一行的帧，hasVisiblePixels 会过滤全透明空帧
  const rows = frameH > 0 ? Math.ceil(height / frameH) : 0

  // 一次性把源图绘制到 canvas，再逐帧裁剪（比反复 putImageData 快）
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = width
  srcCanvas.height = height
  srcCanvas.getContext('2d').putImageData(sourceImageData, 0, 0)

  const frames = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = document.createElement('canvas')
      c.width = frameW
      c.height = frameH
      c.getContext('2d').drawImage(srcCanvas, col * frameW, row * frameH, frameW, frameH, 0, 0, frameW, frameH)
      const imageData = c.getContext('2d').getImageData(0, 0, frameW, frameH)
      // 跳过完全空白的帧
      if (hasVisiblePixels(imageData)) {
        frames.push({ imageData })
      }
    }
  }

  return { frames, frameW, frameH, rows }
}

/**
 * 水平镜像（左右翻转）单帧
 */
export function mirrorFrameH(imageData) {
  const { width, height } = imageData
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = width
  srcCanvas.height = height
  srcCanvas.getContext('2d').putImageData(imageData, 0, 0)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.translate(width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(srcCanvas, 0, 0)
  return ctx.getImageData(0, 0, width, height)
}

/**
 * 将 ImageData 转为 dataURL，用于 img src（缩略图渲染）
 */
export function imageDataToUrl(imageData) {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  canvas.getContext('2d').putImageData(imageData, 0, 0)
  return canvas.toDataURL()
}

/**
 * 编辑前推入 undo 历史栈（最多保留 50 步）
 */
export function pushHistory(frames, history) {
  const snapshot = frames.map(f => ({ imageData: copyImageData(f.imageData) }))
  const next = [...history, snapshot]
  return next.length > 50 ? next.slice(-50) : next
}
