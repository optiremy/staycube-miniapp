const assert = require('node:assert/strict')
const { compressImageToLimit } = require('../utils/image-processing')

async function run() {
  const draws = []
  const sizes = new Map()
  let imageSource = ''
  const canvas = {
    width: 0,
    height: 0,
    createImage() {
      const image = { width: 4000, height: 3000 }
      Object.defineProperty(image, 'src', { set(value) { imageSource = value; queueMicrotask(() => image.onload()) } })
      return image
    },
    getContext() { return { clearRect() {}, drawImage(image, x, y, width, height) { draws.push({ width, height }) } } },
  }
  const wxApi = {
    getImageInfo(options) { options.success({ width: 4000, height: 3000, type: 'heic' }) },
    canvasToTempFilePath(options) {
      const output = `/tmp/${options.destWidth}x${options.destHeight}-${options.quality}.jpg`
      sizes.set(output, options.destWidth >= 2000 ? 2_000_000 : 800_000)
      options.success({ tempFilePath: output })
    },
    getFileInfo(options) { options.success({ size: sizes.get(options.filePath) }) },
  }
  const path = await compressImageToLimit('/tmp/passport.heic', 1_000_000, {
    wxApi, canvas, maxLongEdge: 2400, minLongEdge: 1000, qualitySteps: [0.82, 0.68],
  })
  assert.equal(imageSource, '/tmp/passport.heic')
  assert.match(path, /\.jpg$/)
  assert.ok(sizes.get(path) <= 1_000_000)
  assert.ok(draws.length > 1, 'the image is resized when quality-only output remains too large')

  await assert.rejects(compressImageToLimit('/tmp/broken.jpg', 1, {
    wxApi: { getImageInfo(options) { options.fail(new Error('decode failed')) } },
    canvas,
  }), /image-processing-failed/)

  const tooLargeWx = {
    getImageInfo(options) { options.success({ width: 1000, height: 700 }) },
    canvasToTempFilePath(options) { options.success({ tempFilePath: '/tmp/still-large.jpg' }) },
    getFileInfo(options) { options.success({ size: 2_000_000 }) },
  }
  await assert.rejects(compressImageToLimit('/tmp/photo.jpg', 100, {
    wxApi: tooLargeWx,
    canvas,
    maxLongEdge: 1000,
    minLongEdge: 1000,
    qualitySteps: [0.5],
  }), /image-too-large/)
}

run().then(() => console.log('image processing tests passed')).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
