const test = require('node:test')
const assert = require('node:assert/strict')
const config = require('../config')
const { requestGuest, uploadGuestFile } = require('../utils/guest-transport')

// 旅客请求只发往当前后端（正式默认腾讯云），失败时不转发到任何中转站点。
const gateway = `https://${config.cloudbaseEnvId}.api.tcloudbasegateway.com`

test('direct RPC failure is reported, never replayed through another host', async () => {
  const calls = []
  global.wx = { request(options) { calls.push(options); options.fail({ errMsg: 'request:fail timeout' }) } }
  await assert.rejects(requestGuest('/rest/v1/rpc/submit_pre_arrival_v2', { p_request_id: 'request-1' }, 100), error => error.kind === 'timeout')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `${gateway}/v1/rdb/rest/rpc/submit_pre_arrival_v2`)
})

test('upload failure is reported, never replayed through another host', async () => {
  const calls = []
  global.wx = { uploadFile(options) { calls.push(options); options.success({ statusCode: 503, data: '{"message":"busy"}' }) } }
  await assert.rejects(uploadGuestFile('luggage-storage-photos', 'luggage-storage/a/photo-1.jpg', '/tmp/p.jpg', 'image/jpeg', 100), error => error.kind === 'service')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `${gateway}/v1/storages/object/luggage-storage-photos/luggage-storage/a/photo-1.jpg`)
})

test('cloud function calls go to the gateway as an event and unwrap the function result', async () => {
  const { callPayment } = require('../utils/self-checkin-payment')
  const calls = []
  const answers = [{ statusCode: 200, body: '{"status":"other_available"}' }, { statusCode: 409, body: '{"code":"PAYMENT_ALREADY_PAID"}' }]
  global.wx = { request(options) { calls.push(options); options.success({ statusCode: 200, data: { headers: {}, isBase64Encoded: false, ...answers[calls.length - 1] } }) } }
  assert.deepEqual(await callPayment('switch', 'token-1'), { status: 'other_available' })
  assert.equal(calls[0].url, `${gateway}/v1/functions/self-checkin-payment`)
  assert.equal(calls[0].header.Authorization, `Bearer ${config.cloudbasePublishableKey}`)
  assert.equal(calls[0].data.httpMethod, 'POST')
  assert.equal(calls[0].data.path, '/self-checkin-payment/switch')
  assert.deepEqual(JSON.parse(calls[0].data.body), { token: 'token-1' })
  await assert.rejects(callPayment('status', 'token-1'), /PAYMENT_ALREADY_PAID/)
  assert.equal(calls.length, 2)
})

test('a gateway refusal keeps its code and is not retried', async () => {
  const calls = []
  global.wx = { request(options) { calls.push(options); options.success({ statusCode: 403, data: { code: 'EXCEED_AUTHORITY' } }) } }
  await assert.rejects(requestGuest('/functions/v1/deposit-payment/status', { requestId: 'r', token: 't' }, 100), error => error.statusCode === 403 && error.data.code === 'EXCEED_AUTHORITY')
  assert.equal(calls.length, 1)
})
