const assert = require('node:assert/strict')

let definition
global.Page = (value) => { definition = value }
const modulePath = require.resolve('../pages/index/index')
delete require.cache[modulePath]
require(modulePath)

const canvas = {
  width: 0,
  height: 0,
  createImage() {
    const image = { width: 1200, height: 900 }
    Object.defineProperty(image, 'src', { set() { queueMicrotask(() => image.onload()) } })
    return image
  },
  getContext() { return { clearRect() {}, drawImage() {} } },
}

const chooseCalls = []
let outputNumber = 0
global.wx = {
  env: { USER_DATA_PATH: '/tmp/user' },
  getFileSystemManager() { return { copyFile(options) { options.success() }, unlink() {} } },
  chooseImage(options) { chooseCalls.push(options) },
  getImageInfo(options) { options.success({ width: 1200, height: 900 }) },
  canvasToTempFilePath(options) { options.success({ tempFilePath: `/tmp/photo-${++outputNumber}.jpg` }) },
  getFileInfo(options) { options.success({ size: 100_000 }) },
  showLoading() {},
  hideLoading() {},
}

const page = {
  ...definition,
  data: {
    ...definition.data,
    locale: 'en-US',
    step: 3,
    documentType: 'passport',
    docTypeConfirmed: true,
    submitting: false,
    photoProcessing: false,
    context: { id: 'record-id' },
    foreignCopy: { compressionError: 'photo error', missingError: 'missing documents' },
    depositCopy: { compressionError: 'deposit photo error' },
  },
  _uploaded: { passportPath: 'old-passport', visaOrEntryPath: 'old-visa', depositProofPath: 'old-deposit' },
  _uploadIds: { signature: 1, passport: 2, 'visa-or-entry': 3, deposit: 4 },
  setData(changes, callback) {
    this.data = { ...this.data, ...changes }
    if (callback) callback()
  },
  getPhotoCanvas: async () => canvas,
}

async function choose(kind, filePath) {
  page.choosePhoto({ currentTarget: { dataset: { kind } } })
  const options = chooseCalls.at(-1)
  await options.success({ tempFilePaths: [filePath] })
}

async function run() {
  await choose('passport', '/tmp/passport.jpg')
  assert.match(page.data.passportPhoto, /^\/tmp\/user\/self-checkin-draft-record-id-passport-/)
  assert.equal(page.data.visaOrEntryPhoto, '')
  assert.equal(page.data.depositProofPhoto, '')
  assert.equal(page._uploaded.passportPath, '')
  assert.equal(page._uploaded.visaOrEntryPath, 'old-visa')

  await choose('visaOrEntry', '/tmp/visa.jpg')
  assert.match(page.data.visaOrEntryPhoto, /^\/tmp\/user\/self-checkin-draft-record-id-visa-or-entry-/)
  assert.equal(page.data.depositProofPhoto, '')
  assert.equal(page._uploaded.visaOrEntryPath, '')
  page.goNext()
  assert.equal(page.data.step, 4)

  await choose('depositProof', '/tmp/deposit.jpg')
  assert.match(page.data.depositProofPhoto, /^\/tmp\/user\/self-checkin-draft-record-id-deposit-/)
  assert.equal(page._uploaded.depositProofPath, '')
  assert.deepEqual(chooseCalls.map((call) => call.sourceType), [
    ['album', 'camera'], ['album', 'camera'], ['album'],
  ])
  const callCount = chooseCalls.length
  page.choosePhoto({ currentTarget: { dataset: { kind: 'unexpected' } } })
  assert.equal(chooseCalls.length, callCount)

  page.signatureContext = { beginPath() {}, moveTo() {} }
  page._signatureSize = { width: 100, height: 100 }
  page.data.rulesFinalConfirmed = true
  page._uploaded.signaturePath = 'old-signature'
  page._uploadIds.signature = 1
  page.signatureStart({ changedTouches: [{ x: 1, y: 2 }] })
  assert.equal(page._uploaded.signaturePath, '')
  assert.notEqual(page._uploadIds.signature, 1)

  delete global.wx
  delete global.Page
  console.log('self-checkin photo upload tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
