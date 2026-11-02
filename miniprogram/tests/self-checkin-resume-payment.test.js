const assert = require('node:assert/strict')
const { validateSelfCheckinStep } = require('../utils/self-checkin-flow')
const drafts = require('../utils/self-checkin-drafts')
const payment = require('../utils/self-checkin-payment')
const { selfCheckinApi } = require('../utils/self-checkin-api')

let definition
global.Page = (value) => { definition = value }
require('../pages/index/index')
const page = { ...definition, data: { ...definition.data, form: { ...definition.data.form } } }
page.setData = function (patch, callback) {
  this.data = { ...this.data, ...patch }
  if (callback) callback()
}
page._uploaded = {}
page._uploadIds = { signature: 1 }
page._signatureHasInk = false
page.persistDraftSnapshot = () => {}
page.initSignatureCanvas = () => {}
page.data = {
  ...page.data,
  screen: 'form',
  testMode: false,
  context: { id: 'record-1', token: 'test-token', rules_version: 'v1', phone_last4: '8000' },
  rules: { items: [{ id: 'r1', title: 'Title', body: 'Body' }] },
}
const originals = {
  fileExists: drafts.fileExists,
  callPayment: payment.callPayment,
  uploadGuestSignature: selfCheckinApi.uploadGuestSignature,
  submitGuest: selfCheckinApi.submitGuest,
}

async function run() {
  try {
    drafts.fileExists = async (path) => path === '/saved/signature.png'
    let statusCalls = 0
    payment.callPayment = async (action) => {
      assert.equal(action, 'status')
      statusCalls += 1
      return { status: 'paid' }
    }
    const draft = {
      rulesVersion: 'v1',
      step: 4,
      state: {
        form: { guest_name: 'Guest', country_code: '+86', contact: '13800138000', police_code: '123456', police_completed_confirmed: true },
        confirmedRuleIds: ['r1'], rulesFinalConfirmed: true,
        documentType: 'mainland_id', docTypeConfirmed: true, paymentChannel: 'wechat',
      },
      files: { signature: '/saved/signature.png' },
    }
    await page.restoreDraft(page.data.context, draft)
    assert.equal(page.data.step, 4)
    assert.equal(page.data.signatureLocalPath, '/saved/signature.png')
    assert.equal(page._signatureHasInk, false)
    assert.equal(validateSelfCheckinStep(2, page.data.documentType, page.currentState()), '')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(page.data.paymentStatus, 'paid')
    assert.equal(statusCalls, 1)

    let uploadedSource = ''
    selfCheckinApi.uploadGuestSignature = async (_id, path) => {
      uploadedSource = path
      return 'uploaded/signature.png'
    }
    selfCheckinApi.submitGuest = async () => ({ signature_record_id: 'signed-1' })
    page.canvasToTempFile = async () => { throw new Error('canvas must not be needed') }
    drafts.removeDraft = () => {}
    await page.submitCheckin()
    assert.equal(page.data.screen, 'submitted')
    assert.equal(page.data.errorText, '')
    assert.equal(uploadedSource, '/saved/signature.png')
    assert.equal(statusCalls, 3, 'restore and both submit payment checks use current status')
  } finally {
    drafts.fileExists = originals.fileExists
    payment.callPayment = originals.callPayment
    selfCheckinApi.uploadGuestSignature = originals.uploadGuestSignature
    selfCheckinApi.submitGuest = originals.submitGuest
  }
  console.log('self-check-in resume payment assertions passed')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
