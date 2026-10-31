const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const copyData = require('../data/self-checkin-copy')
const { selfCheckinApi } = require('../utils/self-checkin-api')

function loadPage(envVersion) {
  let definition
  global.wx = { getAccountInfoSync: () => ({ miniProgram: { envVersion } }) }
  global.Page = (value) => { definition = value }
  const modulePath = require.resolve('../pages/index/index')
  delete require.cache[modulePath]
  require(modulePath)
  const page = { ...definition }
  page.data = {
    ...definition.data,
    form: { ...definition.data.form },
    screen: 'code',
    locale: 'zh-CN',
    text: copyData.locales['zh-CN'],
    accessCode: definition.data.accessCode,
  }
  page.setData = function setData(changes, callback) {
    this.data = { ...this.data, ...changes }
    if (callback) callback()
  }
  return page
}

async function run() {
  const markup = readFileSync(require.resolve('../pages/index/index.wxml'), 'utf8')
  assert.match(markup, /src="\/assets\/police-registration-qr\.png"/, 'police QR must use the app-compatible PNG asset')
  assert.match(markup, /class="deposit-qr-image"[^>]*data-path="\/assets\/self-checkin-deposit\.png" bindtap="previewQrImage"/, 'deposit QR tap opens the image preview')
  assert.match(markup, /value="{{form.guest_name}}" disabled/, 'guest name must be read-only')
  assert.doesNotMatch(markup, /submittedEditEnabled|submittedEditOpen|submittedEditPanel|修改登记信息/, 'submitted success page must not offer editing')
  assert.doesNotMatch(markup, /nameCorrectionHint/, 'submitted page does not show an extra correction note')
  assert.equal(typeof selfCheckinApi.updatePublicContactAndPolice, 'undefined', 'mini program must not expose the post-submit edit API')
  assert.doesNotMatch(readFileSync(require.resolve('../utils/guest-transport'), 'utf8'), /update_self_checkin_public_contact_and_police/, 'the edit RPC must be removed from guest relay allowlist')
  assert.doesNotMatch(markup, /show-menu-by-longpress|openQrShareMenu|saveQrImage/, 'QR interactions do not use the old share handler or a page save button')
  let entryContextReads = 0
  let accessCodeReads = 0
  let writes = 0
  const originalGetEntry = selfCheckinApi.getPublicEntryContext
  const originalGetAccessCodeContext = selfCheckinApi.getPublicContextByAccessCode
  const originalSubmit = selfCheckinApi.submitGuest
  const originalUpload = selfCheckinApi.uploadGuestSignature
  selfCheckinApi.getPublicEntryContext = async () => {
    entryContextReads += 1
    return { store_id: 'sifang', checkin_date: '2026-10-20', rules_locale: { items: [{ id: 'r1', title: '须知', body: '请遵守须知' }] } }
  }
  selfCheckinApi.getPublicContextByAccessCode = async (code) => {
    accessCodeReads += 1
    assert.equal(code, '654321')
    return { state: 'active', context: { id: 'real-task-id', token: 'real-task-token', access_code: code, guest_name: 'Real Guest', contact: '', rules_locale: { items: [{ id: 'r1', title: '须知', body: '请遵守须知' }] } } }
  }
  selfCheckinApi.submitGuest = async () => { writes += 1 }
  selfCheckinApi.uploadGuestSignature = async () => { writes += 1 }

  try {
    const developmentPage = loadPage('develop')
    assert.equal(developmentPage.data.accessCode, '', 'development builds must not prefill a shared test code')
    let previewOptions
    global.wx.previewImage = (options) => { previewOptions = options }
    developmentPage.previewQrImage({ currentTarget: { dataset: { path: '/assets/self-checkin-deposit.png' } } })
    assert.deepEqual(previewOptions, {
      current: '/assets/self-checkin-deposit.png',
      urls: ['/assets/self-checkin-deposit.png'],
      showmenu: true,
    }, 'deposit QR tap should open the native preview with long-press menu enabled')
    developmentPage.setData({ accessCode: '654321' })
    await developmentPage.submitCode()
    assert.equal(developmentPage.data.screen, 'form', 'a staff-issued access code should open the real registration flow')
    assert.equal(developmentPage.data.testMode, false)
    assert.equal(entryContextReads, 0, 'production flow must not load the test-only rules context')
    assert.equal(accessCodeReads, 1, 'the entered access code must use the production lookup')
    assert.equal(developmentPage.data.context.id, 'real-task-id')
    assert.equal(writes, 0, 'lookup must not upload or submit a record')

    const releasePage = loadPage('release')
    assert.equal(releasePage.data.accessCode, '', 'release builds must also begin without a shared test code')
  } finally {
    selfCheckinApi.getPublicEntryContext = originalGetEntry
    selfCheckinApi.getPublicContextByAccessCode = originalGetAccessCodeContext
    selfCheckinApi.submitGuest = originalSubmit
    selfCheckinApi.uploadGuestSignature = originalUpload
  }

  console.log('self-check-in local test flow assertions passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
