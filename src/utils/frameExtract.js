/**
 * 从 video 元素提取指定时间点的帧，返回 ImageData
 * cropRect: { x, y, w, h } 相对于视频原始分辨率的裁剪区域
 * outW, outH: 输出每帧的像素尺寸
 */
export function extractFrame(video, time, cropRect, outW, outH) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`seek timeout at ${time}`)), 8000)

    const onSeeked = () => {
      clearTimeout(timeout)
      video.removeEventListener('seeked', onSeeked)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = outW
        canvas.height = outH
        const ctx = canvas.getContext('2d')

        if (cropRect) {
          const { x, y, w, h } = cropRect
          ctx.drawImage(video, x, y, w, h, 0, 0, outW, outH)
        } else {
          ctx.drawImage(video, 0, 0, outW, outH)
        }

        const imageData = ctx.getImageData(0, 0, outW, outH)
        resolve({ imageData, canvas })
      } catch (e) {
        reject(e)
      }
    }

    video.addEventListener('seeked', onSeeked)
    video.currentTime = time
  })
}

/**
 * 生成序列帧表
 * frames: 每帧的 { imageData } 列表
 * rows, cols, frameW, frameH
 * transparent: 是否透明背景
 * gap: 帧间距（像素），默认 0
 * 返回 canvas
 */
export function buildSheet(frames, rows, cols, frameW, frameH, transparent = false, gap = 0) {
  const canvas = document.createElement('canvas')
  canvas.width = cols * frameW + (cols - 1) * gap
  canvas.height = rows * frameH + (rows - 1) * gap
  const ctx = canvas.getContext('2d')

  if (!transparent) {
    ctx.fillStyle = '#f5ead0'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  frames.forEach((f, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const x = col * (frameW + gap)
    const y = row * (frameH + gap)
    // 先把 ImageData 放到原始尺寸的临时 canvas
    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = f.imageData.width
    srcCanvas.height = f.imageData.height
    srcCanvas.getContext('2d').putImageData(f.imageData, 0, 0)
    // 再缩放绘制到目标位置
    ctx.drawImage(srcCanvas, 0, 0, f.imageData.width, f.imageData.height, x, y, frameW, frameH)
  })

  return canvas
}
