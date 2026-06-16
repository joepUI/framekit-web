import test from 'node:test'
import assert from 'node:assert/strict'
import { applyChroma, applyChromaKey } from './chroma.js'

function makeImageData(width, height, pixels) {
  const data = new Uint8ClampedArray(width * height * 4)
  pixels.forEach(([r, g, b, a = 255], idx) => {
    const i = idx * 4
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  })
  return { width, height, data }
}

function alphaAt(imageData, x, y) {
  return imageData.data[(y * imageData.width + x) * 4 + 3]
}

function pixelAt(imageData, x, y) {
  const i = (y * imageData.width + x) * 4
  return Array.from(imageData.data.slice(i, i + 4))
}

test('connected chroma removes only the sampled connected background', () => {
  const white = [255, 255, 255]
  const blue = [0, 180, 255]
  const imageData = makeImageData(5, 5, [
    white, white, white, white, white,
    white, blue,  blue,  blue,  white,
    white, blue,  white, blue,  white,
    white, blue,  blue,  blue,  white,
    white, white, white, white, white,
  ])

  applyChroma(imageData, '#ffffff', 8, 0, false, false, {
    mode: 'connected',
    samples: [{ x: 0, y: 0, color: '#ffffff' }],
  })

  assert.equal(alphaAt(imageData, 0, 0), 0)
  assert.equal(alphaAt(imageData, 2, 2), 255)
  assert.equal(alphaAt(imageData, 1, 1), 255)
})

test('edge trim removes sampled-color fringe near transparent area but keeps dark outline', () => {
  const transparentGreen = [0, 255, 0, 0]
  const greenFringe = [0, 150, 0]
  const darkOutline = [5, 5, 5]
  const imageData = makeImageData(3, 1, [
    transparentGreen,
    greenFringe,
    darkOutline,
  ])

  applyChromaKey(imageData, {
    chromaColor: '#00ff00',
    tolerance: 30,
    smooth: 14,
    despill: true,
    edgeSmooth: true,
    edgeTrim: 1,
    edgeClean: 'off',
  })

  assert.equal(alphaAt(imageData, 1, 0), 0)
  assert.equal(alphaAt(imageData, 2, 0), 255)
})

test('edge clean pulls polluted edge color toward nearby foreground color', () => {
  const transparentGreen = [0, 255, 0, 0]
  const greenFringe = [30, 180, 30]
  const darkOutline = [5, 5, 5]
  const imageData = makeImageData(4, 1, [
    transparentGreen,
    greenFringe,
    darkOutline,
    darkOutline,
  ])

  applyChromaKey(imageData, {
    chromaColor: '#00ff00',
    tolerance: 30,
    smooth: 14,
    despill: false,
    edgeSmooth: true,
    edgeTrim: 0,
    edgeClean: 'light',
  })

  assert.ok(pixelAt(imageData, 1, 0)[1] < 120)
  assert.equal(alphaAt(imageData, 2, 0), 255)
})

test('edge clean dims light fringe from a light sampled background', () => {
  const transparentWhite = [255, 255, 255, 0]
  const whiteFringe = [232, 232, 232]
  const darkOutline = [10, 10, 10]
  const imageData = makeImageData(3, 1, [
    transparentWhite,
    whiteFringe,
    darkOutline,
  ])

  applyChromaKey(imageData, {
    chromaColor: '#ffffff',
    tolerance: 20,
    smooth: 10,
    despill: false,
    edgeSmooth: true,
    edgeTrim: 0,
    edgeClean: 'light',
  })

  assert.ok(pixelAt(imageData, 1, 0)[0] < 215)
  assert.equal(alphaAt(imageData, 2, 0), 255)
})
