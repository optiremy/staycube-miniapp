const assert = require('node:assert/strict')
const testMode = require('../utils/test-mode')
const { preArrivalApi } = require('../utils/pre-arrival-api')
const { luggageStorageApi } = require('../utils/luggage-storage-api')
const { selfCheckinApi } = require('../utils/self-checkin-api')

async function run() {
  assert.equal(testMode.enabled, false, 'guest flows must use production APIs')
  const requests = []
  const uploads = []
  const originalWx = global.wx
  global.wx = {
    request(options) {
      requests.push(options)
      const data = options.url.endsWith('create_luggage_storage_public_draft_v2')
        ? [{ id: 'draft-id', token: 'draft-token' }]
        : options.url.endsWith('submit_luggage_storage_record')
          ? [{ id: 'luggage-id', status: 'submitted' }]
          : options.url.endsWith('submit_pre_arrival_v2')
            ? [{ id: 'arrival-id', status: 'submitted' }]
            : [{ id: 'checkin-id', status: 'submitted' }]
      options.success({ statusCode: 200, data })
    },
    uploadFile(options) {
      uploads.push(options)
      options.success({ statusCode: 200, data: JSON.stringify({ Key: 'uploaded/object.jpg' }) })
    },
  }

  try {
    const arrival = await preArrivalApi.submit({
      locale: 'zh-CN', guestName: '测试', contactMethod: 'phone', contactValue: '13800138000',
      arrivalTime: '18:00', bedPreference: 'all', guestNote: '',
    })
    assert.equal(arrival.status, 'submitted')

    const draft = await luggageStorageApi.createDraft()
    assert.equal(draft.id, 'draft-id')
    assert.match(await luggageStorageApi.uploadPhoto(draft.id, '/tmp/photo.jpg'), /^luggage-storage\/draft-id\/photo-/)
    assert.equal((await luggageStorageApi.submit(draft.token, {})).status, 'submitted')

    assert.match(await selfCheckinApi.uploadGuestSignature('checkin-id', '/tmp/signature.png'), /^self-checkin\/checkin-id\/signature-/)
    assert.match(await selfCheckinApi.uploadGuestForeignDocument('checkin-id', 'passport', '/tmp/passport.jpg'), /^self-checkin-documents\/checkin-id\/passport-/)
    assert.match(await selfCheckinApi.uploadGuestDepositProof('checkin-id', '/tmp/deposit.jpg'), /^self-checkin-documents\/checkin-id\/deposit-/)
    const submitted = await selfCheckinApi.submitGuest('checkin-token', {})
    assert.equal((Array.isArray(submitted) ? submitted[0] : submitted).status, 'submitted')
    assert.equal(requests.length, 4)
    assert.equal(uploads.length, 4)
    assert.ok(requests.every(({ url }) => url.startsWith('https://')))
    assert.ok(uploads.every(({ url }) => url.startsWith('https://')))
  } finally {
    global.wx = originalWx
  }
  console.log('production guest API integration assertions passed')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
