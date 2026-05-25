/**
 * Spine 动画导出工具
 * 生成 Spine 4.2 格式的 skeleton.json + images/*.png ZIP
 */
import JSZip from 'jszip'

/**
 * 构建 Spine skeleton JSON 数据
 */
export function buildSpineJson({ baseName, frames, width, height, fps, skeletonName, animationName, slotName }) {
  const attachments = {}
  const timeline = []

  for (let i = 0; i < frames.length; i++) {
    const frameName = `${baseName}-spine-${String(i + 1).padStart(3, '0')}`
    attachments[frameName] = {
      type: 'region',
      path: `images/${frameName}`,
      x: 0,
      y: 0,
      width,
      height,
    }
    if (i > 0) {
      timeline.push({
        time: Number((i / Math.max(fps, 1)).toFixed(6)),
        name: frameName,
      })
    }
  }

  return {
    skeleton: {
      name: skeletonName,
      spine: '4.2.0',
      images: './images/',
    },
    bones: [{ name: 'root' }],
    slots: [{
      name: slotName,
      bone: 'root',
      attachment: `${baseName}-spine-001`,
    }],
    skins: [{
      name: 'default',
      attachments: {
        [slotName]: attachments,
      },
    }],
    animations: {
      [animationName]: {
        slots: {
          [slotName]: {
            attachment: timeline,
          },
        },
      },
    },
  }
}

/**
 * 构建 Spine ZIP 包
 * @param {Object} options
 * @param {string} options.baseName - 文件基础名
 * @param {ImageData[]} options.frames - 帧数据（已处理透明）
 * @param {number} options.width - 帧宽
 * @param {number} options.height - 帧高
 * @param {number} options.fps - 帧率
 * @param {string} options.skeletonName - 骨骼名
 * @param {string} options.animationName - 动画名
 * @param {string} options.slotName - 插槽名
 * @param {function} options.onProgress - 进度回调
 * @returns {Promise<Blob>}
 */
export async function buildSpineZip({ baseName, frames, width, height, fps, skeletonName, animationName, slotName, onProgress }) {
  const zip = new JSZip()

  // JSON
  const jsonData = buildSpineJson({ baseName, frames, width, height, fps, skeletonName, animationName, slotName })
  zip.file(`${baseName}-spine.json`, JSON.stringify(jsonData, null, 2))

  // README
  const readme = [
    'Spine 动画导出说明',
    '',
    '此 ZIP 包包含：',
    `- ${baseName}-spine.json`,
    '- images/*.png',
    '',
    '导入建议：',
    '1. 将 ZIP 解压到本地目录。',
    '2. 在 Spine 中使用 Import Data 导入 JSON。',
    '3. 保持 JSON 文件与 images 文件夹的相对路径不变。',
    '',
    '当前导出参数：',
    `- skeleton: ${skeletonName}`,
    `- animation: ${animationName}`,
    `- slot: ${slotName}`,
    `- fps: ${fps}`,
    `- frames: ${frames.length}`,
  ].join('\n')
  zip.file('README.txt', readme)

  // 帧图片
  for (let i = 0; i < frames.length; i++) {
    const frameData = frames[i]
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    // 如果帧尺寸和目标不一致，缩放绘制
    if (frameData.width !== width || frameData.height !== height) {
      const srcCanvas = document.createElement('canvas')
      srcCanvas.width = frameData.width
      srcCanvas.height = frameData.height
      srcCanvas.getContext('2d').putImageData(frameData, 0, 0)
      ctx.drawImage(srcCanvas, 0, 0, frameData.width, frameData.height, 0, 0, width, height)
    } else {
      ctx.putImageData(frameData, 0, 0)
    }
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
    const frameName = `${baseName}-spine-${String(i + 1).padStart(3, '0')}`
    zip.file(`images/${frameName}.png`, blob)
    if (onProgress) onProgress(i + 1, frames.length)
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}
