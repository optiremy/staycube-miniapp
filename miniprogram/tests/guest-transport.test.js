const test = require('node:test')
const assert = require('node:assert/strict')
const { requestGuest } = require('../utils/guest-transport')

test('allowlisted RPC retries through the fixed relay after direct network failure', async () => {
  const calls = []
  global.wx = {
    request(options) {
      calls.push(options)
      if (calls.length === 1) options.fail({ errMsg: 'request:fail timeout' })
      else options.success({ statusCode: 200, data: [{ id: 'record-1' }] })
    },
  }
  const data = await requestGuest('/rest/v1/rpc/submit_pre_arrival_v2', { p_request_id: 'request-1' }, 100)
  assert.deepEqual(data, [{ id: 'record-1' }])
  assert.equal(calls.length, 2)
  assert.match(calls[1].url, /\.netlify\.app\/.netlify\/functions\/guest-relay$/)
  assert.equal(calls[1].header['x-guest-relay-operation'], 'rpc:submit_pre_arrival_v2')
})

test('non-allowlisted and rate-limited requests are not replayed', async () => {
  let calls = 0
  global.wx = { request(options) { calls++; options.success({ statusCode: 429, data: {} }) } }
  await assert.rejects(requestGuest('/rest/v1/rpc/staff_delete_record', {}, 100))
  await assert.rejects(requestGuest('/rest/v1/rpc/submit_pre_arrival_v2', {}, 100))
  assert.equal(calls, 2)
})

test('self-check-in lookup uses the fixed relay allowlist and post-submit correction is rejected', async () => {
  const operations = []
  let calls = 0
  global.wx = { request(options) {
    calls++
    if (calls % 2 === 1) options.fail({ errMsg: 'request:fail timeout' })
    else {
      operations.push(options.header['x-guest-relay-operation'])
      options.success({ statusCode: 200, data: { state: 'not_found' } })
    }
  } }
  await requestGuest('/rest/v1/rpc/lookup_self_checkin_public_context_by_access_code', { p_access_code: '123456', p_locale: 'zh-CN' }, 100)
  await assert.rejects(requestGuest('/rest/v1/rpc/update_self_checkin_public_contact_and_police', { p_access_code: '123456' }, 100))
  assert.deepEqual(operations, [
    'rpc:lookup_self_checkin_public_context_by_access_code',
  ])
})

test('self-check-in payment retries through the relay and keeps the service error code', async () => {
  const { callPayment } = require('../utils/self-checkin-payment')
  const calls = []
  global.wx = {
    request(options) {
      calls.push(options)
      if (calls.length === 1) options.fail({ errMsg: 'request:fail timeout' })
      else if (calls.length === 2) options.success({ statusCode: 200, data: { status: 'other_available' } })
      else options.success({ statusCode: 409, data: { code: 'PAYMENT_ALREADY_PAID' } })
    },
  }
  assert.deepEqual(await callPayment('switch', 'token-1'), { status: 'other_available' })
  assert.equal(calls[1].header['x-guest-relay-operation'], 'function:self-checkin-payment:switch')
  assert.deepEqual(calls[1].data, { token: 'token-1' })
  await assert.rejects(callPayment('status', 'token-1'), /PAYMENT_ALREADY_PAID/)
  assert.equal(calls.length, 3)
})
