const assert = require('assert')
const config = require('../config')
const testMode = require('../utils/test-mode')
const { PreArrivalApiError, preArrivalApi } = require('../utils/pre-arrival-api')

const input = {
  locale: 'zh-CN',
  guestName: ' 张三 ',
  contactMethod: 'phone',
  contactValue: ' 13800138000 ',
  arrivalTime: '18:00',
  bedPreference: 'lower',
  guestNote: '  靠窗  ',
  requestId: '10000000-0000-4000-8000-000000000001',
}

async function run() {
  testMode.enabled = false
  const originalWx = global.wx
  const originalKey = config.cloudbasePublishableKey
  config.cloudbasePublishableKey = 'test-publishable'
  let request
  global.wx = { request(options) { request = options; options.success({ statusCode: 200, data: [{ id: 'test-record-id', status: 'submitted' }] }) } }
  const result = await preArrivalApi.submit(input)
  assert.deepStrictEqual(result, { id: 'test-record-id', status: 'submitted' })
  assert.match(request.url, /staycube-prod-d0g2d759v95954cd6\.api\.tcloudbasegateway\.com\/v1\/rdb\/rest\/rpc\/submit_pre_arrival_v2$/)
  assert.deepStrictEqual(request.data, {
    p_request_id: input.requestId,
    p_locale: 'zh-CN', p_guest_name: '张三', p_contact_method: 'phone', p_contact_value: '13800138000',
    p_arrival_time: '18:00', p_bed_preference: 'lower', p_guest_note: '靠窗',
  })

  let failed = false
  let calls = 0
  global.wx = { request(options) { calls++; options.fail({ errMsg: 'request:fail timeout' }) } }
  try { await preArrivalApi.submit(input) } catch (error) { failed = error instanceof PreArrivalApiError && ['network', 'timeout'].includes(error.kind) }
  assert.strictEqual(failed, true)
  assert.equal(calls, 1, '网络故障时直接报错，不经其他站点重试')

  global.wx = originalWx
  config.cloudbasePublishableKey = originalKey
  testMode.enabled = true
  console.log('pre-arrival API contract tests passed')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
