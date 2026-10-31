function callWx(wxApi, method, options) {
  return new Promise((resolve, reject) => {
    wxApi[method]({ ...options, success: resolve, fail: reject })
  })
}

function targetSizes(width, height, maxLongEdge, minLongEdge) {
  const longEdge = Math.max(width, height)
  const start = Math.min(longEdge, maxLongEdge || 2400)
  const minimum = Math.min(start, minLongEdge || 720)
  const sizes = []
  let current = start
  while (current > minimum) {
    sizes.push(current)
    current = Math.max(minimum, Math.floor(current * 0.82))
  }
  sizes.push(minimum)
  return [...new Set(sizes)].map((edge) => {
    const scale = edge / longEdge
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    }
  })
}

function loadCanvasImage(canvas, sourcePath) {
  return new Promise((resolve, reject) => {
    if (!canvas || typeof canvas.createImage !== 'function') return reject(new Error('image-processing-failed'))
    const image = canvas.createImage()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image-processing-failed'))
    image.src = sourcePath
  })
}

async function compressImageToLimit(sourcePath, maxBytes, options = {}) {
  const wxApi = options.wxApi || wx
  try {
    const info = await callWx(wxApi, 'getImageInfo', { src: sourcePath })
    if (!info.width || !info.height) throw new Error('image-processing-failed')
    const canvas = options.canvas
    const image = await loadCanvasImage(canvas, sourcePath)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('image-processing-failed')

    const sizes = targetSizes(info.width, info.height, options.maxLongEdge, options.minLongEdge)
    const qualities = options.qualitySteps || [0.86, 0.76, 0.66, 0.56]
    for (const size of sizes) {
      canvas.width = size.width
      canvas.height = size.height
      context.clearRect(0, 0, size.width, size.height)
      context.drawImage(image, 0, 0, size.width, size.height)
      for (const quality of qualities) {
        const output = await callWx(wxApi, 'canvasToTempFilePath', {
          canvas,
          fileType: 'jpg',
          quality,
          destWidth: size.width,
          destHeight: size.height,
        })
        const fileInfo = await callWx(wxApi, 'getFileInfo', { filePath: output.tempFilePath })
        if (fileInfo.size <= maxBytes) return output.tempFilePath
      }
    }
    throw new Error('image-too-large')
  } catch (error) {
    if (error && ['image-too-large', 'image-processing-failed'].includes(error.message)) throw error
    throw new Error('image-processing-failed')
  }
}

module.exports = { compressImageToLimit }
